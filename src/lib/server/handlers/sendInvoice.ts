import { error, json } from "@sveltejs/kit";
import { getServerConfig } from "../../config";
import { toId } from "../../utils";
import { getConvex } from "../convexClient";
import { replaceTemplateVariables, sendEmail } from "../email";

function formatCurrency(cents: number): string {
	return `$${(cents / 100).toFixed(2)}`;
}

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
	return async ({
		params,
		request,
	}: {
		params: { id: string };
		request: Request;
	}) => {
		const config = getServerConfig();
		const { api } = config;
		const siteUrl = config.siteUrl;
		const siteName = config.siteName;
		const convex = getConvex();

		const { id } = params;
		const body = await request.json().catch(() => ({}));
		const { templateId, customSubject, customBody, changeNote } = body;

		try {
			const invoice = await convex.query(api.invoices.get, {
				invoiceId: toId(id),
			});
			if (!invoice) throw error(404, "Invoice not found");

			const clientEmail = invoice.clientEmail;
			if (!clientEmail) throw error(400, "Client has no email address");

			let subject: string;
			let html: string;

			if (customSubject && customBody) {
				subject = customSubject;
				html = customBody;
				if (!html.includes("<")) {
					html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; white-space: pre-wrap;">${html}</div>`;
				}
			} else {
				const total = invoice.items.reduce(
					(sum: number, item: { quantity: number; unitPrice: number }) =>
						sum + item.quantity * item.unitPrice,
					0,
				);
				const taxAmount = invoice.taxPercent
					? Math.round(total * (invoice.taxPercent / 100))
					: 0;
				const grandTotal = total + taxAmount;

				const lineItems = invoice.items
					.map(
						(item: {
							description: string;
							quantity: number;
							unitPrice: number;
						}) => {
							const lineTotal = item.quantity * item.unitPrice;
							return `<tr><td style="padding: 6px 0;">${item.description}</td><td style="padding: 6px 0; text-align: right;">${item.quantity}</td><td style="padding: 6px 0; text-align: right;">${formatCurrency(item.unitPrice)}</td><td style="padding: 6px 0; text-align: right;">${formatCurrency(lineTotal)}</td></tr>`;
						},
					)
					.join("\n");

				const vars: Record<string, string> = {
					clientName: invoice.clientName ?? "there",
					invoiceNumber: invoice.invoiceNumber,
					amount: formatCurrency(grandTotal),
					dueDate: invoice.dueDate ?? "",
					lineItems,
					subtotal: formatCurrency(total),
					taxLine: taxAmount
						? `${formatCurrency(taxAmount)} (${invoice.taxPercent}%)`
						: "",
					changeNote: changeNote || "",
				};

				const template = templateId
					? await convex.query(api.emailTemplates.get, { templateId })
					: (await convex.query(api.emailTemplates.getByCategory, {
							siteUrl,
							category: "booking-confirmation",
						})) ??
						(await convex.query(api.emailTemplates.getByCategory, {
							siteUrl,
							category: "custom",
						}));

				if (template) {
					subject = replaceTemplateVariables(template.subject, vars);
					html = replaceTemplateVariables(template.body, vars);
					if (!html.includes("<")) {
						html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; white-space: pre-wrap;">${html}</div>`;
					}
				} else {
					subject = `invoice ${invoice.invoiceNumber}`;
					html = buildDefaultInvoiceHtml(vars, siteName);
				}
			}

			const result = await sendEmail({
				to: clientEmail,
				subject,
				html,
			});

			await convex.mutation(api.emailLog.create, {
				siteUrl,
				to: clientEmail,
				subject,
				type: "invoice",
				relatedId: id,
				status: "sent",
				resendId: result.data?.id,
			});

			// mark invoice as sent
			await convex.mutation(api.invoices.markSent, {
				invoiceId: toId(id),
				siteUrl,
			});

			return json({ success: true });
		} catch (err: unknown) {
			const e = err as { status?: number; message?: string };
			if (e?.status) throw err;
			console.error("Failed to send invoice email:", err);

			// log failure
			try {
				await convex.mutation(api.emailLog.create, {
					siteUrl,
					to: "unknown",
					subject: "invoice email",
					type: "invoice",
					relatedId: id,
					status: "failed",
					error: e?.message ?? "Unknown error",
				});
			} catch (logErr) {
				console.warn("Failed to log invoice email failure:", id, logErr);
			}

			throw error(500, "Failed to send invoice email");
		}
	};
}
