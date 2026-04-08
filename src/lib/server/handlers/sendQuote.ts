import { error, json } from "@sveltejs/kit";
import { getServerConfig } from "../../config";
import { getConvex } from "../convexClient";
import { replaceTemplateVariables, sendEmail } from "../email";

function formatCurrency(cents: number): string {
	return `$${(cents / 100).toFixed(2)}`;
}

function buildDefaultQuoteHtml(
	vars: Record<string, string>,
	siteName: string,
): string {
	return `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
<p>hi ${vars.clientName},</p>
<p>here is your quote for review.</p>
<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
<tr><td style="padding: 8px 0; color: #666;">quote</td><td style="padding: 8px 0; text-align: right;">${vars.quoteNumber}</td></tr>
</table>
${vars.packages ? `<div style="margin: 16px 0;">${vars.packages}</div>` : ""}
${vars.validUntil ? `<p style="color: #666; font-size: 0.85em;">valid until ${vars.validUntil}</p>` : ""}
<p>please reach out if you have any questions or would like to proceed.</p>
<p style="color: #999; font-size: 0.85em; margin-top: 32px;">${siteName}</p>
</div>`;
}

function formatPackages(
	packages: { name: string; description?: string; price: number }[],
): string {
	return packages
		.map(
			(pkg) =>
				`<div style="padding: 12px 0; border-bottom: 1px solid #eee;">
<strong>${pkg.name}</strong> — ${formatCurrency(pkg.price)}
${pkg.description ? `<br><span style="color: #666; font-size: 0.9em;">${pkg.description}</span>` : ""}
</div>`,
		)
		.join("");
}

export function createQuoteSendHandler() {
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
		const { templateId, customSubject, customBody } = body;

		try {
			const quote = await convex.query(api.quotes.get, {
				quoteId: id as any,
			});
			if (!quote) throw error(404, "Quote not found");

			const clientEmail = quote.clientEmail;
			if (!clientEmail) throw error(400, "Client has no email address");

			let subject: string;
			let html: string;

			if (customSubject && customBody) {
				// user edited the preview — use their version directly
				subject = customSubject;
				html = customBody;
				if (!html.includes("<")) {
					html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; white-space: pre-wrap;">${html}</div>`;
				}
			} else {
				const vars: Record<string, string> = {
					clientName: quote.clientName ?? "there",
					quoteNumber: quote.quoteNumber,
					packages: formatPackages(quote.packages),
					validUntil: quote.validUntil ?? "",
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
					subject = `quote ${quote.quoteNumber}`;
					html = buildDefaultQuoteHtml(vars, siteName);
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
				type: "quote",
				relatedId: id,
				status: "sent",
				resendId: result.data?.id,
			});

			await convex.mutation(api.quotes.markSent, {
				quoteId: id as any,
				siteUrl,
			});

			return json({ success: true });
		} catch (err: unknown) {
			const e = err as { status?: number; message?: string };
			if (e?.status) throw err;
			console.error("Failed to send quote email:", err);

			try {
				await convex.mutation(api.emailLog.create, {
					siteUrl,
					to: "unknown",
					subject: "quote email",
					type: "quote",
					relatedId: id,
					status: "failed",
					error: e?.message ?? "Unknown error",
				});
			} catch {
				// best effort logging
			}

			throw error(500, "Failed to send quote email");
		}
	};
}
