import { json, type Cookies, type RequestHandler } from "@sveltejs/kit";
import { ConvexHttpClient } from "convex/browser";

type ConvexApiTree = Record<string, unknown>;

interface ConvexMutationClient {
	setAuth(token: string): void;
	mutation(ref: unknown, args: unknown): Promise<unknown>;
}

export interface AdminMutationProxyOptions {
	api: ConvexApiTree;
	getConvexUrl: () => string | undefined;
	requireAuth: (cookies: Cookies) => Promise<string>;
	createClient?: (convexUrl: string) => ConvexMutationClient;
}

export function resolveConvexFunction(
	api: ConvexApiTree,
	name: string,
): unknown {
	const [path, fn] = name.split(":");
	if (!path || !fn) return undefined;

	let node: unknown = api;
	for (const segment of path.split("/")) {
		if (!node || typeof node !== "object") return undefined;
		node = (node as Record<string, unknown>)[segment];
	}

	if (!node || typeof node !== "object") return undefined;
	return (node as Record<string, unknown>)[fn];
}

export function createAdminMutationHandler(
	options: AdminMutationProxyOptions,
): RequestHandler {
	const createClient =
		options.createClient ??
		((convexUrl: string) => new ConvexHttpClient(convexUrl));

	return async ({ request, cookies }) => {
		let token: string;
		try {
			token = await options.requireAuth(cookies);
		} catch (err) {
			const status =
				err && typeof err === "object" && "status" in err
					? Number(err.status)
					: 401;
			const message = err instanceof Error ? err.message : "Unauthorized";
			return json(
				{ error: message || "Unauthorized" },
				{ status: Number.isFinite(status) ? status : 401 },
			);
		}

		let payload: { name?: unknown; args?: unknown };
		try {
			payload = await request.json();
		} catch {
			return json({ error: "Invalid JSON body" }, { status: 400 });
		}

		const { name, args } = payload;
		if (typeof name !== "string" || !name.includes(":")) {
			return json(
				{ error: "`name` must be a Convex function name like 'module:function'" },
				{ status: 400 },
			);
		}

		const fnRef = resolveConvexFunction(options.api, name);
		if (!fnRef) {
			return json({ error: `Unknown mutation: ${name}` }, { status: 400 });
		}

		const convexUrl = options.getConvexUrl();
		if (!convexUrl) {
			return json({ error: "Convex URL not configured" }, { status: 500 });
		}

		const client = createClient(convexUrl);
		client.setAuth(token);

	try {
			// biome-ignore lint/suspicious/noExplicitAny: function refs are resolved by Convex name at runtime; this shared proxy intentionally accepts generated API trees from different consumer apps.
			const result = await client.mutation(fnRef as any, args);
			return json({ result });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return json({ error: message }, { status: 500 });
		}
	};
}
