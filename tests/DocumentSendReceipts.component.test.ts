import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentEmailRecovery } from "../src/lib/documentEmailRecovery";
import type { DocumentSendReceipt } from "../src/lib/pages/documentSendReceiptState.svelte";
import Harness from "./DocumentSendReceiptsHarness.svelte";

type Record = { _id: string; siteUrl: string; title: string };
const read = vi.fn<(id: string) => Promise<Record | null>>();
const select = vi.fn<(record: Record, openedReceipt: DocumentSendReceipt) => void>();
let component: ReturnType<typeof mount<typeof Harness>> | undefined;

function record(id = "a", title = id, siteUrl = "example.test"): Record {
	return { _id: id, title, siteUrl };
}

function recovery(overrides: Partial<DocumentEmailRecovery> = {}): DocumentEmailRecovery {
	return {
		protocolVersion: 1, attemptId: "attempt-a", document: { type: "invoice", id: "a" },
		status: "sent", recipient: "test@example.invalid", subject: "Invoice",
		claimCount: 1, createdAt: 1, updatedAt: 2, retryUntil: 3, resolveNotAcceptedAt: 3,
		portalExpired: false, canRetry: false, canFinalizeAcceptance: false,
		canRecordAcceptance: false, canResolveNotAccepted: false, ...overrides,
	};
}

async function render() {
	component = mount(Harness, { target: document.body, props: { read, select } });
	await tick();
	return component.state();
}

function receipt(id: string) {
	const entry = document.querySelector<HTMLElement>(`[data-document-id="${id}"]`);
	if (!entry) throw new Error(`Missing receipt: ${id}`);
	return entry;
}

function button(label: string, within: ParentNode = document) {
	const entry = [...within.querySelectorAll<HTMLButtonElement>("button")]
		.find(node => node.textContent?.trim() === label);
	if (!entry) throw new Error(`Missing button: ${label}`);
	return entry;
}

beforeEach(() => {
	read.mockReset().mockImplementation(async id => record(id));
	select.mockReset();
});

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
});

