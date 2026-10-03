import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import Harness from "./InquiriesHarness.svelte";
import { queryClient } from "./controlledQueryClient";
import type { InquiryStatus, InquiryUI } from "../src/lib/types";

const fixture = vi.hoisted(() => ({ legacy: false, http: false, toast: vi.fn() }));
vi.mock("../src/lib/config", async () => {
	const { inquiryFixtureConfig } = await import("./fixtures/inquiries/config");
	return { getAdminConfig: () => ({
		...inquiryFixtureConfig,
		mutationTransport: fixture.http ? "http" : "websocket",
		api: { inquiries: {
			...inquiryFixtureConfig.api.inquiries,
			listPaginated: fixture.legacy ? undefined : inquiryFixtureConfig.api.inquiries.listPaginated,
		} },
	}) };
});
vi.mock("../src/lib/toast", () => ({ addToast: fixture.toast }));
vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn() } }));

const queryName = "inquiries:listPaginated";
function inquiry(id: string, status: InquiryStatus = "new") {
	return { _id: id, _creationTime: 1, siteUrl: "example.test", name: id,
		email: `${id}@example.test`, message: `Message from ${id}`, status };
}
function page(rows: ReturnType<typeof inquiry>[], continueCursor = "") {
	return { page: rows, continueCursor, isDone: !continueCursor };
}
function button(label: string, within: ParentNode = document) {
	const found = [...within.querySelectorAll<HTMLButtonElement>("button")]
		.find((entry) => entry.textContent?.trim() === label || entry.getAttribute("aria-label") === label);
	if (!found) throw new Error(`Missing button: ${label}`);
	return found;
}
async function closeModal() {
	button("Close dialog").click();
	await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
}
function row(name: string) {
	const found = [...document.querySelectorAll("tbody tr")]
		.find((entry) => entry.textContent?.includes(name));
	if (!found) throw new Error(`Missing row: ${name}`);
	return found;
}
async function filter(status: string) {
	const select = document.querySelector("select");
	if (!select) throw new Error("Missing status filter");
	select.value = status;
	select.dispatchEvent(new Event("change", { bubbles: true }));
	await tick();
}
function deferred() {
	let resolve!: (value: unknown) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}

let component: ReturnType<typeof mount> | undefined;
async function render(onMutation?: Parameters<typeof queryClient>[0], inquiries?: InquiryUI[]) {
	const queries = queryClient(onMutation);
	component = mount(Harness, { target: document.body, props: { client: queries.client, inquiries } });
	await tick();
	return queries;
}
beforeEach(() => { fixture.legacy = false; fixture.http = false; fixture.toast.mockClear(); });
afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

