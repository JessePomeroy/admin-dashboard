import { toId } from "../../utils";
import { escapeHtml } from "../html";
import { createEmailSendHandler, formatCurrency } from "./createEmailSendHandler";

/** Subset of the Convex Contract document the send handler needs. */
interface ContractDoc extends Record<string, unknown> {
	clientEmail?: string;
	clientName?: string;
	title: string;
	eventDate?: string;
	eventLocation?: string;
	totalPrice?: number;
	depositAmount?: number;
}

function buildDefaultContractHtml(
	vars: Record<string, string>,
	siteName: string,
): string {
	// All vars come from extractVars below, which pre-escapes user-controlled
	// strings. `totalPrice` / `depositAmount` are formatCurrency output (safe).
	return `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
<p>hi ${vars.clientName},</p>
${vars.changeNote ? `<p>your contract has been updated (${vars.changeNote}).</p>` : "<p>a contract has been prepared for your review.</p>"}
<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
<tr><td style="padding: 8px 0; color: #666;">contract</td><td style="padding: 8px 0; text-align: right;">${vars.title}</td></tr>
${vars.eventDate ? `<tr><td style="padding: 8px 0; color: #666;">event date</td><td style="padding: 8px 0; text-align: right;">${vars.eventDate}</td></tr>` : ""}
${vars.eventLocation ? `<tr><td style="padding: 8px 0; color: #666;">location</td><td style="padding: 8px 0; text-align: right;">${vars.eventLocation}</td></tr>` : ""}
${vars.totalPrice ? `<tr><td style="padding: 8px 0; color: #666;">total</td><td style="padding: 8px 0; text-align: right;">${vars.totalPrice}</td></tr>` : ""}
</table>
<p>please review the details and reach out with any questions.</p>
<p style="color: #999; font-size: 0.85em; margin-top: 32px;">${escapeHtml(siteName)}</p>
</div>`;
}

export function createContractSendHandler() {
	return createEmailSendHandler<ContractDoc>({
		docType: "contract",
		fetchDocument: (api, convex, id) =>
			convex.query(api.contracts.get, { contractId: toId(id) }),
		getClientEmail: (doc) => doc.clientEmail,
		extractVars: (doc, changeNote) => ({
			clientName: escapeHtml(doc.clientName ?? "there"),
			title: escapeHtml(doc.title),
			eventDate: escapeHtml(doc.eventDate ?? ""),
			eventLocation: escapeHtml(doc.eventLocation ?? ""),
			totalPrice: doc.totalPrice ? formatCurrency(doc.totalPrice) : "",
			depositAmount: doc.depositAmount ? formatCurrency(doc.depositAmount) : "",
			changeNote: escapeHtml(changeNote),
		}),
		buildDefaultHtml: buildDefaultContractHtml,
		defaultSubject: (doc) => `contract: ${doc.title}`,
		markSent: (api, convex, id, siteUrl) =>
			convex.mutation(api.contracts.markSent, { contractId: toId(id), siteUrl }),
		fallbackCategories: ["booking-confirmation", "custom"],
	});
}
