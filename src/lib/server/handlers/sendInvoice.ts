import { toId } from "../../utils.js";
import { renderDocumentEmail } from "../defaultDocumentEmail.js";
import { escapeHtml } from "../html.js";
import {
	createEmailSendHandler,
	formatCurrency,
} from "./createEmailSendHandler.js";

/** Subset of the Convex Invoice document the send handler needs. */
interface InvoiceDoc extends Record<string, unknown> {
	_id: string;
	siteUrl: string;
	clientId: string;
	clientEmail?: string;
	clientName?: string;
	status: "draft" | "sent" | "paid" | "overdue" | "canceled";
	invoiceNumber: string;
	items: { description: string; quantity: number; unitPrice: number }[];
	taxPercent?: number;
	dueDate?: string;
}

export function createInvoiceSendHandler() {
	return createEmailSendHandler<InvoiceDoc>({
		docType: "invoice",
		fetchDocument: (api, convex, id) =>
			convex.query(api.invoices.get, { invoiceId: toId(id) }),
		getClientEmail: (doc) => doc.clientEmail,
		extractVars: (doc, changeNote) => {
			const subtotal = doc.items.reduce(
				(sum, item) => sum + item.quantity * item.unitPrice,
				0,
			);
			const taxAmount = doc.taxPercent
				? Math.round(subtotal * (doc.taxPercent / 100))
				: 0;
			const lineItems = doc.items
				.map((item) => {
					const lineTotal = item.quantity * item.unitPrice;
					return `<tr><td style="padding: 6px 0;">${escapeHtml(item.description)}</td><td style="padding: 6px 0; text-align: right;">${item.quantity}</td><td style="padding: 6px 0; text-align: right;">${formatCurrency(item.unitPrice)}</td><td style="padding: 6px 0; text-align: right;">${formatCurrency(lineTotal)}</td></tr>`;
				})
				.join("\n");
			const lineItemsText = doc.items
				.map((item) => {
					const lineTotal = item.quantity * item.unitPrice;
					return `${item.description} — ${item.quantity} × ${formatCurrency(item.unitPrice)} = ${formatCurrency(lineTotal)}`;
				})
				.join("\n");

			return {
				values: {
					clientName: doc.clientName ?? "there",
					clientEmail: doc.clientEmail ?? "",
					invoiceNumber: doc.invoiceNumber,
					amount: formatCurrency(subtotal + taxAmount),
					dueDate: doc.dueDate ?? "",
					subtotal: formatCurrency(subtotal),
					taxLine: taxAmount
						? `${formatCurrency(taxAmount)} (${String(doc.taxPercent)}%)`
						: "",
					changeNote,
				},
				fragments: {
					lineItems: { html: lineItems, text: lineItemsText },
				},
			};
		},
		buildDefaultMessage: (doc, context) =>
			renderDocumentEmail({
				kind: "invoice",
				brand: { siteName: context.siteName, homeUrl: context.homeUrl },
				clientName: doc.clientName,
				changeNote: context.changeNote || undefined,
				invoiceNumber: doc.invoiceNumber,
				dueDate: doc.dueDate,
				items: doc.items.map((item) => ({
					description: item.description,
					quantity: item.quantity,
					unitPriceCents: item.unitPrice,
				})),
				taxPercent: doc.taxPercent,
				portalUrl: context.portalUrl,
			}),
		defaultSubject: (doc) => `invoice ${doc.invoiceNumber}`,
		fallbackCategoriesForAction: (changeNote) =>
			changeNote === "payment reminder" || changeNote === "payment overdue"
				? ["reminder"]
				: [],
	});
}
