import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "../src/lib/pages/DashboardPage.svelte";
import type { Feature } from "../src/lib/features";

const mocks = vi.hoisted(() => ({
	loading: new Set<string>(), errors: new Set<string>(), calls: [] as { ref: string; args: unknown }[], query: vi.fn(), truncated: false,
}));
vi.mock("../src/lib/config", () => ({ getAdminConfig: () => ({ siteUrl: "example.test", api: {
	orders: { getStats: "orders" }, crm: { getStats: "crm" }, invoices: { getDashboardSummary: "invoices" }, quotes: { getDashboardSummary: "quotes" },
} }) }));
vi.mock("../src/lib/adminClient", () => ({ useAdminClient: () => ({ query: mocks.query }) }));
vi.mock("convex-svelte", () => ({ useQuery: (ref: string, args: unknown) => {
	mocks.calls.push({ref,args});
	const skipped = () => typeof args === "function" && args() === "skip";
	return {
		get data() {
			if (skipped() || mocks.errors.has(ref) || mocks.loading.has(ref)) return undefined;
			if (ref === "orders") return { stats: {totalOrders:0}, grossPayments: [], recentOrders: [] };
			if (ref === "crm") return {total:500,leads:400,booked:50,inProgress:20,completed:30,truncated:mocks.truncated};
			if (ref === "invoices") return {counts:{draft:1,sent:1,overdue:1,partial:1,paid:0},pendingAmount:1700,recent:[],isTruncated:mocks.truncated};
			return {counts:{draft:0,sent:2,accepted:0,declined:0},recent:[],isTruncated:mocks.truncated};
		},
		get isLoading() { return !skipped() && mocks.loading.has(ref); },
		get error() { return !skipped() && mocks.errors.has(ref) ? new Error("Synthetic failure") : undefined; },
	};
} }));
let component: ReturnType<typeof mount> | undefined;
beforeEach(() => {mocks.loading.clear();mocks.errors.clear();mocks.calls=[];mocks.query.mockReset();mocks.truncated=false;});
afterEach(async () => {if(component)await unmount(component);component=undefined;document.body.replaceChildren();});
async function render(enabledFeatures?: Feature[], authorized=true) {
	const adminSession = authorized ? {status:"authorized",tier:"full",isCreator:false,email:"owner@example.invalid",enabledFeatures} : {status:"unauthenticated"};
	component=mount(Dashboard,{target:document.body,props:{data:{adminSession,newInquiryCount:0}}});await tick();
	return document.body.textContent?.replace(/\s+/g," ") ?? "";
}
const argsFor = (ref:string) => {const args=mocks.calls.find(c=>c.ref===ref)?.args;return typeof args === "function" ? args() : args;};

describe("Dashboard independent report states", () => {
	it("keeps a ready invoice summary visible while the order report loads", async () => {
		mocks.loading.add("orders");const text=await render();expect(text).toContain("4 invoices outstanding");expect(text).toContain("loading order report");
	});
	it("reports failed invoice data without a successful zero balance/count", async () => {
		mocks.errors.add("invoices");const text=await render();expect(text).toContain("invoice summary could not load");expect(text).not.toContain("0 invoices outstanding");expect(text).not.toContain("$0.00 pending");expect(text).toContain("2 quotes awaiting response");
	});
	it("does not call an incomplete activity feed empty after failures", async () => {
		for(const ref of ["orders","invoices","quotes"])mocks.errors.add(ref);
		const text=await render();expect(text).not.toContain("no recent activity");expect(text).toContain("recent activity could not load");
	});
	it("suppresses order-empty wording while its source is unavailable", async () => {
		mocks.errors.add("orders");const text=await render();expect(text).toContain("order report could not load");expect(text).not.toContain("no orders yet");
	});
	it("puts attention before financial reporting", async () => {
		await render();const attention=document.querySelector(".attention-panel");const reporting=document.querySelector(".stats-line");
		expect(attention).not.toBeNull();expect(reporting).not.toBeNull();expect(attention!.compareDocumentPosition(reporting!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});
	it("labels bounded CRM and financial counts beside their summaries", async () => {
		mocks.truncated=true;const text=await render();expect(text).toContain("at least 500 clients");expect(text).toContain("at least 4 invoices outstanding");expect(text).toContain("at least 2 quotes awaiting response");
	});
	it("honors explicit feature restrictions independently of Full tier", async () => {
		const text=await render(["dashboard","invoicing"]);expect(argsFor("orders")).toBe("skip");expect(argsFor("crm")).toBe("skip");expect(argsFor("quotes")).toBe("skip");expect(argsFor("invoices")).toEqual({siteUrl:"example.test"});expect(text).toContain("4 invoices outstanding");expect(text).not.toContain("gross payments");
	});
	it("issues no authorized report reads for an unauthenticated layout", async () => {
		const text=await render(undefined,false);for(const ref of ["orders","crm","invoices","quotes"])expect(argsFor(ref)).toBe("skip");expect(mocks.query).not.toHaveBeenCalled();expect(text).not.toContain("invoices outstanding");
	});
	it("does not invent empty activity for a host with only dashboard access", async () => {
		const text=await render(["dashboard"]);expect(text).not.toContain("recent activity");expect(text).not.toContain("no orders yet");expect(text).not.toContain("clients");expect(mocks.query).not.toHaveBeenCalled();
	});
	it.each(["crm", "quotes"])("keeps a failed %s summary unavailable instead of zero", async ref => {
		mocks.errors.add(ref);const text=await render();expect(text).toContain(ref === "crm" ? "client summary could not load" : "quote summary could not load");expect(text).not.toContain(ref === "crm" ? "0 clients" : "0 quotes awaiting response");
	});

});