describe("saved document send receipts", () => {
	it("retains independent pending IDs and rejects an older completion of the same ID", async () => {
		const state = await render();
		const old = state.begin("a", "Portrait session");
		const other = state.begin("b", "Family session");
		const current = state.begin("a");
		expect(state.settle(old, "confirmed", "old result")).toBe(false);
		expect(state.settle(other, "uncertain", "delivery is not confirmed.")).toBe(true);
		expect(state.settle(current, "confirmed", "email request confirmed.")).toBe(true);
		await tick();
		expect(state.items).toHaveLength(2);
		expect(state.items.find(item => item.id === "a")?.label).toBe("Portrait session");
		expect(receipt("a").textContent).toContain("Portrait session");
		expect(receipt("a").textContent).toContain("email request confirmed");
		expect(receipt("b").textContent).toContain("delivery is not confirmed");
		expect(document.body.textContent).not.toContain("old result");
		expect(read).not.toHaveBeenCalled();
		expect(select).not.toHaveBeenCalled();
	});

	it("keeps pending notices reachable and dismisses only terminal presentation", async () => {
		const state = await render();
		const owner = state.begin("a");
		state.dismiss("a");
		await tick();
		expect(state.items).toHaveLength(1);
		expect(receipt("a").textContent).toContain("email request in progress");
		expect(receipt("a").querySelectorAll("button")).toHaveLength(1);
		expect(button("open saved invoice", receipt("a")).disabled).toBe(false);
		state.settle(owner, "failed", "the email was rejected. review it before retrying.");
		await tick();
		expect(receipt("a").querySelector('[role="alert"]')?.textContent).toContain("rejected");
		button("dismiss notice", receipt("a")).click();
		await tick();
		expect(state.items).toHaveLength(0);
		expect(document.querySelector('[aria-label="saved document email requests"]')).toBeNull();
		expect(state.settle(owner, "confirmed", "late result")).toBe(false);
		expect(read).not.toHaveBeenCalled();
	});

	it("opens a pending receipt once and retains its send outcome if it settles during the read", async () => {
		const state = await render();
		const owner = state.begin("a");
		expect(state.bindAttempt(owner, "attempt-a")).toBe(true);
		const openedReceipt = state.items[0];
		const deferred = Promise.withResolvers<Record | null>();
		read.mockReturnValueOnce(deferred.promise);
		await tick();
		const opener = button("open saved invoice", receipt("a"));
		opener.focus();
		opener.click();
		await tick();
		expect(document.activeElement).toBe(opener);
		expect(opener.getAttribute("aria-disabled")).toBe("true");
		opener.click();
		await state.open("a");
		state.settle(owner, "confirmed", "email request confirmed.");
		await tick();
		expect(button("opening saved invoice…", receipt("a")).getAttribute("aria-disabled")).toBe("true");
		expect(read).toHaveBeenCalledExactlyOnceWith("a");
		const saved = record("a", "Authoritative saved record");
		deferred.resolve(saved);
		await vi.waitFor(() => expect(select).toHaveBeenCalledOnce());
		await tick();
		expect(select).toHaveBeenCalledExactlyOnceWith(saved, openedReceipt);
		expect(select.mock.calls[0][1]).toBe(openedReceipt);
		expect(openedReceipt).toMatchObject({ generation: owner.generation, stage: "pending", attemptId: "attempt-a", opening: false });
		expect(state.items[0]).toMatchObject({ stage: "confirmed", attemptId: "attempt-a" });
		expect(button("open saved invoice", receipt("a")).disabled).toBe(false);
	});

	it("binds attempt identity only to its current owner and retains it through settle and open", async () => {
		const state = await render();
		const old = state.begin("a");
		expect(state.bindAttempt(old, "superseded-attempt")).toBe(true);
		const current = state.begin("a");
		expect(state.items[0].attemptId).toBeUndefined();
		expect(state.bindAttempt(old, "late-attempt")).toBe(false);
		expect(state.bindAttempt(current, "current-attempt")).toBe(true);
		expect(state.settle(current, "uncertain", "delivery is not confirmed.")).toBe(true);
		const openedReceipt = state.items[0];
		await state.open("a");
		expect(select).toHaveBeenCalledExactlyOnceWith(record(), openedReceipt);
		expect(state.items[0]).toMatchObject({ generation: current.generation, stage: "uncertain", attemptId: "current-attempt", opening: false });
		state.dismiss("a");
		expect(state.bindAttempt(current, "dismissed-attempt")).toBe(false);
	});

	it.each(["sent", "failed", "resolved_not_sent"] as const)("reconciles only the matching pending receipt for terminal %s", async status => {
		const state = await render();
		const owner = state.begin("a");
		state.bindAttempt(owner, "attempt-a");
		state.begin("b");
		expect(state.reconcileAttempt({ attemptId: "attempt-a", recovery: recovery({ status }) }, "invoice")).toBe(true);
		await tick();
		expect(state.items.map(item => item.id)).toEqual(["b"]);
		expect(document.querySelector('[data-document-id="a"]')).toBeNull();
		expect(receipt("b").textContent).toContain("email request in progress");
		expect(state.settle(owner, "uncertain", "late POST result")).toBe(false);
		expect(read).not.toHaveBeenCalled();
		expect(select).not.toHaveBeenCalled();
	});

	it.each(["confirmed", "failed", "uncertain"] as const)("reconciles a matching %s receipt without requiring a pending send", async stage => {
		const state = await render();
		const owner = state.begin("a");
		state.bindAttempt(owner, "attempt-a");
		state.settle(owner, stage, "previous presentation");
		expect(state.reconcileAttempt({ attemptId: "attempt-a", recovery: recovery() }, "invoice")).toBe(true);
		expect(state.items).toHaveLength(0);
	});

	it.each([
		{ name: "another document", projection: recovery({ document: { type: "invoice", id: "b" } }) },
		{ name: "another document type", projection: recovery({ document: { type: "quote", id: "a" } }) },
		{ name: "mismatched inner attempt", projection: recovery({ attemptId: "other" }) },
		{ name: "prepared attempt", projection: recovery({ status: "prepared" }) },
		{ name: "claimed attempt", projection: recovery({ status: "claimed" }) },
		{ name: "uncertain attempt", projection: recovery({ status: "uncertain" }) },
	])("retains all receipts for $name", async ({ projection }) => {
		const state = await render();
		const owner = state.begin("a");
		state.bindAttempt(owner, "attempt-a");
		state.bindAttempt(state.begin("b"), "attempt-b");
		const before = state.items;
		expect(state.reconcileAttempt({ attemptId: "attempt-a", recovery: projection }, "invoice")).toBe(false);
		expect(state.items).toBe(before);
		expect(read).not.toHaveBeenCalled();
		expect(select).not.toHaveBeenCalled();
	});

	it("retains a new generation before and after binding a different attempt", async () => {
		const state = await render();
		state.bindAttempt(state.begin("a"), "attempt-a");
		const current = state.begin("a");
		const result = { attemptId: "attempt-a", recovery: recovery() };
		expect(state.reconcileAttempt(result, "invoice")).toBe(false);
		state.bindAttempt(current, "new-attempt");
		expect(state.reconcileAttempt(result, "invoice")).toBe(false);
		expect(state.items[0]).toMatchObject({ generation: current.generation, attemptId: "new-attempt", stage: "pending" });
	});

	it("invalidates a delayed open when its exact attempt is reconciled", async () => {
		const state = await render();
		state.bindAttempt(state.begin("a"), "attempt-a");
		const deferred = Promise.withResolvers<Record | null>();
		read.mockReturnValueOnce(deferred.promise);
		const opening = state.open("a");
		expect(state.reconcileAttempt({ attemptId: "attempt-a", recovery: recovery() }, "invoice")).toBe(true);
		deferred.resolve(record());
		await opening;
		expect(select).not.toHaveBeenCalled();
		expect(state.items).toHaveLength(0);
	});

	it.each([
		{ name: "missing record", result: null },
		{ name: "another ID", result: record("other") },
		{ name: "another site", result: record("a", "Foreign", "other.test") },
	])("rejects $name without replacing the receipt and can retry the read", async ({ result }) => {
		const state = await render();
		state.begin("a");
		read.mockResolvedValueOnce(result);
		await state.open("a");
		await tick();
		expect(select).not.toHaveBeenCalled();
		expect(state.items[0].stage).toBe("pending");
		expect(receipt("a").querySelector('[role="alert"]')?.textContent).toContain("could not open this saved record");
		expect(button("open saved invoice", receipt("a")).disabled).toBe(false);
		await state.open("a");
		await tick();
		expect(select).toHaveBeenCalledExactlyOnceWith(record(), expect.objectContaining({ id: "a", stage: "pending" }));
		expect(receipt("a").querySelector('[role="alert"]')).toBeNull();
		expect(state.items[0].stage).toBe("pending");
	});

	it("shows a generic query error and the native Open action retries without changing send state", async () => {
		const state = await render();
		const owner = state.begin("a");
		state.settle(owner, "uncertain", "delivery is not confirmed.");
		read.mockRejectedValueOnce(new Error("private backend failure"));
		await tick();
		button("open saved invoice", receipt("a")).click();
		await vi.waitFor(() => expect(receipt("a").querySelector('[role="alert"]')).not.toBeNull());
		expect(receipt("a").textContent).not.toContain("private backend failure");
		button("open saved invoice", receipt("a")).click();
		await vi.waitFor(() => expect(select).toHaveBeenCalledExactlyOnceWith(record(), expect.objectContaining({ id: "a", stage: "uncertain" })));
		expect(read).toHaveBeenCalledTimes(2);
		expect(state.items[0].stage).toBe("uncertain");
		expect(receipt("a").querySelector('[role="alert"]')).toBeNull();
	});

	it.each(["resolve", "reject"] as const)("ignores an old %s after intent changes and the same ID is opened again", async outcome => {
		const state = await render();
		state.begin("a");
		const old = Promise.withResolvers<Record | null>();
		const current = Promise.withResolvers<Record | null>();
		read.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
		const earlierOpen = state.open("a");
		state.invalidateOpen();
		expect(state.items[0].opening).toBe(false);
		const latestOpen = state.open("a");
		if (outcome === "resolve") old.resolve(record("a", "Old result"));
		else old.reject(new Error("old read failure"));
		await earlierOpen;
		expect(select).not.toHaveBeenCalled();
		expect(state.items[0].opening).toBe(true);
		expect(state.items[0].openError).toBe("");
		const saved = record("a", "Latest result");
		current.resolve(saved);
		await latestOpen;
		expect(select).toHaveBeenCalledExactlyOnceWith(saved, expect.objectContaining({ id: "a", stage: "pending" }));
	});

	it("lets only the newest explicit open select while a late create acknowledgement adds feedback", async () => {
		const state = await render();
		state.begin("a");
		state.begin("b");
		const a = Promise.withResolvers<Record | null>();
		const b = Promise.withResolvers<Record | null>();
		read.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
		const openA = state.open("a");
		const openB = state.open("b");
		state.begin("c", "Acknowledged later");
		expect(state.items.filter(item => item.opening).map(item => item.id)).toEqual(["b"]);
		a.resolve(record("a"));
		await openA;
		expect(select).not.toHaveBeenCalled();
		b.resolve(record("b"));
		await openB;
		expect(select).toHaveBeenCalledExactlyOnceWith(record("b"), expect.objectContaining({ id: "b", stage: "pending" }));
		expect(state.items.map(item => item.id)).toEqual(["a", "b", "c"]);
	});

	it("does not adopt a read or completion from an older generation of the same receipt", async () => {
		const state = await render();
		const old = state.begin("a", "Original action");
		state.bindAttempt(old, "old-attempt");
		const deferred = Promise.withResolvers<Record | null>();
		read.mockReturnValueOnce(deferred.promise);
		const opening = state.open("a");
		const current = state.begin("a", "New action");
		deferred.resolve(record("a", "Old read"));
		await opening;
		expect(select).not.toHaveBeenCalled();
		expect(state.settle(old, "failed", "old failure")).toBe(false);
		expect(state.bindAttempt(old, "late-old-attempt")).toBe(false);
		expect(state.items[0].attemptId).toBeUndefined();
		expect(state.items[0]).toMatchObject({ generation: current.generation, label: "New action", stage: "pending", opening: false, openError: "" });
	});

	it("does not reopen a terminal notice dismissed during its read", async () => {
		const state = await render();
		const owner = state.begin("a");
		state.settle(owner, "confirmed", "email request confirmed.");
		const deferred = Promise.withResolvers<Record | null>();
		read.mockReturnValueOnce(deferred.promise);
		const opening = state.open("a");
		state.dismiss("a");
		deferred.resolve(record());
		await opening;
		expect(select).not.toHaveBeenCalled();
		expect(state.items).toHaveLength(0);
	});

	it("ignores invalidated reads without cancelling the receipt's pending send", async () => {
		const state = await render();
		const owner = state.begin("a");
		const deferred = Promise.withResolvers<Record | null>();
		read.mockReturnValueOnce(deferred.promise);
		const opening = state.open("a");
		state.invalidateOpen();
		deferred.resolve(record());
		await opening;
		expect(select).not.toHaveBeenCalled();
		expect(state.items[0]).toMatchObject({ stage: "pending", opening: false });
		expect(state.settle(owner, "confirmed", "email request confirmed.")).toBe(true);
	});

	it("ignores late reads, results and acknowledgements after unmount", async () => {
		const state = await render();
		const owner = state.begin("a");
		state.bindAttempt(owner, "attempt-a");
		const deferred = Promise.withResolvers<Record | null>();
		read.mockReturnValueOnce(deferred.promise);
		const opening = state.open("a");
		const before = state.items;
		if (!component) throw new Error("Missing mounted harness");
		await unmount(component);
		component = undefined;
		state.invalidateOpen();
		state.begin("b");
		expect(state.settle(owner, "failed", "late failure")).toBe(false);
		expect(state.bindAttempt(owner, "late-attempt")).toBe(false);
		expect(state.reconcileAttempt({ attemptId: "attempt-a", recovery: recovery() }, "invoice")).toBe(false);
		state.dismiss("a");
		deferred.resolve(record());
		await opening;
		await state.open("a");
		expect(select).not.toHaveBeenCalled();
		expect(read).toHaveBeenCalledTimes(1);
		expect(state.items).toBe(before);
	});
});
