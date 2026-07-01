import { error, json } from "@sveltejs/kit";
import type { ConvexHttpClient } from "convex/browser";
import { type AdminAPI, getServerConfig } from "../../config.js";
import type { EmailCategory } from "../../types.js";
import { formatCents, toId } from "../../utils.js";
import { getAuthenticatedConvex } from "../convexClient.js";
import { replaceTemplateVariables, sendEmail } from "../email.js";
import { handleServerError } from "../handleError.js";
import { escapeHtml } from "../html.js";
import { requireAdmin } from "../requireAdmin.js";

export { formatCents as formatCurrency };

/**
 * Detects whether a body is intended to be HTML. Conservative heuristic:
 * the body must begin with a tag-like prefix (after optional whitespace).
 * Anything else — including a prose body that happens to contain `<` —
 * is treated as plain text, escaped, and wrapped.
 */
function looksLikeHtml(text: string): boolean {
	return /^\s*<[a-zA-Z!]/.test(text);
}

function wrapPlainText(text: string): string {
	if (looksLikeHtml(text)) return text;
	return `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; white-space: pre-wrap;">${escapeHtml(text)}</div>`;
}

/**
 * Shape of a document passed through the send handler. Each caller narrows
 * this to a concrete doc interface (InvoiceDoc, QuoteDoc, ContractDoc) so
 * that `extractVars` / `defaultSubject` can access fields without casts.
 * Defaults to `Record<string, unknown>` for back-compat.
 */
export interface EmailSendConfig<
	TDoc extends Record<string, unknown> = Record<string, unknown>,
> {
	docType: string;
	/** Fetch the document by ID. Return null if not found. */
	fetchDocument: (
		api: AdminAPI,
		convex: ConvexHttpClient,
		id: string,
	) => Promise<TDoc | null>;
	/** Get the client email from the document. */
	getClientEmail: (doc: TDoc) => string | undefined;
	/** Extract template variables from the document. */
	extractVars: (doc: TDoc, changeNote: string) => Record<string, string>;
	/** Build default HTML when no template is found. */
	buildDefaultHtml: (
		vars: Record<string, string>,
		siteName: string,
	) => string;
	/** Build the default subject line. */
	defaultSubject: (doc: TDoc) => string;
	/** Mark the document as sent after email is delivered. */
	markSent: (api: AdminAPI, convex: ConvexHttpClient, id: string, siteUrl: string) => Promise<void>;
	/**
	 * Template category cascade used when the caller does not supply
	 * an explicit `templateId`. Categories are tried in order; the first
	 * matching template wins. If none match, the handler falls through
	 * to `buildDefaultHtml`. Each docType owns its own list so an invoice
	 * never silently renders a booking-confirmation template.
	 */
	fallbackCategories: readonly EmailCategory[];
}

/**
 * Generic factory for document email send handlers.
 * Handles: template lookup, custom subject/body, email sending,
 * logging, mark-sent, and error handling.
 */
export function createEmailSendHandler<
	TDoc extends Record<string, unknown> = Record<string, unknown>,
>(config: EmailSendConfig<TDoc>) {
	return async ({
		params,
		request,
	}: {
		params: { id: string };
		request: Request;
	}) => {
		await requireAdmin(request);
		const serverConfig = getServerConfig();
		const { api } = serverConfig;
		const siteUrl = serverConfig.siteUrl;
		const siteName = serverConfig.siteName;
		const convex = await getAuthenticatedConvex(request);

		const { id } = params;
		const body = await request.json().catch(() => ({}));
		const { templateId, customSubject, customBody, changeNote } = body;

		try {
			const doc = await config.fetchDocument(api, convex, id);
			if (!doc) throw error(404, `${config.docType} not found`);

			const clientEmail = config.getClientEmail(doc);
			if (!clientEmail) throw error(400, "Client has no email address");

			let subject: string;
			let html: string;

			if (customSubject && customBody) {
				subject = customSubject;
				html = wrapPlainText(customBody);
			} else {
				const vars = config.extractVars(doc, changeNote || "");

				let template = null;
				if (templateId) {
					template = await convex.query(api.emailTemplates.get, { templateId });
				} else {
					for (const category of config.fallbackCategories) {
						template = await convex.query(api.emailTemplates.getByCategory, {
							siteUrl,
							category,
						});
						if (template) break;
					}
				}

				if (template) {
					subject = replaceTemplateVariables(template.subject, vars);
					html = wrapPlainText(replaceTemplateVariables(template.body, vars));
				} else {
					subject = config.defaultSubject(doc);
					html = config.buildDefaultHtml(vars, siteName);
				}
			}

			const result = await sendEmail({ to: clientEmail, subject, html });

			await convex.mutation(api.emailLog.create, {
				siteUrl,
				to: clientEmail,
				subject,
				type: config.docType,
				relatedId: id,
				status: "sent",
				// Resend returns `{ data: { id }, error: null }` on success, but
				// `data` can be null on certain failure shapes. Coalesce so the
				// mutation always sees an explicit null rather than `undefined`.
				resendId: result.data?.id ?? null,
			});

			await config.markSent(api, convex, id, siteUrl);

			return json({ success: true });
		} catch (err: unknown) {
			// If it's already a SvelteKit error, rethrow before logging
			if (err && typeof err === "object" && "status" in err) throw err;

			const message = err instanceof Error ? err.message : "Unknown error";

			try {
				await convex.mutation(api.emailLog.create, {
					siteUrl,
					to: "unknown",
					subject: `${config.docType} email`,
					type: config.docType,
					relatedId: id,
					status: "failed",
					error: message,
				});
			} catch {
				// Best-effort logging — don't mask the original error
			}

			handleServerError(err, `Failed to send ${config.docType} email`);
		}
	};
}
