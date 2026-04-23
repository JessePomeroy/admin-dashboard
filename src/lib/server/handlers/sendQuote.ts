import { toId } from "../../utils";
import { escapeHtml } from "../html";
import { createEmailSendHandler, formatCurrency } from "./createEmailSendHandler";

/** Subset of the Convex Quote document the send handler needs. */
interface QuoteDoc extends Record<string, unknown> {
	clientEmail?: string;
	clientName?: string;
	quoteNumber: string;
	packages: { name: string; description?: string; price: number }[];
	validUntil?: string;
}

function formatPackages(
	packages: { name: string; description?: string; price: number }[],
): string {
	return packages
		.map(
			(pkg) =>
				`<div style="padding: 12px 0; border-bottom: 1px solid #eee;">
<strong>${escapeHtml(pkg.name)}</strong> — ${formatCurrency(pkg.price)}
${pkg.description ? `<br><span style="color: #666; font-size: 0.9em;">${escapeHtml(pkg.description)}</span>` : ""}
</div>`,
		)
		.join("");
}

function buildDefaultQuoteHtml(
	vars: Record<string, string>,
	siteName: string,
): string {
	// All vars come from extractVars below, which pre-escapes user-controlled
	// strings. `packages` is intentionally pre-built HTML and must not be escaped.
	return `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
<p>hi ${vars.clientName},</p>
${vars.changeNote ? `<p>your quote has been updated (${vars.changeNote}).</p>` : "<p>here is your quote for review.</p>"}
<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
<tr><td style="padding: 8px 0; color: #666;">quote</td><td style="padding: 8px 0; text-align: right;">${vars.quoteNumber}</td></tr>
</table>
${vars.packages ? `<div style="margin: 16px 0;">${vars.packages}</div>` : ""}
${vars.validUntil ? `<p style="color: #666; font-size: 0.85em;">valid until ${vars.validUntil}</p>` : ""}
<p>please reach out if you have any questions or would like to proceed.</p>
<p style="color: #999; font-size: 0.85em; margin-top: 32px;">${escapeHtml(siteName)}</p>
</div>`;
}

export function createQuoteSendHandler() {
	return createEmailSendHandler<QuoteDoc>({
		docType: "quote",
		fetchDocument: (api, convex, id) =>
			convex.query(api.quotes.get, { quoteId: toId(id) }),
		getClientEmail: (doc) => doc.clientEmail,
		extractVars: (doc, changeNote) => ({
			clientName: escapeHtml(doc.clientName ?? "there"),
			quoteNumber: escapeHtml(doc.quoteNumber),
			packages: formatPackages(doc.packages),
			validUntil: escapeHtml(doc.validUntil ?? ""),
			changeNote: escapeHtml(changeNote),
		}),
		buildDefaultHtml: buildDefaultQuoteHtml,
		defaultSubject: (doc) => `quote ${doc.quoteNumber}`,
		markSent: (api, convex, id, siteUrl) =>
			convex.mutation(api.quotes.markSent, { quoteId: toId(id), siteUrl }),
		fallbackCategories: ["custom"],
	});
}
