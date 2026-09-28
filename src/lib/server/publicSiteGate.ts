import type { Handle } from "@sveltejs/kit";

const ESSENTIAL_PATHS = ["/admin", "/api/admin", "/api/auth", "/_app"];
const matches = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** Hosts explicitly preserve existing customer-service routes; public reads are never cached. */
export function createPublicSiteGate(options: {
	isActive: () => Promise<boolean>;
	preservePaths?: readonly string[];
}): Handle {
	return async ({ event, resolve }) => {
		const pathname = event.url.pathname;
		if (
			[...ESSENTIAL_PATHS, ...(options.preservePaths ?? [])].some((prefix) =>
				matches(pathname, prefix),
			)
		)
			return resolve(event);
		let active = false;
		try {
			active = await options.isActive();
		} catch {
			/* Unknown availability must not serve retained content. */
		}
		const headers = {
			"Cache-Control": "private, no-store",
			"CDN-Cache-Control": "no-store",
			"Vercel-CDN-Cache-Control": "no-store",
		};
		if (!active) {
			const html =
				event.request.headers.get("accept")?.includes("text/html") && !event.isDataRequest;
			return new Response(
				event.request.method === "HEAD"
					? null
					: html
						? '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Website unavailable</title><body><main><h1>This website is unavailable.</h1><p>Please check back later.</p></main></body></html>'
						: JSON.stringify({
								error: "site_unavailable",
								message: "This website is unavailable.",
							}),
				{
					status: 503,
					headers: {
						...headers,
						"Content-Type": html ? "text/html; charset=utf-8" : "application/json",
						"X-Robots-Tag": "noindex, nofollow",
						"X-Content-Type-Options": "nosniff",
					},
				},
			);
		}
		const response = await resolve(event);
		const uncached = new Response(response.body, response);
		for (const [name, value] of Object.entries(headers)) uncached.headers.set(name, value);
		return uncached;
	};
}
