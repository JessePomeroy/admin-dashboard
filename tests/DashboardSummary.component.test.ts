import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import Dashboard from "../src/lib/pages/DashboardPage.svelte";
const queries = vi.hoisted(() => ({
	calls: [] as string[], modern: true, partialCounts: true, invalidAmount: false, empty: false,
}));
vi.mock("../src/lib/config", () => ({ getAdminConfig: () => ({
	siteUrl: "fixture.example", api: {
		orders: { getStats: "orders" }, crm: { getStats: "crm" },
		invoices: { list: "invoice-list", ...(queries.modern ? { getDashboardSummary: "invoice-summary" } : {}) },
		quotes: { list: "quote-list", ...(queries.modern ? { getDashboardSummary: "quote-summary" } : {}) },
	},
}) }));
vi.mock("../src/lib/adminClient", () => ({ useAdminClient: () => ({ query: vi.fn().mockResolvedValue([]) }) }));
vi.mock("convex-svelte", () => ({ useQuery: (name: string) => {
	queries.calls.push(name);
	const recent = queries.empty ? [] : [{ _id: "invoice-1", _creationTime: 1, invoiceNumber: "INV-1", clientName: "Fixture", status: "sent" }];
	const counts = queries.empty ? { draft: 0, sent: 0, paid: 0, overdue: 0, partial: 0 }
		: { draft: 1, sent: 1, paid: 1, overdue: 1, ...(queries.partialCounts ? { partial: 1 } : {}) };
	const legacyInvoices = [
		{ status: "draft", total: 300 }, { status: "sent", total: 200 },
		{ status: "overdue", total: 500 }, { status: "partial", total: 1000 },
		{ status: "paid", total: 900 }, { status: "canceled", total: 600 },
	].map((row, i) => ({
		_id: `invoice-${i}`, _creationTime: i, invoiceNumber: `INV-${i}`, clientName: "Fixture", status: row.status,
		items: [{ quantity: 1, unitPrice: row.total }],
		...(row.status === "partial" && !queries.invalidAmount ? { paidAmount: 300 } : {}),
	}));
	const data = name === "invoice-summary" ? { counts, pendingAmount: queries.invalidAmount ? null : queries.empty ? 0 : 1700, isTruncated: !queries.empty, recent }
		: name === "quote-summary" ? { counts: { draft: 0, sent: 2, accepted: 0, declined: 0 }, recent: [] }
		: name === "invoice-list" ? legacyInvoices
		: name === "quote-list" ? [] : {};
	return { data, isLoading: false };
} }));
let component: ReturnType<typeof mount> | undefined;
beforeEach(() => { queries.modern = true; queries.partialCounts = true; queries.invalidAmount = false; queries.empty = false; });
afterEach(async () => { if (component) await unmount(component); component = undefined; document.body.replaceChildren(); queries.calls = []; });

async function renderDashboard() {
	component = mount(Dashboard, { target: document.body, props: { data: { newInquiryCount: 0, adminSession: { status: "authorized", tier: "full", isCreator: false, email: "owner@example.test" } } } });
	await tick();
	return document.body.textContent?.replace(/\s+/g, " ");
}

test("dashboard counts all outstanding statuses from compact summaries without line items", async () => {
	const text = await renderDashboard();
	expect(queries.calls).toEqual(["orders", "crm", "invoice-summary", "quote-summary"]);
	expect(text).toContain("4 invoices outstanding");
	expect(text).toContain("$17.00");
	expect(text).toContain("INV-1");
	expect(text).toContain("most recent 200 documents");
	expect(text).not.toContain("Partially paid invoice counts are unavailable");
});

test("older list APIs count draft, sent, overdue and partial with their remaining balances", async () => {
	queries.modern = false;
	const text = await renderDashboard();
	expect(queries.calls).toEqual(["orders", "crm", "invoice-list", "quote-list"]);
	expect(text).toContain("4 invoices outstanding");
	expect(text).toContain("$17.00");
});

test("older compact summaries disclose a lower bound when partial counts are absent", async () => {
	queries.partialCounts = false;
	const text = await renderDashboard();
	expect(text).toContain("at least 3 invoices outstanding");
	expect(text).toContain("Partially paid invoice counts are unavailable.");
	expect(text).toContain("$17.00");
	expect(text).toContain("most recent 200 documents");
});

test("an invalid compact balance does not erase the outstanding count", async () => {
	queries.invalidAmount = true;
	const text = await renderDashboard();
	expect(text).toContain("4 invoices outstanding");
	expect(text).toContain("invalid amount");
	expect(text).not.toContain("$0.00");
});

test("an unknown legacy partial payment stays unavailable while the invoice is counted", async () => {
	queries.modern = false;
	queries.invalidAmount = true;
	const text = await renderDashboard();
	expect(text).toContain("4 invoices outstanding");
	expect(text).toContain("invalid amount");
	expect(text).not.toContain("$0.00");
});

test("an empty complete summary reports zero without an incomplete-count warning", async () => {
	queries.empty = true;
	const text = await renderDashboard();
	expect(text).toContain("0 invoices outstanding");
	expect(text).toContain("$0.00");
	expect(text).not.toContain("at least");
	expect(text).not.toContain("Partially paid invoice counts are unavailable");
	expect(text).not.toContain("most recent 200 documents");
});