describe("reactive inquiry pages", () => {
	it("reaches older pages, ignores late old results, and resets pagination for server filtering", async () => {
		const queries = await render();
		const first = queries.latest(queryName);
		expect(first.args).toEqual({ siteUrl: "example.test", paginationOpts: { numItems: 25, cursor: null, id: 0 } });
		expect(document.body.textContent).toContain("loading inquiries");
		queries.emit(first, page([inquiry("newest", "replied")], "older")); await tick();
		expect(document.body.textContent).toContain("1 inquiry on this page");
		button("next").click(); button("next").click(); await tick();
		const second = queries.latest(queryName);
		expect(second.args.paginationOpts?.cursor).toBe("older");
		expect(first.active).toBe(false);
		first.result(page([inquiry("late")], "wrong")); await tick();
		expect(document.body.textContent).not.toContain("late@example.test");
		queries.emit(second, page([inquiry("oldest unanswered")])); await tick();
		expect(row("oldest unanswered")).toBeDefined();
		expect(button("next").disabled).toBe(true);
		await filter("new");
		expect(queries.latest(queryName).args).toEqual({ siteUrl: "example.test", status: "new", paginationOpts: { numItems: 25, cursor: null, id: 0 } });
		expect(button("previous").disabled).toBe(true);
		expect(document.body.textContent).not.toContain("oldest unanswered@example.test");
		queries.emit(queries.latest(queryName), page([inquiry("oldest unanswered")])); await tick();
		expect(row("oldest unanswered")).toBeDefined();
		expect(queries.subscriptions.filter((entry) => entry.active)).toHaveLength(1);
	});

	it("keeps failed and incomplete pages distinct from empty results and retries the same cursor", async () => {
		const queries = await render();
		queries.emit(queries.latest(queryName), page([inquiry("first")], "second")); await tick();
		button("next").click(); await tick();
		const failed = queries.latest(queryName);
		queries.emit(failed, new Error("offline")); await tick();
		expect(document.querySelector('[role="alert"]')).not.toBeNull();
		expect(document.body.textContent).not.toContain("no inquiries found");
		button("retry").click(); await tick();
		expect(queries.latest(queryName).args.paginationOpts).toEqual({ numItems: 25, cursor: "second", id: 1 });
		queries.emit(queries.latest(queryName), { ...page([inquiry("incomplete")], "unsafe"), pageStatus: "SplitRequired" }); await tick();
		expect(document.body.textContent).not.toContain("incomplete@example.test");
		expect(button("next").disabled).toBe(true);
		expect(button("previous").disabled).toBe(false);
		const count = queries.subscriptions.length;
		await tick(); expect(queries.subscriptions).toHaveLength(count);
		button("retry").click(); await tick();
		expect(queries.latest(queryName).args.paginationOpts?.id).toBe(2);
		queries.emit(queries.latest(queryName), page([])); await tick();
		failed.error(new Error("late failure")); await tick();
		expect(document.querySelector('[role="alert"]')).toBeNull();
		expect(document.body.textContent).toContain("no inquiries found");
		button("previous").click(); await tick();
		expect(queries.latest(queryName).args.paginationOpts?.cursor).toBeNull();
	});

	it("reveals newer server data after a rejected optimistic edit and leaves another selection unchanged", async () => {
		const pending = deferred();
		const mutate = vi.fn(() => pending.promise);
		const queries = await render(mutate);
		queries.emit(queries.latest(queryName), page([inquiry("alpha"), inquiry("beta")])); await tick();
		button("view", row("alpha")).click(); await tick();
		button("mark read").click(); await tick();
		expect(mutate).toHaveBeenCalledExactlyOnceWith("inquiries:updateStatus", { id: "alpha", status: "read" });
		queries.emit(queries.latest(queryName), page([inquiry("alpha", "replied"), inquiry("beta")])); await tick();
		await closeModal();
		button("view", row("beta")).click(); await tick();
		pending.reject(new Error("rejected")); await tick(); await tick();
		expect(row("alpha").textContent).toContain("replied");
		expect(row("beta").textContent).toContain("new");
		expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Message from beta");
		expect(button("mark read").disabled).toBe(false);
		expect(fixture.toast).toHaveBeenCalledWith("Failed to update inquiry status.");
	});

	it("moves a successfully triaged row out of its server status filter", async () => {
		const pending = deferred();
		const queries = await render(() => pending.promise);
		await filter("new");
		queries.emit(queries.latest(queryName), page([inquiry("unanswered")])); await tick();
		button("view", row("unanswered")).click(); await tick();
		button("mark read").click(); await tick();
		expect(document.querySelectorAll("tbody tr")).toHaveLength(0);
		queries.emit(queries.latest(queryName), page([])); await tick();
		pending.resolve(null); await tick(); await tick();
		expect(document.querySelector('[role="dialog"]')?.textContent).toContain("read");
		await closeModal();
		queries.emit(queries.latest(queryName), page([])); await tick();
		expect(document.body.textContent).toContain("0 inquiries on this page");
		await filter("read");
		expect(queries.latest(queryName).args.status).toBe("read");
		queries.emit(queries.latest(queryName), page([inquiry("unanswered", "read")])); await tick();
		expect(row("unanswered").textContent).toContain("read");
	});

	it("retains updated server rows when deletion fails", async () => {
		vi.stubGlobal("confirm", () => true);
		const pending = deferred();
		const queries = await render(() => pending.promise);
		queries.emit(queries.latest(queryName), page([inquiry("alpha"), inquiry("beta")])); await tick();
		button("view", row("alpha")).click(); await tick();
		button("delete inquiry").click(); await tick();
		queries.emit(queries.latest(queryName), page([inquiry("alpha", "replied"), inquiry("beta")])); await tick();
		pending.reject(new Error("denied")); await tick(); await tick();
		expect(row("alpha").textContent).toContain("replied");
		expect(fixture.toast).toHaveBeenCalledWith("Could not delete the inquiry. Refresh and try again.");
	});

	it("does not restore stale status when HTTP succeeds before the live query updates", async () => {
		fixture.http = true;
		const response = deferred();
		const request = vi.fn(() => response.promise);
		vi.stubGlobal("fetch", request);
		const queries = await render();
		queries.emit(queries.latest(queryName), page([inquiry("alpha")])); await tick();
		button("view", row("alpha")).click(); await tick();
		button("mark read").click(); await tick();
		expect(request).toHaveBeenCalledWith("/api/admin/mutation", expect.objectContaining({
			body: JSON.stringify({ name: "inquiries:updateStatus", args: { id: "alpha", status: "read" } }),
		}));
		response.resolve(new Response(JSON.stringify({ result: null })));
		await vi.waitFor(() => expect(queries.latest(queryName).args.paginationOpts?.id).toBe(1));
		expect(document.querySelectorAll("tbody tr")).toHaveLength(0);
		expect(document.querySelector('[role="dialog"] .status-label')?.textContent).toBe("read");
		expect(queries.subscriptions.filter((entry) => entry.active)).toHaveLength(1);
		queries.emit(queries.latest(queryName), page([inquiry("alpha", "replied")])); await tick();
		expect(row("alpha").textContent).toContain("replied");
		expect(document.querySelector('[role="dialog"] .status-label')?.textContent).toBe("replied");
	});

	it("refreshes after deleting an earlier selection without closing the current inquiry", async () => {
		vi.stubGlobal("confirm", () => true);
		const pending = deferred();
		const queries = await render(() => pending.promise);
		queries.emit(queries.latest(queryName), page([inquiry("alpha"), inquiry("beta")])); await tick();
		button("view", row("alpha")).click(); await tick();
		button("delete inquiry").click(); await tick();
		await closeModal();
		button("view", row("beta")).click(); await tick();
		pending.resolve(null);
		await vi.waitFor(() => expect(queries.latest(queryName).args.paginationOpts?.id).toBe(1));
		expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Message from beta");
		expect(document.querySelectorAll("tbody tr")).toHaveLength(0);
		queries.emit(queries.latest(queryName), page([inquiry("beta")])); await tick();
		expect(document.querySelectorAll("tbody tr")).toHaveLength(1);
		expect(row("beta")).toBeDefined();
	});

	it("keeps the legacy supplied-data path usable without the optional query", async () => {
		fixture.legacy = true;
		vi.stubGlobal("confirm", () => true);
		const legacy: InquiryUI = { ...inquiry("legacy"), subject: null, submittedAt: new Date(1).toISOString() };
		const mutate = vi.fn().mockResolvedValue(null);
		const queries = await render(mutate, [legacy]);
		expect(queries.subscriptions).toHaveLength(0);
		expect(document.querySelector('[aria-label="Inquiry pages"]')).toBeNull();
		button("view", row("legacy")).click(); await tick();
		button("mark read").click(); await tick(); await tick();
		expect(row("legacy").textContent).toContain("read");
		await vi.waitFor(() => expect(button("delete inquiry").disabled).toBe(false));
		button("delete inquiry").click();
		await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
		expect(document.body.textContent).toContain("no inquiries found");
	});
});
