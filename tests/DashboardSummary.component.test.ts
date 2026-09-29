import { mount, tick, unmount } from "svelte";
import { afterEach, expect, test, vi } from "vitest";
import Dashboard from "../src/lib/pages/DashboardPage.svelte";
const queries = vi.hoisted(() => ({ calls: [] as string[], modern: true }));
vi.mock("../src/lib/config", () => ({ getAdminConfig: () => ({
	siteUrl: "fixture.example", api: {
		orders: { getStats: "orders" }, crm: { getStats: "crm" },
		invoices: { list: "invoice-list", ...(queries.modern ? { getDashboardSummary: "invoice-summary" } : {}) },
		quotes: { list: "quote-list", ...(queries.modern ? { getDashboardSummary: "quote-summary" } : {}) },
	},
}) }));
vi.mock("convex-svelte", () => ({ useQuery: (name: string) => {
	queries.calls.push(name);
	const recent = [{ _id: "invoice-1", _creationTime: 1, invoiceNumber: "INV-1", clientName: "Fixture", status: "sent" }];
	const data = name === "invoice-summary" ? { counts: { draft: 0, sent: 1, paid: 0, overdue: 0 }, pendingAmount: 1700, isTruncated: true, recent }
		: name === "quote-summary" ? { counts: { draft: 0, sent: 2, accepted: 0, declined: 0 }, recent: [] }
		: name === "invoice-list" ? recent.map((row) => ({ ...row, items: [{ quantity: 1, unitPrice: 1700 }] }))
		: name === "quote-list" ? [] : {};
	return { data, isLoading: false };
} }));
let component: ReturnType<typeof mount> | undefined;
afterEach(async () => { if (component) await unmount(component); component = undefined; document.body.replaceChildren(); queries.calls = []; });

test("dashboard consumes compact summaries without invoice line items", async () => {
	queries.modern = true;
	component = mount(Dashboard, { target: document.body, props: { data: { newInquiryCount: 0 } } });
	await tick();
	expect(queries.calls).toEqual(["orders", "crm", "invoice-summary", "quote-summary"]);
	expect(document.body.textContent).toContain("$17.00");
	expect(document.body.textContent).toContain("INV-1");
	expect(document.body.textContent).toContain("most recent 200 documents");
});

test("older hosts retain their existing list APIs until backend adoption", async () => {
	queries.modern = false;
	component = mount(Dashboard, { target: document.body, props: { data: { newInquiryCount: 0 } } });
	await tick();
	expect(queries.calls).toEqual(["orders", "crm", "invoice-list", "quote-list"]);
	expect(document.body.textContent).toContain("$17.00");
});
