import { describe, expect, it, vi } from "vitest";
import type { DocumentEmailRecovery } from "../src/lib/documentEmailRecovery";
import { createDocumentEmailRecoveryState } from "../src/lib/pages/documentEmailRecoveryState.svelte";

type Options = Parameters<typeof createDocumentEmailRecoveryState>[0];

function recovery(documentId: string, attemptId: string): DocumentEmailRecovery {
	return {
		protocolVersion: 1, attemptId, document: { type: "invoice", id: documentId },
		status: "sent", recipient: "test@example.invalid", subject: "Invoice",
		claimCount: 1, createdAt: 1, updatedAt: 2, retryUntil: 3,
		resolveNotAcceptedAt: 3, portalExpired: false, canRetry: false,
		canFinalizeAcceptance: false, canRecordAcceptance: false, canResolveNotAccepted: false,
	};
}

function setup() {
	let selected: string | undefined = "a";
	const pendingAttempts = new Map<string, string>();
	const tracker: Options["tracker"] = {
		pending: (key, endpoint) => {
			const attemptId = pendingAttempts.get(key);
			return attemptId ? { attemptId, endpoint, body: {} } : undefined;
		},
		hydrate: vi.fn(async () => null),
		clearResolved: vi.fn(() => true),
	};
	const state = createDocumentEmailRecoveryState({
		type: "invoice", endpoint: (id) => `/send/${id}`, selectedId: () => selected,
		tracker, onHydrateError: vi.fn(),
	});
	return { state, tracker, pendingAttempts, select: (id: string | undefined) => { selected = id; } };
}

describe("document email recovery state", () => {
	it("does not show a completed hydration after the operator switches documents", async () => {
		const { state, tracker, pendingAttempts, select } = setup();
		const deferred = Promise.withResolvers<{ attemptId: string; recovery: DocumentEmailRecovery }>();
		vi.mocked(tracker.hydrate).mockReturnValueOnce(deferred.promise);
		pendingAttempts.set("invoice:a", "old");
		const hydration = state.hydrate("a");
		expect(state.forDocument("a")?.attemptId).toBe("old");
		select("b");
		state.remember("b", { attemptId: "b-attempt" });
		deferred.resolve({ attemptId: "old", recovery: recovery("a", "old") });
		await hydration;
		expect(state.forDocument("a")).toBeNull();
		expect(state.forDocument("b")?.attemptId).toBe("b-attempt");
	});

	it("keeps a newer attempt visible when an older resolution arrives", () => {
		const { state, tracker, pendingAttempts } = setup();
		state.remember("a", { attemptId: "old" });
		pendingAttempts.set("invoice:a", "new");
		state.remember("a", { attemptId: "new" });
		expect(state.resolve({ attemptId: "old", recovery: recovery("a", "old") })).toBe(false);
		expect(state.forDocument("a")?.attemptId).toBe("new");
		expect(tracker.clearResolved).toHaveBeenCalledWith("invoice:a", "old");
		expect(state.resolve({ attemptId: "new", recovery: recovery("a", "new") })).toBe(true);
		expect(state.dismiss({ attemptId: "old", recovery: recovery("a", "old") })).toBe(false);
		expect(state.dismiss({ attemptId: "new", recovery: recovery("a", "new") })).toBe(true);
		expect(state.forDocument("a")).toBeNull();
	});

	it("does not replace a newer visible attempt with a late hydration of the same document", async () => {
		const { state, tracker, pendingAttempts } = setup();
		const deferred = Promise.withResolvers<{ attemptId: string; recovery: DocumentEmailRecovery }>();
		vi.mocked(tracker.hydrate).mockReturnValueOnce(deferred.promise);
		pendingAttempts.set("invoice:a", "old");
		const hydration = state.hydrate("a");
		state.remember("a", { attemptId: "new" });
		deferred.resolve({ attemptId: "old", recovery: recovery("a", "old") });
		await hydration;
		expect(state.forDocument("a")?.attemptId).toBe("new");
	});
});
