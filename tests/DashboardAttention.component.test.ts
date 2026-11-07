import { mount, tick, unmount } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantAdminServerSession } from "../src/lib/adminSession";
import DashboardAttention from "../src/lib/pages/dashboard/DashboardAttention.svelte";

const fixture = vi.hoisted(() => ({
	query: vi.fn(), clientSetup: vi.fn(),
	missingInquiryRef: "", records: true, recordGet: true, orderList: true,
}));
vi.mock("../src/lib/adminClient", () => ({ useAdminClient: () => {
	fixture.clientSetup();
	return { query: fixture.query };
} }));
vi.mock("../src/lib/config", () => ({ getAdminConfig: () => ({
	siteUrl: "fixture.example", api: {
		inquiries: Object.fromEntries(["listPaginated", "getWorkflow", "clientOptions", "linkClient", "updateFollowUp"]
			.filter((key) => fixture.missingInquiryRef !== key).map((key) => [key, `inquiries:${key}`])),
		...(fixture.records ? { businessRecords: { list: "records:list", ...(fixture.recordGet ? { get: "records:get" } : {}) } } : {}),
		orders: { ...(fixture.orderList ? { list: "orders:list" } : {}) },
		invoices: { getDashboardSummary: "invoice:summary", list: "invoice:recent" },
	},
}) }));

interface QueryArgs { siteUrl: string; status?: string; kind?: string; followUpBefore?: string; paginationOpts?: { numItems: number; cursor: null } }
const authorized: TenantAdminServerSession = { status: "authorized", email: "owner@example.test", tier: "full", isCreator: false };
let component: ReturnType<typeof mount> | undefined;
let sessions: SvelteMap<string, TenantAdminServerSession>;
let results: Map<string, unknown>;
function page(rows: unknown[] = [], isDone = true, extra: Record<string, unknown> = {}) {
	return { page: rows, isDone, continueCursor: isDone ? "" : "next", ...extra };
}
function inquiry(id = "due-old", name = "Older follow-up") {
	return { _id: id, _creationTime: 1, name, subject: "Portrait session", followUpDate: "2026-01-01" };
}
function invoice(id = "unpaid-old", status = "overdue") {
	return { _id: id, _creationTime: 1, invoiceNumber: `INV-${id}`, clientName: "Older client", status, dueDate: "2025-01-01" };
}
function order(id = "exception-old", createdAt = 1) {
	return { _id: id, _creationTime: createdAt, orderNumber: `ORDER-${id}`, customerEmail: "client@example.test", status: "fulfillment_error" };
}
function key(ref: string, args: QueryArgs) {
	return ref === "records:list" ? args.status! : ref === "orders:list" ? "fulfillment" : "follow-ups";
}
function deferred() {
	let resolve!: (value: unknown) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}
async function settle() { await tick(); await Promise.resolve(); await tick(); }
async function render(session: TenantAdminServerSession = authorized) {
	sessions = new SvelteMap([["session", session]]);
	component = mount(DashboardAttention, { target: document.body, props: {
		get data() { return { adminSession: sessions.get("session")! }; },
	} });
	await settle();
}
function group(name: string) {
	const found = document.querySelector<HTMLElement>(`[data-attention="${name}"]`);
	if (!found) throw new Error(`Missing group ${name}`);
	return found;
}
function button(label: string) {
	const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((entry) => entry.getAttribute("aria-label") === label || entry.textContent?.trim() === label);
	if (!found) throw new Error(`Missing button ${label}`);
	return found;
}
function calls(name: string) {
	return fixture.query.mock.calls.filter(([ref, args]: [string, QueryArgs]) => key(ref, args) === name);
}

