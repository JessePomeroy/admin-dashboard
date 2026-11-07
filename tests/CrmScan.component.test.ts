import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmPage from "../src/lib/pages/CrmPage.svelte";

type Row = { _id: string; _creationTime: number; siteUrl: string; name: string; email?: string; category: string; status: string; tags: { _id: string; name: string }[] };
type Args = { siteUrl: string; category?: string; status?: string; tagId?: string; search?: string; paginationOpts: { cursor: string | null; numItems: number; id: number } };
type Batch = { page: Row[]; continueCursor: string; isDone: boolean; scannedCount: number; pageStatus?: "SplitRequired" | "SplitRecommended"; splitCursor?: string };
const mocks = vi.hoisted(() => ({
	scan: true,
	rows: [] as Row[],
	memberships: new Map<string, string[]>(),
	query: vi.fn<(ref: string, args: Args | { clientId: string }) => Promise<Batch | Row | null>>(),
	mutation: vi.fn(),
	toast: vi.fn(),
	setUrl: (_url: string) => {},
}));
vi.mock("$app/stores", async () => {
	const { writable } = await import("svelte/store");
	const page = writable({ url: new URL("https://fixture.invalid/admin/crm") });
	mocks.setUrl = url => page.set({ url: new URL(url) });
	return { page };
});
vi.mock("convex-svelte", () => ({ useQuery: (ref: string) => ({ data: ref === "stats" ? { total: 300, leads: 300, booked: 0, inProgress: 0, completed: 0, photography: 0, web: 300 } : ref === "tags" ? [{ _id: "vip", name: "VIP" }] : [], isLoading: false }) }));
vi.mock("../src/lib/adminClient", () => ({ useAdminClient: () => ({ query: mocks.query, mutation: mocks.mutation }) }));
vi.mock("../src/lib/toast", () => ({ addToast: mocks.toast }));
vi.mock("../src/lib/config", () => ({ getAdminConfig: () => ({ siteUrl: "example.test", api: {
	crm: { listClientsWithTags: "legacy", ...(mocks.scan ? { scanClientsWithTags: "scan" } : {}), getClient: "client", getStats: "stats", updateClient: "update" },
	activityLog: { getClientActivity: "activity" }, tags: { listTags: "tags", getClientTags: "clientTags", deleteTag: "deleteTag" },
} }) }));

let component: ReturnType<typeof mount> | undefined;
const row = (i: number, name = `Client ${i}`): Row => ({ _id: `c${i}`, _creationTime: i, siteUrl: "example.test", name, category: "web", status: "lead", tags: [] });
const batch = (page: Row[], isDone: boolean, continueCursor: string, scannedCount = page.length): Batch => ({ page, isDone, continueCursor, scannedCount });
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(complete => { resolve = complete; });
	return { promise, resolve };
}
function read(ref: string, args: Args | { clientId: string }) {
	if (!("paginationOpts" in args)) return mocks.rows.find(r => r._id === args.clientId) ?? null;
	const selected = mocks.rows.filter(r => (!args.category || r.category === args.category) && (!args.status || r.status === args.status));
	const start = Number(args.paginationOpts.cursor ?? 0);
	const candidates = selected.slice(start, start + args.paginationOpts.numItems);
	const q = args.search?.toLowerCase();
	return batch(candidates.filter(r => ref !== "scan" || ((!q || r.name.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q)) && (!args.tagId || mocks.memberships.get(r._id)?.includes(args.tagId)))), start + candidates.length >= selected.length, String(start + candidates.length), candidates.length);
}
const scanCalls = () => mocks.query.mock.calls.flatMap(([ref, args]) => ref === "scan" && "paginationOpts" in args ? [args] : []);
const names = () => Array.from(document.querySelectorAll(".td-name"), e => e.textContent!.trim());
const button = (text: string) => {
	const result = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.trim() === text);
	if (!result) throw new Error(`Missing button: ${text}`);
	return result;
};
async function settle() {
	await tick();
	await vi.waitFor(() => {
		expect(document.querySelector('.client-results[aria-busy="true"]')).toBeNull();
		expect(document.querySelector(".loading-state")).toBeNull();
	});
}
async function render() {
	component = mount(CrmPage, { target: document.body, props: { data: { adminSession: { status: "authorized", email: "artist@example.invalid", tier: "full", isCreator: true } } } });
	await settle();
}
async function search(value: string) {
	const input = document.querySelector<HTMLInputElement>(".filter-search")!;
	input.value = value; input.dispatchEvent(new Event("input", { bubbles: true }));
	await settle();
}
async function choose(label: string, value: string) {
	const select = document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
	select.value = value; select.dispatchEvent(new Event("change", { bubbles: true }));
	await settle();
}
async function click(text: string) { button(text).click(); await settle(); }
beforeEach(() => {
	mocks.scan = true;
	mocks.rows = [row(0), row(1)];
	mocks.memberships.clear(); mocks.toast.mockReset();
	mocks.setUrl("https://fixture.invalid/admin/crm");
	mocks.query.mockReset().mockImplementation(async (ref, args) => read(ref, args));
	mocks.mutation.mockReset().mockResolvedValue(null);
});
afterEach(async () => { if (component) { await unmount(component); component = undefined; } document.body.innerHTML = ""; });

