import { useConvexClient } from "convex-svelte";
import type { ConvexClient } from "convex/browser";
import { getFunctionName } from "convex/server";
import { getAdminConfig } from "./config";

export async function requestAdminMutation(
	endpoint: string,
	name: string,
	args: unknown,
	request: typeof fetch = globalThis.fetch,
) {
	const res = await request(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name, args }),
	});
	if (!res.ok) {
		const { error } = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error(typeof error === "string" ? error : "Mutation failed");
	}
	const { result } = await res.json();
	return result;
}

/**
 * Return a Convex client whose `.mutation()` calls POST to
 * `AdminConfig.mutationEndpoint` (default `"/api/admin/mutation"`).
 *
 * The endpoint holds the Better Auth cookie server-side, attaches the token to
 * a fresh Convex HTTP client, and forwards the call. All other methods
 * (queries, actions, connection state, etc.) pass through untouched, so
 * reactive `useQuery()` subscriptions keep running on the browser WebSocket.
 *
 * Call sites keep the Convex shape: `await client.mutation(api.foo.bar, args)`.
 * Mutation authority therefore never depends on the browser WebSocket's
 * session lifecycle during SvelteKit client navigation.
 */
export function useAdminClient(): ConvexClient {
	const client = useConvexClient();
	const endpoint = getAdminConfig().mutationEndpoint ?? "/api/admin/mutation";

	return new Proxy(client, {
		get(target, prop, receiver) {
			if (prop === "mutation") {
				// biome-ignore lint/suspicious/noExplicitAny: Convex FunctionReference is heavily generic; matches the `any` stance the package already takes for `api` refs (see config.ts FnRef).
				return (ref: any, args: unknown) =>
					requestAdminMutation(endpoint, getFunctionName(ref), args);
			}
			return Reflect.get(target, prop, receiver);
		},
	});
}