beforeEach(() => {
	fixture.missingInquiryRef = ""; fixture.records = true; fixture.recordGet = true; fixture.orderList = true;
	fixture.clientSetup.mockClear();
	results = new Map([["follow-ups", page()], ["overdue", page()], ["partial", page()], ["sent", page()], ["fulfillment", []]]);
	fixture.query.mockReset().mockImplementation(async (ref: string, args: QueryArgs) => {
		const value = results.get(key(ref, args));
		if (value instanceof Error) throw value;
		return value;
	});
});
afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("dashboard attention access and contracts", () => {
	it.each<TenantAdminServerSession>([{ status: "unauthenticated" }, { status: "unauthorized", email: "denied@example.test" }])("does no reads without explicit authorization: $status", async (session) => {
		await render(session);
		expect(fixture.clientSetup).toHaveBeenCalledTimes(1);
		expect(fixture.query).not.toHaveBeenCalled();
		expect(document.querySelector("section")).toBeNull();
	});
	it("honors explicit enabled features even for the full tier", async () => {
		await render({ ...authorized, enabledFeatures: [] });
		expect(fixture.query).not.toHaveBeenCalled();
		expect(document.querySelector("section")).toBeNull();
		sessions.set("session", { ...authorized, enabledFeatures: ["orders"] }); await settle();
		expect(fixture.query).toHaveBeenCalledTimes(1);
		expect(calls("fulfillment")).toHaveLength(1);
		expect(document.querySelector('[data-attention="follow-ups"]')).toBeNull();
	});
	it("keeps basic access to orders without querying full-tier queues", async () => {
		await render({ ...authorized, tier: "basic" });
		expect(fixture.query).toHaveBeenCalledTimes(1);
		expect(calls("fulfillment")).toHaveLength(1);
	});
	it.each(["listPaginated", "getWorkflow", "clientOptions", "linkClient", "updateFollowUp"])("requires the complete inquiry destination contract: %s", async (ref) => {
		fixture.missingInquiryRef = ref;
		await render();
		expect(calls("follow-ups")).toHaveLength(0);
		expect(group("follow-ups").textContent).toContain("preview unavailable");
		expect(group("follow-ups").textContent).not.toContain("no follow-ups");
	});
	it.each(["inquiries", "crm"] as const)("requires the %s feature for follow-ups", async (feature) => {
		await render({ ...authorized, enabledFeatures: feature === "crm" ? ["inquiries"] : ["crm"] });
		expect(fixture.query).not.toHaveBeenCalled();
	});
	it.each(["records", "get"])("marks invoice preview unavailable without business record %s", async (missing) => {
		fixture.records = missing !== "records"; fixture.recordGet = missing !== "get";
		await render();
		expect(calls("overdue")).toHaveLength(0);
		expect(group("invoices").textContent).toContain("preview unavailable");
		expect(fixture.query.mock.calls.some(([ref]) => ref === "invoice:summary" || ref === "invoice:recent")).toBe(false);
	});
	it("reports unavailable fulfillment capability without inventing an empty queue", async () => {
		fixture.orderList = false;
		await render();
		expect(calls("fulfillment")).toHaveLength(0);
		expect(group("fulfillment").textContent).toContain("preview unavailable");
	});
	it("queries filtered queues independently of recent activity", async () => {
		results.set("follow-ups", page([inquiry()])); results.set("overdue", page([invoice()])); results.set("fulfillment", [order()]);
		await render();
		const now = new Date();
		const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
		expect(calls("follow-ups")[0]).toEqual(["inquiries:listPaginated", { siteUrl: "fixture.example", followUpBefore: date, paginationOpts: { numItems: 5, cursor: null } }]);
		for (const status of ["overdue", "partial", "sent"])
			expect(calls(status)[0]).toEqual(["records:list", { siteUrl: "fixture.example", kind: "invoices", status, paginationOpts: { numItems: 5, cursor: null } }]);
		expect(calls("fulfillment")[0]).toEqual(["orders:list", { siteUrl: "fixture.example", status: "fulfillment_error" }]);
		expect(document.body.textContent).toContain("INV-unpaid-old");
		expect(document.body.textContent).toContain("ORDER-exception-old");
		expect(document.body.textContent).toContain("Older follow-up");
	});
});

