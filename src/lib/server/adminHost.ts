import type { Cookies } from "@sveltejs/kit";

export type RequestCookieEntry = { name: string; value: string };

function decodeCookieValue(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/**
 * Parse a request Cookie header into stable name/value entries.
 *
 * Host apps use this for request-level admin auth checks where SvelteKit's
 * route event `cookies` object is not available, such as callbacks that only
 * receive a `Request`.
 */
export function parseRequestCookieHeader(
	cookieHeader: string | null | undefined,
): RequestCookieEntry[] {
	if (!cookieHeader) return [];

	const cookies = new Map<string, string>();
	for (const segment of cookieHeader.split(";")) {
		const trimmed = segment.trim();
		if (!trimmed) continue;

		const separatorIndex = trimmed.indexOf("=");
		const rawName = separatorIndex === -1
			? trimmed
			: trimmed.slice(0, separatorIndex);
		const name = rawName.trim();
		if (!name) continue;

		const rawValue = separatorIndex === -1
			? ""
			: trimmed.slice(separatorIndex + 1);
		if (cookies.has(name)) continue;
		cookies.set(name, decodeCookieValue(rawValue));
	}

	return Array.from(cookies, ([name, value]) => ({ name, value }));
}

function readonlyCookieMutation(): never {
	throw new Error(
		"cookiesFromRequest() returns read-only request cookies. Use SvelteKit event.cookies when you need to set or delete cookies.",
	);
}

/**
 * Create a read-only cookie object from a standard Request for callbacks
 * that only need `cookies.get()` or `cookies.getAll()`. This is intentionally
 * limited to request cookie reads.
 */
export function cookiesFromRequest(request: Request): Cookies {
	const entries = parseRequestCookieHeader(request.headers.get("cookie"));

	return {
		get(name: string) {
			return entries.find((cookie) => cookie.name === name)?.value;
		},
		getAll() {
			return entries;
		},
		set: readonlyCookieMutation,
		delete: readonlyCookieMutation,
		serialize: readonlyCookieMutation,
	};
}
