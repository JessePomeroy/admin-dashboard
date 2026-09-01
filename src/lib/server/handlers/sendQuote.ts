import { toId } from "../../utils.js";
import { renderDocumentEmail } from "../defaultDocumentEmail.js";
import { escapeHtml } from "../html.js";
import {
	createEmailSendHandler,
	formatCurrency,
} from "./createEmailSendHandler.js";

/** Subset of the Convex Quote document the send handler needs. */
interface QuoteDoc extends Record<string, unknown> {
	_id: string;
	siteUrl: string;
	clientId: string;
	clientEmail?: string;
	clientName?: string;
	status: "draft" | "sent" | "accepted" | "declined" | "expired";
	quoteNumber: string;
	packages: {
		name: string;
		description?: string;
		price: number;
		included?: string[];
	}[];
	validUntil?: string;
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function quoteValidityError(validUntil: string | undefined): string | undefined {
	if (validUntil === undefined) return undefined;
	const match = DATE_ONLY_PATTERN.exec(validUntil);
	if (!match) return "This quote has an invalid expiration date";
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const start = Date.UTC(year, month - 1, day);
	const parsed = new Date(start);
	if (
		parsed.getUTCFullYear() !== year ||
		parsed.getUTCMonth() !== month - 1 ||
		parsed.getUTCDate() !== day
	) {
		return "This quote has an invalid expiration date";
	}
	return Date.now() >= start + 24 * 60 * 60 * 1000
		? "This quote has expired and cannot be sent"
		: undefined;
}

function formatPackages(
	packages: {
		name: string;
		description?: string;
		price: number;
		included?: string[];
	}[],
): { html: string; text: string } {
	return {
		html: packages
		.map(
			(pkg) =>
				`<div style="padding: 12px 0; border-bottom: 1px solid #eee;">
<strong>${escapeHtml(pkg.name)}</strong> — ${formatCurrency(pkg.price)}
${pkg.description ? `<br><span style="color: #666; font-size: 0.9em;">${escapeHtml(pkg.description)}</span>` : ""}
${pkg.included?.length ? `<br><span style="color: #666; font-size: 0.9em;">Includes: ${pkg.included.map(escapeHtml).join(" · ")}</span>` : ""}
</div>`,
		)
		.join(""),
		text: packages
			.map(
				(pkg) =>
					`${pkg.name} — ${formatCurrency(pkg.price)}${pkg.description ? `\n${pkg.description}` : ""}${pkg.included?.length ? `\nIncludes: ${pkg.included.join(" · ")}` : ""}`,
			)
			.join("\n\n"),
	};
}

export function createQuoteSendHandler() {
	return createEmailSendHandler<QuoteDoc>({
		docType: "quote",
		fetchDocument: (api, convex, id) =>
			convex.query(api.quotes.get, { quoteId: toId(id) }),
		getClientEmail: (doc) => doc.clientEmail,
		extractVars: (doc, changeNote) => ({
			values: {
				clientName: doc.clientName ?? "there",
				clientEmail: doc.clientEmail ?? "",
				quoteNumber: doc.quoteNumber,
				validUntil: doc.validUntil ?? "",
				changeNote,
			},
			fragments: { packages: formatPackages(doc.packages) },
		}),
		buildDefaultMessage: (doc, context) =>
			renderDocumentEmail({
				kind: "quote",
				brand: { siteName: context.siteName, homeUrl: context.homeUrl },
				clientName: doc.clientName,
				changeNote: context.changeNote || undefined,
				quoteNumber: doc.quoteNumber,
				validUntil: doc.validUntil,
				packages: doc.packages.map((pkg) => ({
					name: pkg.name,
					description: pkg.description,
					priceCents: pkg.price,
					included: pkg.included,
				})),
				portalUrl: context.portalUrl,
			}),
		defaultSubject: (doc) => `quote ${doc.quoteNumber}`,
		validateDocument: (doc) => quoteValidityError(doc.validUntil),
	});
}