describe("dashboard attention completeness and recovery", () => {
	it("allows other queues and successful invoice statuses to finish while a source loads", async () => {
		const pending = deferred(); results.set("follow-ups", pending.promise); results.set("sent", pending.promise);
		results.set("overdue", page([invoice()])); results.set("fulfillment", [order()]);
		await render();
		expect(group("follow-ups").textContent).toContain("loading due follow-ups");
		expect(group("invoices").textContent).toContain("INV-unpaid-old");
		expect(group("invoices").textContent).toContain("loading unpaid invoices");
		expect(group("fulfillment").textContent).toContain("ORDER-exception-old");
		pending.resolve(page()); await settle();
		expect(group("follow-ups").textContent).toContain("no follow-ups due");
	});
	it("retains partial invoice success and retries without clearing other queues", async () => {
		results.set("overdue", page([invoice()])); results.set("sent", new Error("offline")); results.set("fulfillment", [order()]);
		await render();
		expect(group("invoices").textContent).toContain("INV-unpaid-old");
		expect(group("invoices").textContent).toContain("some records could not load");
		expect(group("invoices").textContent).not.toContain("no overdue");
		results.set("sent", page([invoice("sent-old", "sent")]));
		button("retry unpaid invoices").click(); await settle();
		expect(group("invoices").textContent).toContain("INV-sent-old");
		expect(group("invoices").textContent).not.toContain("could not load");
		expect(calls("fulfillment")).toHaveLength(1);
		expect(calls("follow-ups")).toHaveLength(1);
	});
	it("surfaces an invoice failure while another status is still pending", async () => {
		const pending = deferred();
		results.set("overdue", page([invoice()])); results.set("partial", new Error("offline")); results.set("sent", pending.promise);
		await render();
		expect(group("invoices").textContent).toContain("INV-unpaid-old");
		expect(group("invoices").textContent).toContain("some records could not load");
		expect(button("retry unpaid invoices")).toBeDefined();
		pending.resolve(page()); await settle();
		expect(group("invoices").textContent).toContain("some records could not load");
	});
	it.each(["follow-ups", "fulfillment"])("offers recovery for a failed %s snapshot", async (name) => {
		results.set(name, new Error("offline")); await render();
		expect(group(name).textContent).toContain("some records could not load");
		results.set(name, name === "fulfillment" ? [order()] : page([inquiry()]));
		button(name === "fulfillment" ? "retry fulfillment errors" : "retry due follow-ups").click(); await settle();
		expect(group(name).querySelectorAll("li")).toHaveLength(1);
	});
	it("only confirms empty queues after every complete status page arrives", async () => {
		const pending = deferred(); results.set("partial", pending.promise);
		await render();
		expect(group("invoices").textContent).not.toContain("no overdue");
		pending.resolve(page()); await settle();
		expect(group("invoices").textContent).toContain("no overdue, partially paid, or sent invoices");
		expect(group("follow-ups").textContent).toContain("no follow-ups due today or earlier");
		expect(group("fulfillment").textContent).toContain("no fulfillment errors found in this snapshot");
	});
	it.each(["unfinished", "SplitRequired", "SplitRecommended"])("never treats %s pages as complete empty results", async (mode) => {
		const result = page(mode === "SplitRequired" ? [inquiry("discard")] : [], mode !== "unfinished", mode === "unfinished" ? {} : { pageStatus: mode, splitCursor: "split" });
		results.set("follow-ups", result); results.set("overdue", result);
		await render();
		for (const name of ["follow-ups", "invoices"]) {
			expect(group(name).textContent).toContain("preview incomplete");
			expect(group(name).textContent).not.toContain("no follow-ups due");
			expect(group(name).textContent).not.toContain("no overdue");
			if (mode === "SplitRequired") expect(group(name).querySelector("button:not([aria-label])")).not.toBeNull();
			else {
				expect(group(name).querySelector("button:not([aria-label])")).toBeNull();
				expect(group(name).querySelector("a")?.getAttribute("href")).toBe(name === "follow-ups" ? "/admin/inquiries" : "/admin/invoicing");
			}
		}
		expect(document.body.textContent).not.toContain("discard");
	});
	it("keeps at most five rows per queue and discloses the fulfillment cap", async () => {
		results.set("follow-ups", page(Array.from({ length: 5 }, (_, i) => inquiry(`due-${i}`)), false));
		for (const status of ["overdue", "partial", "sent"])
			results.set(status, page(Array.from({ length: 5 }, (_, i) => invoice(`${status}-${i}`, status)), false));
		results.set("fulfillment", Array.from({ length: 500 }, (_, i) => order(`error-${i}`, i)));
		await render();
		for (const name of ["follow-ups", "invoices", "fulfillment"]) expect(group(name).querySelectorAll("li")).toHaveLength(5);
		expect(group("invoices").querySelector("li")?.textContent).toContain("overdue-0");
		expect(group("invoices").textContent).not.toContain("partial-0");
		expect(group("fulfillment").querySelector("li")?.textContent).toContain("error-499");
		expect(group("fulfillment").textContent).toContain("500-record limit reached");
		expect(group("fulfillment").textContent).toContain("more fulfillment errors may exist");
	});
	it("preserves server invoice status instead of inventing overdue status from dates", async () => {
		results.set("sent", page([invoice("sent-old", "sent")])); await render();
		expect(group("invoices").querySelector("li")?.textContent).toContain("sent2025-01-01");
		expect(group("invoices").querySelector("li")?.textContent).not.toContain("overdue");
	});
	it("uses encoded exact links and preserves long labels", async () => {
		const id = "older /?& record"; const name = "Long client name ".repeat(30);
		results.set("follow-ups", page([inquiry(id, name)])); results.set("sent", page([invoice(id, "sent")])); results.set("fulfillment", [order(id)]);
		await render();
		for (const [name, path] of [["follow-ups", "/admin/inquiries"], ["invoices", "/admin/invoicing"], ["fulfillment", "/admin/orders"]])
			expect(group(name).querySelector("li a")?.getAttribute("href")).toBe(`${path}?open=${encodeURIComponent(id)}`);
		expect(group("follow-ups").querySelector("strong")?.textContent).toBe(name);
		expect([...document.querySelectorAll("a")].every((link) => !link.search.includes("status=") && !link.search.includes("due="))).toBe(true);
	});
	it("uses a collection link on legacy order destinations", async () => {
		fixture.records = false; results.set("fulfillment", [order()]); await render();
		expect(group("fulfillment").querySelector("li a")?.getAttribute("href")).toBe("/admin/orders");
		expect(group("fulfillment").textContent).toContain("open orders to find a record");
	});
});

