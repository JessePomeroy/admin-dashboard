import type { ConvexClient } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";

/** Keep failures recoverable, then freeze the first valid snapshot until refresh. */
export function readDashboardSnapshot<Query extends FunctionReference<"query">>(
	client: Pick<ConvexClient, "onUpdate">,
	query: Query,
	args: FunctionArgs<Query>,
	accept: (value: FunctionReturnType<Query>) => void,
	fail: () => void,
) {
	let active = true;
	let unsubscribe: (() => void) | undefined;
	const stop = () => {
		if (!active) return;
		active = false;
		unsubscribe?.();
	};
	try {
		const subscription = client.onUpdate(query, args, (value) => {
			if (!active) return;
			try {
				accept(value);
			} catch {
				fail();
				return;
			}
			stop();
		}, () => {
			// A one-shot query unsubscribes on its first error, so a read made
			// during sign-in cannot recover when Convex confirms authentication.
			if (active) fail();
		});
		unsubscribe = subscription;
		if (!active) subscription();
	} catch {
		if (active) fail();
		stop();
	}
	return stop;
}
