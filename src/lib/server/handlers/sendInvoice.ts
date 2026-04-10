import { toId } from "../../utils";
import { createEmailSendHandler, formatCurrency } from "./createEmailSendHandler";

function buildDefaultInvoiceHtml(
	vars: Record<string, string>,
	siteName: string,
): string {
	return `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
<p>hi ${vars.clientName},</p>
${vars.changeNote ? `<p>your invoice has been updated (${vars.changeNote}).</p>` : "<p>a new invoice has been created for you.</p>"}
<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
<tr><td style="padding: 8px 0; color: #666;">invoice</td><td style="padding: 8px 0; text-align: right;">${vars.invoiceNumber}</td></tr>
${vars.dueDate ? `<tr><td style="padding: 8px 0; color: #666;">due date</td><td style="padding: 8px 0; text-align: right;">${vars.dueDate}</td></tr>` : ""}
</table>
<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
<thead>
<tr style="border-bottom: 1px solid #ddd;">
<th style="padding: 8px 0; text-align: left; color: #666; font-weight: normal;">description</th>
<th style="padding: 8px 0; text-align: right; color: #666; font-weight: normal;">qty</th>
<th style="padding: 8px 0; text-align: right; color: #666; font-weight: normal;">price</th>
<th style="padding: 8px 0; text-align: right; color: #666; font-weight: normal;">total</th>
</tr>
</thead>
<tbody>
${vars.lineItems}
</tbody>
<tfoot>
<tr style="border-top: 1px solid #ddd;">
<td colspan="3" style="padding: 8px 0; text-align: right; color: #666;">subtotal</td>
<td style="padding: 8px 0; text-align: right;">${vars.subtotal}</td>
</tr>
${vars.taxLine ? `<tr><td colspan="3" style="padding: 8px 0; text-align: right; color: #666;">tax</td><td style="padding: 8px 0; text-align: right;">${vars.taxLine}</td></tr>` : ""}
<tr>
<td colspan="3" style="padding: 8px 0; text-align: right; font-weight: bold;">total</td>
<td style="padding: 8px 0; text-align: right; font-weight: bold;">${vars.amount}</td>
</tr>
</tfoot>
</table>
<p>please reach out if you have any questions.</p>
<p style="color: #999; font-size: 0.85em; margin-top: 32px;">${siteName}</p>
</div>`;
}

export function createInvoiceSendHandler() {
	return createEmailSendHandler({
		docType: "invoice",
		fetchDocument: (api, convex, id) =>
			convex.query(api.invoices.get, { invoiceId: toId(id) }),
		getClientEmail: (doc) => doc.clientEmail,
		extractVars: (doc, changeNote) => {
			const total = doc.items.reduce(
				(sum: number, item: { quantity: number; unitPrice: number }) =>
					sum + item.quantity * item.unitPrice,
				0,
			);
			const taxAmount = doc.taxPercent
				? Math.round(total * (doc.taxPercent / 100))
				: 0;
			const grandTotal = total + taxAmount;

			const lineItems = doc.items
				.map(
					(item: { description: string; quantity: number; unitPrice: number }) => {
						const lineTotal = item.quantity * item.unitPrice;
						return `<tr><td style="padding: 6px 0;">${item.description}</td><td style="padding: 6px 0; text-align: right;">${item.quantity}</td><td style="padding: 6px 0; text-align: right;">${formatCurrency(item.unitPrice)}</td><td style="padding: 6px 0; text-align: right;">${formatCurrency(lineTotal)}</td></tr>`;
					},
				)
				.join("\n");

			return {
				clientName: doc.clientName ?? "there",
				invoiceNumber: doc.invoiceNumber,
				amount: formatCurrency(grandTotal),
				dueDate: doc.dueDate ?? "",
				lineItems,
				subtotal: formatCurrency(total),
				taxLine: taxAmount
					? `${formatCurrency(taxAmount)} (${doc.taxPercent}%)`
					: "",
				changeNote,
			};
		},
		buildDefaultHtml: buildDefaultInvoiceHtml,
		defaultSubject: (doc) => `invoice ${doc.invoiceNumber}`,
		markSent: (api, convex, id, siteUrl) =>
			convex.mutation(api.invoices.markSent, { invoiceId: toId(id), siteUrl }),
		fallbackCategories: ["custom"],
	});
}
