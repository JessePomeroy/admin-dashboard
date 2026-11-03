export interface MessagePart { kind: "body" | "quoted" | "signature"; text: string }

/** Conservative plain-text folding; joining parts always recovers the exact stored text. */
export function messageParts(text: string): MessagePart[] {
	const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
	const parts: MessagePart[] = [];
	let tail: "signature" | "quoted" | null = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i], trimmed = line.replace(/\r?\n$/, "");
		if (trimmed === "-- ") tail = "signature";
		if (/^-{2,}\s*(Original Message|Forwarded message)\s*-{2,}$/i.test(trimmed)) tail = "quoted";
		const kind = tail ?? (/^\s*>/.test(line) || (/^On .{1,250}wrote:\s*$/.test(trimmed) && /^\s*>/.test(lines[i + 1] ?? "")) ? "quoted" : "body");
		const previous = parts[parts.length - 1];
		if (previous?.kind === kind) previous.text += line;
		else parts.push({ kind, text: line });
	}
	return parts;
}

export function gmailMessageUrl(mailbox: string | undefined, rfcId: string | undefined) {
	if (!mailbox || !rfcId || !/^<[^<>\s\r\n]{1,250}@[^<>\s\r\n]{1,250}>$/.test(rfcId)) return null;
	return `https://mail.google.com/mail/?authuser=${encodeURIComponent(mailbox)}#search/${encodeURIComponent(`rfc822msgid:${rfcId.slice(1, -1)}`)}`;
}
