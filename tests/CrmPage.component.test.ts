import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmPage from "../src/lib/pages/CrmPage.svelte";

const mocks = vi.hoisted(() => ({
	queries: new Map<string, { args: unknown; options: unknown }>(),
	query: vi.fn(),
	loadMore: vi.fn(),
	args: undefined as undefined | (() => Record<string, string>),
	clients: [] as { _id: string; _creationTime: number; name: string; category: string; status: string; tags?: { _id: string; name: string }[] }[],
	stats: { total: 1000, leads: 400, booked: 200, inProgress: 100, completed: 300, photography: 900, web: 100, truncated: undefined as boolean | undefined },
}));
vi.mock("convex-svelte", () => ({
	usePaginatedQuery: (_ref: string, args: typeof mocks.args) => {
		mocks.args = args;
		return {
			get results() {
				const filters = typeof args === "function" ? args() : {};
				return mocks.clients.filter(c => (!filters.category || c.category === filters.category) && (!filters.status || c.status === filters.status)).map(c => ({ ...c, tags: c.tags ?? [] }));
			},
			get status() { return mocks.clients.length >= 50 ? "CanLoadMore" : "Exhausted"; },
			loadMore: mocks.loadMore,
		};
	},
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
vi.mock("../src/lib/adminClient", () => ({ useAdminClient: () => ({ query: mocks.query, mutation: vi.fn().mockResolvedValue(null) }) }));
vi.mock("../src/lib/config", () => ({ getAdminConfig: () => ({ siteUrl: "example.test", api: {
	crm: { listClientsWithTags: "clients", getStats: "stats" }, activityLog: { getClientActivity: "activity" }, tags: { listTags: "tags", getClientTags: "clientTags" },
} }) }));
let component: ReturnType<typeof mount>;
beforeEach(() => {
	mocks.clients = [{ _creationTime: 1, _id: "older-booked", name: "Booked client", category: "photography", status: "booked" }, { _creationTime: 2, _id: "lead", name: "New lead", category: "web", status: "lead" }];
	mocks.stats.truncated = undefined;
	mocks.queries.clear(); mocks.query.mockClear(); mocks.loadMore.mockClear();
});
afterEach(async () => { if (component) await unmount(component); document.body.innerHTML = ""; });
async function render() {
	component = mount(CrmPage, { target: document.body, props: { data: { adminSession: { status: "authorized", email: "artist@example.test", tier: "full", isCreator: true } } } });
	await tick();
}
async function select(label: string, value: string) {
	const field = document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
	field.value = value;
	field.dispatchEvent(new Event("change", { bubbles: true }));
	await tick();
}
describe("CRM query completeness", () => {
	it("reactively sends category/status filters to the server and removes all selections", async () => {
		await render();
		expect(mocks.args?.()).toEqual({ siteUrl: "example.test" });
		await select("Client category", "photography");
		await select("Client status", "booked");
		expect(mocks.args?.()).toEqual({ siteUrl: "example.test", category: "photography", status: "booked" });
		expect(document.body.textContent).toContain("Booked client");
		expect(document.body.textContent).not.toContain("New lead");
		await select("Client category", "all");
		await select("Client status", "all");
		expect(mocks.args?.()).toEqual({ siteUrl: "example.test" });
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
		mocks.clients = Array.from({ length: 50 }, (_, i) => ({ _creationTime: i + 1, _id: `client-${i}`, name: `Client ${i}`, category: "web", status: "lead" }));
		await render();
		const search = document.querySelector<HTMLInputElement>('input[type="text"]')!;
		search.value = "no match";
		search.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(document.body.textContent).toContain("showing 50 matching clients. search and tag filters apply to loaded clients.");
		expect(document.querySelector("tbody")).toBeNull();
	});
	it("uses tagged rows without per-client reads and scopes detail subscriptions to selection", async () => {
		mocks.clients[0].tags = [{ _id: "vip", name: "VIP" }];
		await render();
		expect(mocks.query).not.toHaveBeenCalled();
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

});