describe("dashboard attention request ownership", () => {
	it("rejects stale completions after an explicit refresh", async () => {
		const old = deferred(); results.set("follow-ups", old.promise); await render();
		results.set("follow-ups", page([inquiry("new", "Current follow-up")]));
		button("refresh due follow-ups").click(); await settle();
		old.resolve(page([inquiry("old", "Stale follow-up")])); await settle();
		expect(group("follow-ups").textContent).toContain("Current follow-up");
		expect(group("follow-ups").textContent).not.toContain("Stale follow-up");
	});
	it("rejects stale invoice and order responses after refresh", async () => {
		const oldInvoice = deferred(); const oldOrder = deferred();
		results.set("overdue", oldInvoice.promise); results.set("fulfillment", oldOrder.promise); await render();
		results.set("overdue", page([invoice("current")])); results.set("fulfillment", [order("current")]);
		button("refresh unpaid invoices").click(); button("refresh fulfillment errors").click(); await settle();
		oldInvoice.resolve(page([invoice("stale")])); oldOrder.resolve([order("stale")]); await settle();
		expect(group("invoices").textContent).toContain("INV-current");
		expect(group("fulfillment").textContent).toContain("ORDER-current");
		expect(document.body.textContent).not.toContain("stale");
	});
	it("invalidates pending reads when features are disabled", async () => {
		const pending = deferred(); results.set("follow-ups", pending.promise); results.set("overdue", pending.promise); results.set("fulfillment", pending.promise); await render();
		sessions.set("session", { ...authorized, enabledFeatures: [] }); await settle();
		pending.resolve(page([inquiry("old", "Disabled follow-up")])); await settle();
		expect(document.querySelector("section")).toBeNull();
		expect(fixture.query).toHaveBeenCalledTimes(5);
	});
	it("refreshes the local due date at midnight and removes its timer/listener on teardown", async () => {
		vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 7, 23, 59, 59));
		const removed = vi.spyOn(document, "removeEventListener");
		await render();
		expect(calls("follow-ups").at(-1)?.[1].followUpBefore).toBe("2026-11-07");
		await vi.advanceTimersByTimeAsync(1000); await settle();
		expect(calls("follow-ups").at(-1)?.[1].followUpBefore).toBe("2026-11-08");
		expect(calls("fulfillment")).toHaveLength(1);
		expect(vi.getTimerCount()).toBe(1);
		await unmount(component!); component = undefined;
		expect(vi.getTimerCount()).toBe(0);
		expect(removed).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
	});
	it("refreshes a suspended tab on visibility change and ignores unmounted completions", async () => {
		vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 7, 10));
		const old = deferred(); results.set("follow-ups", old.promise); await render();
		vi.setSystemTime(new Date(2026, 10, 8, 10)); results.set("follow-ups", page([inquiry("visible", "Resumed follow-up")]));
		document.dispatchEvent(new Event("visibilitychange")); await settle();
		expect(calls("follow-ups").at(-1)?.[1].followUpBefore).toBe("2026-11-08");
		await unmount(component!); component = undefined; document.body.replaceChildren();
		old.resolve(page([inquiry("old", "Unmounted follow-up")])); await settle();
		expect(document.body.textContent).toBe("");
		expect(vi.getTimerCount()).toBe(0);
	});
	it("ignores an owned pending result immediately after unmount", async () => {
		const pending = deferred(); const readRows = vi.fn(() => [inquiry("late-owned")]);
		results.set("follow-ups", pending.promise); await render();
		expect(calls("follow-ups")).toHaveLength(1);
		await unmount(component!); component = undefined; document.body.replaceChildren();
		pending.resolve({ get page() { return readRows(); }, isDone: true, continueCursor: "" }); await settle();
		expect(readRows).not.toHaveBeenCalled(); expect(document.body.textContent).toBe("");
	});

});
