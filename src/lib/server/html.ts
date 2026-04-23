/**
 * Minimal HTML-escape utility for interpolating untrusted strings into
 * outbound email HTML. Not a substitute for DOMPurify on HTML input, but
 * sufficient for text-in-tag contexts (invoice descriptions, client names,
 * package names, etc.).
 */
const ESCAPE_MAP: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

export function escapeHtml(value: unknown): string {
	if (value == null) return "";
	return String(value).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c] ?? c);
}
