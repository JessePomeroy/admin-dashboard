import { Resend } from "resend";
import { getServerConfig } from "../config.js";

export function getResend() {
	return new Resend(getServerConfig().resendApiKey);
}

export async function sendEmail(
	opts: {
		to: string;
		subject: string;
		html: string;
		text?: string;
		replyTo?: string;
		from?: string;
		tags?: Array<{ name: string; value: string }>;
	},
	options?: { idempotencyKey?: string },
) {
	const resend = getResend();
	const payload = {
		from: opts.from || getServerConfig().fromEmail,
		to: opts.to,
		subject: opts.subject,
		html: opts.html,
		...(opts.text ? { text: opts.text } : {}),
		...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
		...(opts.tags ? { tags: opts.tags } : {}),
	};
	return options?.idempotencyKey
		? await resend.emails.send(payload, {
				idempotencyKey: options.idempotencyKey,
			})
		: await resend.emails.send(payload);
}

export function replaceTemplateVariables(
	template: string,
	variables: Record<string, string>,
): string {
	return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) =>
		Object.hasOwn(variables, key) ? variables[key] : match,
	);
}
