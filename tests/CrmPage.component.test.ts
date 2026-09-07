import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmPage from "../src/lib/pages/CrmPage.svelte";

const mocks = vi.hoisted(() => ({
	queries: new Map<string, { args: unknown; options: unknown }>(),
	query: vi.fn(),
	mutation: vi.fn(),
	args: undefined as undefined | (() => Record<string, unknown>),
	clients: [] as { _id: string; _creationTime: number; name: string; category: string; status: string; tags?: { _id: string; name: string }[] }[],
	stats: { total: 1000, leads: 400, booked: 200, inProgress: 100, completed: 300, photography: 900, web: 100, truncated: undefined as boolean | undefined },
}));
vi.mock("convex-svelte", () => ({
	useQuery: (ref: string, args: unknown, options: unknown) => {
		mocks.queries.set(ref, { args, options });
		return {
			get data() {
				if (ref === "stats") return mocks.stats;
				if (ref === "tags") return [{ _id: "vip", name: "VIP" }];
				const selected = typeof args === "function" ? args() : "skip";
				if (selected === "skip") return undefined;
				return ref === "clientTags" ? [{ _id: "tag", name: selected.clientId + " tag" }] : [];
			},
		};
	},
}));
vi.mock("../src/lib/adminClient", () => ({ useAdminClient: () => ({ query: mocks.query, mutation: mocks.mutation }) }));
vi.mock("../src/lib/config", () => ({ getAdminConfig: () => ({ siteUrl: "example.test", api: {
	crm: { listClientsWithTags: "clients", getStats: "stats" }, activityLog: { getClientActivity: "activity" }, tags: { listTags: "tags", getClientTags: "clientTags" },
} }) }));
let component: ReturnType<typeof mount>;
beforeEach(() => {
	mocks.clients = [{ _creationTime: 1, _id: "older-booked", name: "Booked client", category: "photography", status: "booked" }, { _creationTime: 2, _id: "lead", name: "New lead", category: "web", status: "lead" }];
	mocks.stats.truncated = undefined;
	mocks.queries.clear();
	mocks.query.mockReset().mockImplementation(async (_ref, args) => {
		mocks.args = () => args;
		const rows = mocks.clients.filter(c => (!args.category || c.category === args.category) && (!args.status || c.status === args.status));
		const start = Number(args.paginationOpts.cursor ?? 0);
		return { page: rows.slice(start, start + 50).map(c => ({ ...c, tags: c.tags ?? [] })), isDone: start + 50 >= rows.length, continueCursor: String(start + 50) };
	});
	mocks.mutation.mockReset().mockResolvedValue(null);
});
afterEach(async () => { if (component) await unmount(component); document.body.innerHTML = ""; });
async function render() {
	component = mount(CrmPage, { target: document.body, props: { data: { adminSession: { status: "authorized", email: "artist@example.test", tier: "full", isCreator: true } } } });
	await tick();
	await vi.waitFor(() => expect(document.querySelector(".loading-state")).toBeNull());
}
async function select(label: string, value: string) {
	const field = document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
	field.value = value;
	field.dispatchEvent(new Event("change", { bubbles: true }));
	await tick();
	await vi.waitFor(() => expect(document.querySelector(".loading-state")).toBeNull());
}
describe("CRM query completeness", () => {
	it("sends category/status filters to the server and removes all selections", async () => {
		await render();
		expect(mocks.args?.()).toMatchObject({ siteUrl: "example.test", paginationOpts: { numItems: 50, cursor: null } });
		await select("Client category", "photography");
		await select("Client status", "booked");
		expect(mocks.args?.()).toMatchObject({ siteUrl: "example.test", category: "photography", status: "booked" });
		expect(document.body.textContent).toContain("Booked client");
		expect(document.body.textContent).not.toContain("New lead");
		await select("Client category", "all");
		await select("Client status", "all");
		expect(mocks.args?.()).toMatchObject({ siteUrl: "example.test", paginationOpts: { numItems: 50, cursor: null } });
		expect(document.body.textContent).toContain("New lead");
	});
	it.each([false, undefined])("keeps exact and legacy statistics unqualified (%s)", async truncated => {
		mocks.stats.truncated = truncated;
		await render();
		expect(document.querySelector(".stats-line")?.textContent).toContain("1000 total");
		expect(document.body.textContent).not.toContain("at least");
		expect(document.body.textContent).not.toContain("actual counts may be higher");
	});
	it("labels every bounded count when the server reports partial statistics", async () => {
		mocks.stats.truncated = true;
		await render();
		const stats = document.querySelector(".stats-line")?.textContent;
		for (const count of ["1000 total", "400 leads", "200 booked", "100 in progress", "300 completed", "900 photo", "100 web"]) expect(stats).toContain(`at least ${count}`);
		expect(document.body.textContent).toContain("actual counts may be higher");
	});
	it("keeps the bounded-list notice visible when local search hides the loaded clients", async () => {
		mocks.clients = Array.from({ length: 51 }, (_, i) => ({ _creationTime: i + 1, _id: `client-${i}`, name: `Client ${i}`, category: "web", status: "lead" }));
		await render();
		const search = document.querySelector<HTMLInputElement>('input[type="text"]')!;
		search.value = "no match";
		search.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(document.body.textContent).toContain("page 1: 50 matching clients. search and tag filters apply to this page.");
		expect(document.querySelector("tbody")).toBeNull();
	});
	it("uses tagged rows without per-client reads and scopes detail subscriptions to selection", async () => {
		mocks.clients[0].tags = [{ _id: "vip", name: "VIP" }];
		await render();
		expect(mocks.query).toHaveBeenCalledTimes(1);
		expect(mocks.query.mock.calls[0][0]).toBe("clients");
		const args = (ref: string) => (mocks.queries.get(ref)?.args as () => unknown)();
		expect(args("clientTags")).toBe("skip");
		await select("Client tag", "vip");
		expect(document.querySelectorAll("tbody tr")).toHaveLength(1);
		await select("Client tag", "all");
		(document.querySelector("tbody tr") as HTMLElement).click(); await tick();
		expect(args("clientTags")).toEqual({ clientId: "older-booked" });
		expect(mocks.queries.get("clientTags")?.options).toEqual({ keepPreviousData: false });
		(document.querySelectorAll("tbody tr")[1] as HTMLElement).click(); await tick();
		expect(args("activity")).toEqual({ clientId: "lead" });
		expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("older-booked tag");
		(document.querySelector('[aria-label="Close dialog"]') as HTMLElement)?.click(); await tick();
		expect(args("clientTags")).toBe("skip");
	});
	it("visits bounded pages once and resets cursors when server filters change", async () => {
		mocks.clients = Array.from({ length: 120 }, (_, i) => ({ _creationTime: i, _id: `c${i}`, name: `Client ${i}`, category: "web", status: "lead" }));
		await render();
		const names: string[] = [];
		for (let page = 0; page < 3; page++) {
			names.push(...Array.from(document.querySelectorAll(".td-name"), cell => cell.textContent!.trim()));
			if (page < 2) {
				(Array.from(document.querySelectorAll("button")).find(b => b.textContent === "next clients")!).click(); await tick();
				await vi.waitFor(() => expect(document.querySelector(".loading-state")).toBeNull());
			}
		}
		expect(names).toHaveLength(120); expect(new Set(names).size).toBe(120);
		const requestIds = mocks.query.mock.calls.map(([, args]) => args.paginationOpts.id);
		expect(new Set(requestIds).size).toBe(requestIds.length);
		const beforeRefresh = mocks.query.mock.calls.at(-1)![1].paginationOpts.id;
		(Array.from(document.querySelectorAll("button")).find(b => b.textContent === "refresh clients")!).click(); await tick();
		await vi.waitFor(() => expect(document.querySelector(".loading-state")).toBeNull());
		expect(mocks.query.mock.calls.at(-1)![1].paginationOpts.id).not.toBe(beforeRefresh);
		await select("Client category", "photography");
		expect(mocks.args?.()).toMatchObject({ category: "photography", paginationOpts: { cursor: null } });
		expect(document.querySelector("tbody")).toBeNull();
	});
	it("ignores a page response after the server filters change", async () => {
		let resolveOld!: (value: unknown) => void;
		mocks.query.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
		component = mount(CrmPage, { target: document.body, props: { data: { adminSession: { status: "authorized", email: "artist@example.test", tier: "full", isCreator: true } } } });
		await tick();
		await select("Client category", "web");
		resolveOld({ page: [{ ...mocks.clients[0], tags: [] }], isDone: true, continueCursor: "old" });
		await tick();
		expect(document.querySelector("tbody")?.textContent).toContain("New lead");
		expect(document.querySelector("tbody")?.textContent).not.toContain("Booked client");
	});
	it("retains intervening edits when a quick-status response arrives late", async () => {
		let completeStatus!: () => void;
		mocks.mutation.mockImplementationOnce(() => new Promise<void>(resolve => { completeStatus = resolve; }));
		await render();
		(document.querySelector("tbody tr") as HTMLElement).click(); await tick();
		(document.querySelector(".status-btn") as HTMLButtonElement).click(); await tick();
		(document.querySelector(".detail-actions .btn-save") as HTMLButtonElement).click(); await tick();
		const name = document.querySelector<HTMLInputElement>("#edit-name")!;
		name.value = "Renamed client"; name.dispatchEvent(new Event("input", { bubbles: true })); await tick();
		document.querySelector("form.modal-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await tick();
		await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Renamed client"));
		completeStatus(); await tick();
		await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Renamed client"));
	});
});
