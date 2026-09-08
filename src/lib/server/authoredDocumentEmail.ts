import { replaceTemplateVariables } from "./email.js";
import { escapeHtml } from "./html.js";

export type DocumentEmailType = "invoice" | "quote" | "contract";

export interface DocumentEmailMessage {
	html: string;
	text: string;
}

export interface DocumentEmailTemplateVariables {
	values: Record<string, string>;
	fragments?: Record<string, { html: string; text: string }>;
}

/**
 * Detect whether authored content is intended to be HTML. The conservative
 * prefix rule preserves existing prose templates that happen to contain `<`.
 */
function looksLikeHtml(value: string): boolean {
	return /^\s*<[a-zA-Z!]/.test(value);
}

function wrapPlainText(value: string): string {
	if (looksLikeHtml(value)) return value;
	const lines = value.replace(/\r\n?/g, "\n").split("\n");
	const content = lines
		.map((line) => (line.length > 0 ? escapeHtml(line) : "&nbsp;"))
		.join("<br>\n");
	return `<div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; line-height: 1.6;">${content}</div>`;
}

function decodeTextEntity(entity: string): string {
	const named: Record<string, string> = {
		amp: "&",
		apos: "'",
		bull: "•",
		copy: "©",
		hellip: "…",
		gt: ">",
		ldquo: "“",
		lsquo: "‘",
		lt: "<",
		mdash: "—",
		ndash: "–",
		nbsp: " ",
		quot: '"',
		rdquo: "”",
		reg: "®",
		rsquo: "’",
		trade: "™",
	};
	if (entity in named) return named[entity] ?? entity;
	const numeric = entity.startsWith("#x")
		? Number.parseInt(entity.slice(2), 16)
		: entity.startsWith("#")
			? Number.parseInt(entity.slice(1), 10)
			: Number.NaN;
	return Number.isSafeInteger(numeric) && numeric > 0 && numeric <= 0x10ffff
		? String.fromCodePoint(numeric)
		: `&${entity};`;
}

function decodeTextEntities(value: string): string {
	return value.replace(
		/&([a-z]+|#\d+|#x[0-9a-f]+);/gi,
		(_match, entity: string) => decodeTextEntity(entity.toLowerCase()),
	);
}

function plainTextAlternative(value: string): string {
	if (!looksLikeHtml(value)) return value.trim();
	return decodeTextEntities(
		value
			.replace(/<!--[\s\S]*?-->/g, "")
			.replace(
				/<(head|style|script|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
				"",
			)
			.replace(
				/<img\b[^>]*\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi,
				(_match, doubleQuoted: string, singleQuoted: string, bare: string) =>
					`\n${doubleQuoted ?? singleQuoted ?? bare ?? ""}\n`,
			)
			.replace(/<img\b[^>]*>/gi, "")
			.replace(
				/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi,
				(
					_match,
					doubleQuoted: string,
					singleQuoted: string,
					bare: string,
					content: string,
				) => {
					const href = doubleQuoted ?? singleQuoted ?? bare ?? "";
					const label = content.replace(/<[^>]+>/g, "").trim();
					return label === href ? href : `${label} (${href})`;
				},
			)
			.replace(/<(?:br|hr)\s*\/?\s*>/gi, "\n")
			.replace(
				/<\/(?:p|div|h[1-6]|li|tr|table|section|article|address)>/gi,
				"\n",
			)
			.replace(/<\/(?:td|th)>/gi, " | ")
			.replace(/<li\b[^>]*>/gi, "• ")
			.replace(/<[^>]+>/g, "")
			.replace(/[ \t]+\|/g, " |")
			.replace(/\|[ \t]*\n/g, "\n")
			.replace(/[ \t]+\n/g, "\n")
			.replace(/\n{3,}/g, "\n\n")
			.trim(),
	);
}

function portalActionLabel(type: DocumentEmailType): string {
	switch (type) {
		case "invoice":
			return "View and pay invoice";
		case "quote":
			return "Review your quote";
		case "contract":
			return "Review and sign contract";
	}
}

function insertBeforeClosingDocument(html: string, addition: string): string {
	const bodyClose = html.search(/<\/body\s*>/i);
	if (bodyClose >= 0) {
		return `${html.slice(0, bodyClose)}${addition}\n${html.slice(bodyClose)}`;
	}
	const htmlClose = html.search(/<\/html\s*>/i);
	return htmlClose >= 0
		? `${html.slice(0, htmlClose)}${addition}\n${html.slice(htmlClose)}`
		: `${html}\n${addition}`;
}

export function appendDocumentPortalAccess(
	message: DocumentEmailMessage,
	type: DocumentEmailType,
	portalUrl: string,
): DocumentEmailMessage {
	const label = portalActionLabel(type);
	const escapedUrl = escapeHtml(portalUrl);
	const action = `<div style="box-sizing: border-box; max-width: 600px; margin: 0 auto; padding: 0 24px 24px; font-family: Arial, Helvetica, sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin: 24px 0 8px; table-layout: fixed;"><tr><td bgcolor="#3f352e" style="padding: 0; border-radius: 3px; mso-padding-alt: 14px 22px; text-align: center;"><a href="${escapedUrl}" style="display: block; padding: 14px 22px; color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 600; line-height: 1; text-decoration: none;">${escapeHtml(label)}</a></td></tr></table>
<p style="margin: 18px 0 6px; color: #756c64; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.55;">If the button does not open, copy this address into your browser:</p>
<p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; word-break: break-word;"><a href="${escapedUrl}" style="color: #594a3f; text-decoration: underline;">${escapedUrl}</a></p>
</div>`;
	return {
		html: insertBeforeClosingDocument(message.html, action),
		text: `${message.text.trimEnd()}\n\n${label}:\n${portalUrl}`,
	};
}

function templateVariableSets(input: DocumentEmailTemplateVariables) {
	const text = { ...input.values };
	const html = Object.fromEntries(
		Object.entries(input.values).map(([key, value]) => [key, escapeHtml(value)]),
	);
	for (const [key, fragment] of Object.entries(input.fragments ?? {})) {
		text[key] = fragment.text;
		html[key] = fragment.html;
	}
	return { text, html };
}

function renderAuthoredMessage(
	source: string,
	variables: ReturnType<typeof templateVariableSets>,
): DocumentEmailMessage {
	if (looksLikeHtml(source)) {
		const html = replaceTemplateVariables(source, variables.html);
		return { html, text: plainTextAlternative(html) };
	}
	const text = replaceTemplateVariables(source, variables.text).trim();
	return { html: wrapPlainText(text), text };
}

/** Snapshot authored variables before template lookup; rendering performs no I/O. */
export function createAuthoredDocumentRenderer(input: DocumentEmailTemplateVariables) {
	const variables = templateVariableSets(input);
	return (source: { subject: string; body: string }) => ({
		subject: replaceTemplateVariables(source.subject, variables.text),
		message: renderAuthoredMessage(source.body, variables),
	});
}
