import type { ConvexClient } from "convex/browser";
import { getFunctionName, type FunctionReference } from "convex/server";

type QueryArgs = {
	siteUrl?: string;
	documentId?: string;
	kind?: string;
	paginationOpts?: { numItems: number; maximumRowsRead?: number; cursor: string | null; id?: number };
	ids?: string[];
};

type Subscription = {
	name: string;
	args: QueryArgs;
	result: (value: unknown) => void;
	error: (value: Error) => void;
	active: boolean;
};

/** Keep useQuery real; control only the external client's cache and responses. */
export function queryClient(onMutation?: (name: string, args: Record<string, unknown>) => unknown) {
	const cache = new Map<string, unknown>();
	const subscriptions: Subscription[] = [];
	const key = (name: string, args: unknown) => JSON.stringify([name, args]);
	const client = {
		disabled: false, closed: false,
		client: { localQueryResult(name: string, args: unknown) {
			const value = cache.get(key(name, args));
			if (value instanceof Error) throw value;
			return value;
		} },
		onUpdate(ref: FunctionReference<"query">, args: QueryArgs, result: Subscription["result"], error: Subscription["error"]) {
			const subscription = { name: getFunctionName(ref), args, result, error, active: true };
			subscriptions.push(subscription);
			return () => { subscription.active = false; };
		},
		async mutation(ref: FunctionReference<"mutation">, args: Record<string, unknown>) {
			if (!onMutation) throw new Error("Unexpected fixture mutation");
			return onMutation(getFunctionName(ref), args);
		},
	};
	return {
		// This inert test double implements only the client methods exercised here.
		client: client as unknown as ConvexClient,
		subscriptions,
		latest(name = "media:list") {
			const subscription = subscriptions.findLast(entry => entry.name === name && entry.active);
			if (!subscription) throw new Error(`Missing active query: ${name}`);
			return subscription;
		},
		emit(subscription: Subscription, value: unknown) {
			cache.set(key(subscription.name, subscription.args), value);
			if (value instanceof Error) subscription.error(value);
			else subscription.result(value);
		},
	};
}
