import { error, json } from "@sveltejs/kit";
import type { ConvexHttpClient } from "convex/browser";
import { type AdminAPI, getServerConfig } from "../../config";
import type { EmailCategory } from "../../types";
import { formatCents, toId } from "../../utils";
import { getConvex } from "../convexClient";
import { replaceTemplateVariables, sendEmail } from "../email";
import { handleServerError } from "../handleError";
import { requireAdmin } from "../requireAdmin";

export { formatCents as formatCurrency };

function wrapPlainText(text: string): string {
	if (text.includes("<")) return text;
	return `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; white-space: pre-wrap;">${text}</div>`;
}

export interface EmailSendConfig {
	docType: string;
	/** Fetch the document by ID. Return null if not found. */
	fetchDocument: (
		api: AdminAPI,
		convex: ConvexHttpClient,
		id: string,
	) => Promise<Record<string, unknown> | null>;
	/** Get the client email from the document. */
	getClientEmail: (doc: Record<string, unknown>) => string | undefined;
	/** Extract template variables from the document. */
	extractVars: (doc: Record<string, unknown>, changeNote: string) => Record<string, string>;
	/** Build default HTML when no template is found. */
	buildDefaultHtml: (
		vars: Record<string, string>,
		siteName: string,
	) => string;
	/** Build the default subject line. */
	defaultSubject: (doc: Record<string, unknown>) => string;
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
export function createEmailSendHandler(config: EmailSendConfig) {
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
		const convex = getConvex();

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
				resendId: result.data?.id,
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
