import { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDashboardSnapshot } from "../src/lib/pages/dashboard/readDashboardSnapshot";

// Exercise the installed SDK, including its real query and unsubscribe behavior.
// Only the WebSocket peer is synthetic; no deployment or credentials are used.
class SnapshotSocket {
	static instances: SnapshotSocket[] = [];
	onopen: (() => void) | null = null;
	onclose: ((event: { code: number; reason: string }) => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	onerror: (() => void) | null = null;
	readonly sent: string[] = [];
	constructor() {
		SnapshotSocket.instances.push(this);
		queueMicrotask(() => this.onopen?.());
	}
	send(data: string) { this.sent.push(data); }
	close() { this.onclose?.({ code: 1000, reason: "test complete" }); }
	result(modification: Record<string, unknown>, first = false) {
		this.onmessage?.({ data: JSON.stringify({
			type: "Transition",
			startVersion: { querySet: first ? 0 : 1, identity: 0, ts: "AAAAAAAAAAA=" },
			endVersion: { querySet: 1, identity: 0, ts: "AAAAAAAAAAA=" },
			modifications: [{ queryId: 0, logLines: [], journal: null, ...modification }],
		}) });
	}
	queryChanges(type: "Add" | "Remove") {
		return this.sent.flatMap((data) => {
			const value: unknown = JSON.parse(data);
			if (!value || typeof value !== "object" || !("modifications" in value) || !Array.isArray(value.modifications)) return [];
			return value.modifications.filter((entry: unknown) => entry && typeof entry === "object" && "type" in entry && entry.type === type);
		});
	}
}

const query = makeFunctionReference<"query", Record<string, never>, unknown>("inquiries:listPaginated");
const page = { page: [], isDone: true, continueCursor: "" };
let client: ConvexClient;
function socket() {
	const value = SnapshotSocket.instances[0];
	if (!value) throw new Error("Expected an in-memory socket");
	return value;
}
async function settle() { await new Promise((resolve) => setTimeout(resolve, 0)); }

beforeEach(() => {
	SnapshotSocket.instances = [];
	vi.stubGlobal("WebSocket", SnapshotSocket);
	client = new ConvexClient("https://snapshot-test.convex.cloud", { logger: false });
});
afterEach(async () => { await client.close(); vi.unstubAllGlobals(); });

describe("dashboard snapshots through the real Convex client", () => {
	it("demonstrates the previous one-shot read unsubscribes on the first failure", async () => {
		const result = client.query(query, {});
		const rejected = expect(result).rejects.toThrow("Unauthenticated");
		await settle();
		socket().result({ type: "QueryFailed", errorMessage: "Unauthenticated" }, true);
		await rejected;
		expect(socket().queryChanges("Add")).toHaveLength(1);
		expect(socket().queryChanges("Remove")).toHaveLength(1);
	});
	it("retains failures until a valid result, then releases and freezes the snapshot", async () => {
		const accept = vi.fn(); const fail = vi.fn();
		const stop = readDashboardSnapshot(client, query, {}, accept, fail);
		await settle();
		socket().result({ type: "QueryFailed", errorMessage: "Unauthenticated" }, true);
		expect(fail).toHaveBeenCalledTimes(1);
		expect(accept).not.toHaveBeenCalled();
		expect(socket().queryChanges("Remove")).toHaveLength(0);
		socket().result({ type: "QueryFailed", errorMessage: "Still unavailable" });
		expect(fail).toHaveBeenCalledTimes(2);
		socket().result({ type: "QueryUpdated", value: page });
		expect(accept).toHaveBeenCalledExactlyOnceWith(page);
		expect(socket().queryChanges("Remove")).toHaveLength(1);
		socket().result({ type: "QueryUpdated", value: { ...page, isDone: false } });
		stop(); stop();
		expect(accept).toHaveBeenCalledTimes(1);
		expect(socket().queryChanges("Add")).toHaveLength(1);
		expect(socket().queryChanges("Remove")).toHaveLength(1);
	});
	it("keeps malformed response failures visible and accepts a later valid response", async () => {
		const fail = vi.fn(); const accepted = vi.fn();
		readDashboardSnapshot(client, query, {}, (value) => {
			if (!value || typeof value !== "object" || !("page" in value) || !Array.isArray(value.page)) throw new Error("Invalid page");
			accepted(value);
		}, fail);
		await settle();
		socket().result({ type: "QueryUpdated", value: "invalid" }, true);
		expect(fail).toHaveBeenCalledOnce();
		expect(accepted).not.toHaveBeenCalled();
		expect(socket().queryChanges("Remove")).toHaveLength(0);
		socket().result({ type: "QueryUpdated", value: page });
		expect(accepted).toHaveBeenCalledExactlyOnceWith(page);
		expect(socket().queryChanges("Remove")).toHaveLength(1);
	});
	it("releases a still-failed read on cleanup and ignores subsequent results", async () => {
		const accept = vi.fn(); const fail = vi.fn();
		const stop = readDashboardSnapshot(client, query, {}, accept, fail);
		await settle();
		socket().result({ type: "QueryFailed", errorMessage: "Unauthenticated" }, true);
		stop();
		socket().result({ type: "QueryUpdated", value: page });
		expect(fail).toHaveBeenCalledOnce();
		expect(accept).not.toHaveBeenCalled();
		expect(socket().queryChanges("Remove")).toHaveLength(1);
	});
});