describe("optional progressive CRM client search", () => {
	it("finds an older literal email match beyond the first fifty candidates", async () => {
		mocks.rows = Array.from({ length: 126 }, (_, i) => row(i)); mocks.rows[125].email = "old+name@example.invalid";
		await render(); mocks.query.mockClear();
		await search("OLD+NAME@");
		expect(names()).toEqual(["Client 125"]);
		expect(scanCalls().map(a => a.paginationOpts.cursor)).toEqual([null, "50", "100"]);
		expect(scanCalls().every(a => a.search === "OLD+NAME@")).toBe(true);
	});
	it("pauses after four empty batches and continues without claiming no matches", async () => {
		mocks.rows = Array.from({ length: 251 }, (_, i) => row(i, i === 250 ? "Older match" : `Client ${i}`));
		await render(); mocks.query.mockClear(); await search("Older");
		expect(scanCalls()).toHaveLength(4);
		expect(document.body.textContent).not.toContain("no clients found");
		expect(document.body.textContent).toContain("more clients to check");
		await click("continue search");
		expect(names()).toEqual(["Older match"]);
		expect(scanCalls().at(4)?.paginationOpts.cursor).toBe("200");
		expect(document.body.textContent).toContain("search complete");
	});
	it("shows true no-match wording only after exhaustion", async () => {
		await render(); await search("Nobody");
		expect(document.body.textContent).toContain("no clients found");
		expect(document.body.textContent).toContain("search complete");
	});
	it("keeps full visible windows and their next/previous boundaries", async () => {
		mocks.rows = Array.from({ length: 127 }, (_, i) => row(i));
		await render(); const found = [...names()]; await click("next clients"); found.push(...names()); await click("next clients"); found.push(...names());
		expect(found).toHaveLength(127); expect(new Set(found).size).toBe(127);
		await click("previous clients"); expect(names()[0]).toBe("Client 50"); expect(names()).toHaveLength(50);
		expect(new Set(scanCalls().map(a => a.paginationOpts.id)).size).toBe(scanCalls().length);
	});
	it("requests only remaining capacity so continuation drops no matches", async () => {
		mocks.rows = Array.from({ length: 100 }, (_, i) => row(i, i < 30 || i >= 50 ? `Match ${i}` : `Other ${i}`));
		await render(); mocks.query.mockClear(); await search("Match"); const first = [...names()];
		expect(first).toHaveLength(50); expect(scanCalls().map(a => a.paginationOpts.numItems)).toEqual([50, 20]);
		await click("next clients"); expect(new Set([...first, ...names()]).size).toBe(80); expect(names()).toHaveLength(30);
	});
	it("uses server-confirmed membership even when displayed tags omit the selected tag", async () => {
		mocks.rows = Array.from({ length: 61 }, (_, i) => row(i)); mocks.memberships.set("c60", ["vip"]);
		await render(); await choose("Client tag", "vip");
		expect(names()).toEqual(["Client 60"]); expect(scanCalls().at(-1)?.tagId).toBe("vip");
	});
	it.each(["A.B+", " stone ", "😀"])("keeps literal punctuation/whitespace/Unicode unchanged (%s)", async term => {
		mocks.rows = [row(0, `Before${term}After`), row(1, "Other")];
		await render(); await search(term); expect(names()).toEqual([`Before${term}After`]); expect(scanCalls().at(-1)?.search).toBe(term);
	});
	it.each(["Client category", "Client status", "Client tag", "search"])("resets the visible window when %s changes", async field => {
		mocks.rows = Array.from({ length: 160 }, (_, i) => row(i)); for (const r of mocks.rows) mocks.memberships.set(r._id, ["vip"]);
		await render(); await click("next clients"); mocks.query.mockClear();
		if (field === "search") await search("Client"); else await choose(field, field === "Client category" ? "web" : field === "Client status" ? "lead" : "vip");
		expect(scanCalls()[0].paginationOpts.cursor).toBeNull(); expect(names()[0]).toBe("Client 0"); expect(document.body.textContent).not.toContain("previous clients");
	});
	it("retains matches and retries the failed continuation", async () => {
		await render(); mocks.query.mockClear();
		mocks.query.mockResolvedValueOnce(batch([row(10, "Match one")], false, "50", 50)).mockRejectedValueOnce(new Error("Offline"));
		await search("Match");
		expect(names()).toEqual(["Match one"]); expect(document.querySelector('[role="alert"]')).not.toBeNull(); expect(document.body.textContent).not.toContain("no clients found");
		mocks.query.mockResolvedValueOnce(batch([row(51, "Match two")], true, "100", 50));
		await click("retry search"); expect(scanCalls().at(-1)?.paginationOpts.cursor).toBe("50"); expect(names()).toEqual(["Match one", "Match two"]);
	});
	it("does not advance an incomplete required split and retries a smaller batch", async () => {
		mocks.query.mockResolvedValueOnce({ ...batch([row(99, "Incomplete")], true, "bad", 50), pageStatus: "SplitRequired", splitCursor: "middle" });
		await render(); expect(names()).toEqual([]); expect(document.body.textContent).not.toContain("no clients found");
		mocks.query.mockResolvedValueOnce({ ...batch([row(0)], true, "good"), pageStatus: "SplitRecommended", splitCursor: "middle" });
		await click("retry search"); expect(scanCalls().at(-1)?.paginationOpts).toMatchObject({ cursor: null, numItems: 25 }); expect(names()).toEqual(["Client 0"]);
	});
	it("rejects nonadvancing unfinished cursors without a loop or empty claim", async () => {
		mocks.query.mockResolvedValueOnce(batch([row(0)], false, "50", 50)).mockResolvedValueOnce(batch([], false, "50", 0));
		await render(); expect(scanCalls()).toHaveLength(2); expect(names()).toEqual(["Client 0"]); expect(document.querySelector('[role="alert"]')).not.toBeNull();
		expect(document.body.textContent).not.toContain("no clients found");
	});
	it("ignores old batches and starts no later request after filters change", async () => {
		const old = deferred<Batch>(); mocks.query.mockImplementationOnce(() => old.promise);
		component = mount(CrmPage, { target: document.body, props: { data: { adminSession: { status: "authorized", tier: "full", isCreator: true } } } }); await tick();
		await choose("Client category", "web"); const count = scanCalls().length;
		old.resolve(batch([row(99, "Stale")], false, "50", 50)); await tick();
		expect(names()).not.toContain("Stale"); expect(scanCalls()).toHaveLength(count);
	});
	it("cancels in-flight progression, keeps the last checkpoint and resumes it", async () => {
		const pending = deferred<Batch>();
		mocks.query.mockResolvedValueOnce(batch([row(0)], false, "50", 50)).mockImplementationOnce(() => pending.promise);
		component = mount(CrmPage, { target: document.body, props: { data: { adminSession: { status: "authorized", tier: "full", isCreator: true } } } }); await tick();
		await vi.waitFor(() => expect(scanCalls()).toHaveLength(2)); button("pause search").click(); await tick();
		expect(names()).toEqual(["Client 0"]);
		pending.resolve(batch([row(99, "Cancelled")], false, "100", 50)); await settle(); expect(names()).toEqual(["Client 0"]); expect(scanCalls()).toHaveLength(2);
		mocks.query.mockResolvedValueOnce(batch([row(50)], true, "100")); await click("continue search"); expect(scanCalls().at(-1)?.paginationOpts.cursor).toBe("50"); expect(names()).toEqual(["Client 0", "Client 50"]);
	});
	it("starts no subsequent request after unmount", async () => {
		const old = deferred<Batch>(); mocks.query.mockImplementationOnce(() => old.promise);
		component = mount(CrmPage, { target: document.body, props: { data: { adminSession: { status: "authorized", tier: "full", isCreator: true } } } }); await tick();
		await unmount(component); component = undefined; old.resolve(batch([], false, "50", 50)); await tick(); expect(scanCalls()).toHaveLength(1);
	});
	it("enforces the 200 UTF-16-unit input limit without trimming", async () => {
		await render(); await search("😀".repeat(100)); expect(scanCalls().at(-1)?.search?.length).toBe(200);
		mocks.query.mockClear(); await search("a".repeat(201)); expect(scanCalls()).toHaveLength(0); expect(document.body.textContent).toContain("200 characters");
		expect(document.querySelector<HTMLInputElement>(".filter-search")?.getAttribute("aria-invalid")).toBe("true"); expect(document.body.textContent).not.toContain("no clients found");
	});
	it("keeps a legacy host on page-local filtering and never sends new args", async () => {
		mocks.scan = false; mocks.rows = Array.from({ length: 61 }, (_, i) => row(i));
		await render(); await search("Client 60"); expect(names()).toEqual([]); expect(scanCalls()).toHaveLength(0);
		expect(document.body.textContent).toContain("search and tag filters apply to this page");
		for (const [, args] of mocks.query.mock.calls) { expect(args).not.toHaveProperty("search"); expect(args).not.toHaveProperty("tagId"); }
	});
	it("resets a legacy later page when a local search changes", async () => {
		mocks.scan = false; mocks.rows = Array.from({ length: 120 }, (_, i) => row(i));
		await render(); await click("next clients"); expect(names()[0]).toBe("Client 50");
		await search("Client 0"); expect(names()).toEqual(["Client 0"]); expect(document.body.textContent).not.toContain("previous clients");
	});
	it("clears an active tag only after its deletion succeeds", async () => {
		mocks.memberships.set("c0", ["vip"]); await render(); await choose("Client tag", "vip");
		await click("manage tags"); mocks.mutation.mockRejectedValueOnce(new Error("Denied"));
		(document.querySelector('[aria-label="Delete tag VIP"]') as HTMLButtonElement).click(); await tick();
		await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalled()); expect(scanCalls().at(-1)?.tagId).toBe("vip");
		(document.querySelector('[aria-label="Delete tag VIP"]') as HTMLButtonElement).click(); await settle();
		expect(scanCalls().at(-1)).not.toHaveProperty("tagId"); expect(document.querySelector<HTMLSelectElement>('[aria-label="Client tag"]')?.value).toBe("all");
	});
	it("deduplicates clients repeated by a changing snapshot without growing past fifty", async () => {
		mocks.query.mockResolvedValueOnce(batch([row(0)], false, "50", 50)).mockResolvedValueOnce(batch([row(0), row(1)], true, "100", 50));
		await render(); expect(names()).toEqual(["Client 0", "Client 1"]);
	});

	it("opens an authorized deep-linked client outside the current list", async () => {
		const linked = row(900, "Linked client"); mocks.setUrl("https://fixture.invalid/admin/crm?client=c900");
		mocks.query.mockImplementation(async (ref, args) => ref === "client" ? linked : read(ref, args));
		await render(); expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Linked client"); expect(names()).not.toContain("Linked client");
	});
	it.each([false, true])("ignores a late linked read after manual selection/close (closed=%s)", async close => {
		const linked = deferred<Row>(); mocks.setUrl("https://fixture.invalid/admin/crm?client=c900");
		mocks.query.mockImplementation(async (ref, args) => ref === "client" ? linked.promise : read(ref, args));
		await render(); (document.querySelector("tbody tr") as HTMLElement).click(); await tick();
		if (close) (document.querySelector('[aria-label="Close dialog"]') as HTMLButtonElement).click(); await tick();
		linked.resolve(row(900, "Late linked")); await tick();
		if (close) expect(document.querySelector('[role="dialog"]')).toBeNull(); else expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Client 0");
		expect(document.querySelector('[role="dialog"]')?.textContent ?? "").not.toContain("Late linked");
	});
});
