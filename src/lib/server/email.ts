import { Resend } from "resend";
import { getServerConfig } from "../config.js";

export function getResend() {
	return new Resend(getServerConfig().resendApiKey);
}

export async function sendEmail(opts: {
	to: string;
	subject: string;
	html: string;
	from?: string;
}) {
	const resend = getResend();
	return await resend.emails.send({
		from: opts.from || getServerConfig().fromEmail,
		to: opts.to,
		subject: opts.subject,
		html: opts.html,
	});
}

export function replaceTemplateVariables(
	template: string,
	variables: Record<string, string>,
): string {
	return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) =>
		Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match,
	);
}
