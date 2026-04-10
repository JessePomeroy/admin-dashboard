import { error, json } from "@sveltejs/kit";
import { getServerConfig } from "../../config";
import { toId } from "../../utils";
import { getConvex } from "../convexClient";
import { replaceTemplateVariables, sendEmail } from "../email";

export function formatCurrency(cents: number): string {
	return `$${(cents / 100).toFixed(2)}`;
}

function wrapPlainText(text: string): string {
	if (text.includes("<")) return text;
	return `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; white-space: pre-wrap;">${text}</div>`;
}

export interface EmailSendConfig {
	docType: string;
	/** Fetch the document. Return null if not found. */
	fetchDocument: (
		api: any,
		convex: any,
		id: string,
	) => Promise<any | null>;
	/** Get the client email from the document. */
	getClientEmail: (doc: any) => string | undefined;
	/** Extract template variables from the document. */
	extractVars: (doc: any, changeNote: string) => Record<string, string>;
	/** Build default HTML when no template is found. */
	buildDefaultHtml: (
		vars: Record<string, string>,
		siteName: string,
	) => string;
	/** Build the default subject line. */
	defaultSubject: (doc: any) => string;
	/** Mark the document as sent after email is delivered. */
	markSent: (api: any, convex: any, id: string, siteUrl: string) => Promise<void>;
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
			const e = err as { status?: number; message?: string };
			if (e?.status) throw err;
			console.error(`Failed to send ${config.docType} email:`, err);

			try {
				await convex.mutation(api.emailLog.create, {
					siteUrl,
					to: "unknown",
					subject: `${config.docType} email`,
					type: config.docType,
					relatedId: id,
					status: "failed",
					error: e?.message ?? "Unknown error",
				});
			} catch (logErr) {
				console.warn(`Failed to log ${config.docType} email failure:`, id, logErr);
			}

			throw error(500, `Failed to send ${config.docType} email`);
		}
	};
}
