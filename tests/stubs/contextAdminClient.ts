import { useConvexClient } from "convex-svelte";

/**
 * Test double for `useAdminClient`: deliver package mutations to the
 * context client's fixture handler instead of the host HTTP proxy, whose
 * routing is covered by `adminClient.test.ts`.
 */
export function useAdminClient() {
	return useConvexClient();
}
