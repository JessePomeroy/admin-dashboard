import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Harness from "./SingletonDraftHarness.svelte";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}

let page: ReturnType<typeof mount<Harness>> | undefined;
const save = vi.fn(async (_payload: { text: string }, _revision: string | undefined) => ({ revisionId: "saved" }));

async function render() {
	page = mount(Harness, { target: document.body, props: { save } });
	page.draft.initialize({ text: "server" }, "base");
	await tick();
	return page.draft;
}

beforeEach(() => {
	vi.useFakeTimers();
	save.mockReset().mockResolvedValue({ revisionId: "saved" });
	localStorage.clear();
	vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(async () => {
	if (page) await unmount(page);
	page = undefined;
	document.body.innerHTML = "";
	vi.restoreAllMocks();
	vi.useRealTimers();
});

it("serializes overlapping saves and flushes edits made during the first request", async () => {
	const first = deferred<{ revisionId: string }>();
	save.mockReturnValueOnce(first.promise);
	const draft = await render();
	draft.form.text = "first";
	const a = draft.saveNow();
	draft.form.text = "second";
	const b = draft.saveNow();
	await tick();
	await vi.advanceTimersByTimeAsync(1000);
	expect(save).toHaveBeenCalledTimes(1);
	first.resolve({ revisionId: "first-revision" });
	expect(await a).toBe(true);
	expect(await b).toBe(true);
	expect(save.mock.calls).toEqual([[{ text: "first" }, "base"], [{ text: "second" }, "first-revision"]]);
	expect(draft.state).toBe("saved");
	expect(localStorage.getItem("singleton-test")).toBeNull();
});

it("persists offline edits and saves them when connectivity returns", async () => {
	const draft = await render();
	window.dispatchEvent(new Event("offline"));
	draft.form.text = "offline";
	await tick();
	await vi.advanceTimersByTimeAsync(2000);
	expect(save).not.toHaveBeenCalled();
	expect(draft.state).toBe("offline");
	expect(JSON.parse(localStorage.getItem("singleton-test")!)).toMatchObject({ schemaVersion: 1, baseRevisionId: "base", payload: { text: "offline" } });
	window.dispatchEvent(new Event("online"));
	await draft.saveNow();
	expect(save).toHaveBeenCalledWith({ text: "offline" }, "base");
	expect(draft.state).toBe("saved");
});

it("keeps a stale device revision across remount and reloads the latest server draft explicitly", async () => {
	localStorage.setItem("singleton-test", JSON.stringify({ schemaVersion: 1, baseRevisionId: "old", payload: { text: "local" } }));
	let draft = await render();
	expect(draft.state).toBe("conflict");
	expect(await draft.saveNow()).toBe(false);
	await unmount(page!); page = undefined;
	expect(JSON.parse(localStorage.getItem("singleton-test")!).baseRevisionId).toBe("old");
	draft = await render();
	expect(draft.form.text).toBe("local");
	expect(draft.state).toBe("conflict");
	draft.observeServer({ text: "newest" }, "newest-revision");
	draft.reloadServer();
	expect(draft.form.text).toBe("newest");
	draft.form.text = "reviewed edit";
	await draft.saveNow();
	expect(save).toHaveBeenCalledWith({ text: "reviewed edit" }, "newest-revision");
});

it("suppresses automatic retries of a failed snapshot but allows a manual retry", async () => {
	save.mockRejectedValueOnce(new Error("Network unavailable"));
	const draft = await render();
	draft.form.text = "unsaved";
	await tick();
	await vi.advanceTimersByTimeAsync(900);
	expect(draft.state).toBe("error");
	await vi.advanceTimersByTimeAsync(5000);
	expect(save).toHaveBeenCalledTimes(1);
	expect(await draft.saveNow()).toBe(true);
	expect(save).toHaveBeenCalledTimes(2);
});

it("keeps server saving available when browser storage is unavailable", async () => {
	vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
	const draft = await render();
	draft.form.text = "changed";
	await tick();
	expect(draft.error).toContain("could not preserve");
	expect(await draft.saveNow()).toBe(true);
	expect(save).toHaveBeenCalledWith({ text: "changed" }, "base");
});

it("publishes the saved revision and preserves edits made during publication", async () => {
	const publication = deferred<unknown>();
	const publish = vi.fn(() => publication.promise);
	const draft = await render();
	draft.form.text = "publish this";
	const result = draft.publish(publish);
	await tick();
	await vi.advanceTimersByTimeAsync(0);
	expect(publish).toHaveBeenCalledWith("saved");
	draft.form.text = "next draft";
	await tick();
	await vi.advanceTimersByTimeAsync(1000);
	expect(save).toHaveBeenCalledTimes(1);
	publication.resolve(null);
	expect(await result).toEqual({ text: "publish this" });
	expect(draft.form.text).toBe("next draft");
	expect(draft.state).toBe("dirty");
	await vi.advanceTimersByTimeAsync(900);
	expect(save).toHaveBeenLastCalledWith({ text: "next draft" }, undefined);
});

it("waits for an active save before discarding its resulting revision", async () => {
	const saving = deferred<{ revisionId: string }>();
	save.mockReturnValueOnce(saving.promise);
	const discard = vi.fn(async (_id: string) => null);
	const draft = await render();
	draft.form.text = "discard me";
	const pendingSave = draft.saveNow();
	const result = draft.discard({ text: "published" }, discard);
	expect(discard).not.toHaveBeenCalled();
	saving.resolve({ revisionId: "discard-revision" });
	await pendingSave;
	expect(await result).toBe(true);
	expect(discard).toHaveBeenCalledWith("discard-revision");
	expect(draft.form.text).toBe("published");
	expect(draft.state).toBe("saved");
});

it("does not erase recovery data when a save completes after unmount", async () => {
	const saving = deferred<{ revisionId: string }>();
	save.mockReturnValueOnce(saving.promise);
	const draft = await render();
	draft.form.text = "recover me";
	const result = draft.saveNow();
	await tick();
	await unmount(page!); page = undefined;
	saving.resolve({ revisionId: "late" });
	expect(await result).toBe(false);
	expect(JSON.parse(localStorage.getItem("singleton-test")!).payload.text).toBe("recover me");
	window.dispatchEvent(new Event("online"));
	await vi.advanceTimersByTimeAsync(2000);
	expect(save).toHaveBeenCalledTimes(1);
});

it("drops malformed local data while keeping the server draft editable", async () => {
	localStorage.setItem("singleton-test", "{broken");
	const draft = await render();
	expect(draft.form.text).toBe("server");
	expect(draft.state).toBe("saved");
	expect(localStorage.getItem("singleton-test")).toBeNull();
});

it("warns on unload only for pending work and cancels debounce on unmount", async () => {
	const draft = await render();
	const clean = new Event("beforeunload", { cancelable: true });
	window.dispatchEvent(clean);
	expect(clean.defaultPrevented).toBe(false);
	draft.form.text = "pending";
	await tick();
	const dirty = new Event("beforeunload", { cancelable: true });
	window.dispatchEvent(dirty);
	expect(dirty.defaultPrevented).toBe(true);
	await unmount(page!); page = undefined;
	await vi.advanceTimersByTimeAsync(2000);
	expect(save).not.toHaveBeenCalled();
});
