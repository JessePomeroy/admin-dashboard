import { useConvexClient } from "@mmailaender/convex-svelte";
import type { ConvexClient } from "convex/browser";
import { getFunctionName } from "convex/server";
import { getAdminConfig } from "./config";

/**
 * Return a Convex client whose `.mutation()` routing is governed by
 * `AdminConfig.mutationTransport`.
 *
 * When transport is `"websocket"` (default) this is just the raw client
 * from `useConvexClient()` — mutations fly over the authenticated Convex
 * WebSocket like usual.
 *
 * When transport is `"http"` we return a `Proxy` that intercepts
 * `.mutation()` and POSTs to `AdminConfig.mutationEndpoint` instead. The
 * endpoint holds the Better Auth cookie server-side, attaches the token
 * to a Convex HTTP client, and forwards the call. All other methods
 * (queries, actions, connection state, etc.) pass through untouched, so
 * reactive `useQuery()` subscriptions keep running on the same WebSocket.
 *
 * Call sites do not change shape: `await client.mutation(api.foo.bar, args)`
 * works regardless of transport.
 *
 * Why this exists: `@mmailaender/convex-better-auth-svelte@0.7.3` has a
 * WebSocket-pause bug on SvelteKit client-side navigation under
 * `better-auth@1.5.x` (the library's 150ms transient-guard races with the
 * newer session-signal timing, producing a permanent pause on new
 * `useQuery` subscriptions). Keeping the WebSocket unauthenticated sidesteps
 * the pause entirely; this proxy preserves working mutations by routing
 * them through a SvelteKit endpoint that *does* have the auth cookie.
 *
 * See the Obsidian note "PR candidate — convex-better-auth-svelte pause bug"
 * for background and the upstream fix plan.
 */
export function useAdminClient(): ConvexClient {
	const client = useConvexClient();
	const config = getAdminConfig();
	const transport = config.mutationTransport ?? "websocket";

	if (transport !== "http") return client;

	const endpoint = config.mutationEndpoint ?? "/api/admin/mutation";

	return new Proxy(client, {
		get(target, prop, receiver) {
			if (prop === "mutation") {
				// biome-ignore lint/suspicious/noExplicitAny: Convex FunctionReference is heavily generic; matches the `any` stance the package already takes for `api` refs (see config.ts FnRef).
				return async (ref: any, args: unknown) => {
					const res = await fetch(endpoint, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							name: getFunctionName(ref),
							args,
						}),
					});
					if (!res.ok) {
						const { error } = await res
							.json()
							.catch(() => ({ error: res.statusText }));
						throw new Error(
							typeof error === "string" ? error : "Mutation failed",
						);
					}
					const { result } = await res.json();
					return result;
				};
			}
			return Reflect.get(target, prop, receiver);
		},
	});
}
