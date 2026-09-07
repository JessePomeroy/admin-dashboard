import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import InvoiceCreateModal from "../src/lib/pages/invoicing/InvoiceCreateModal.svelte";
import InvoiceDetailModal from "../src/lib/pages/invoicing/InvoiceDetailModal.svelte";
import InvoiceTable from "../src/lib/pages/invoicing/InvoiceTable.svelte";
import DashboardPage from "../src/lib/pages/DashboardPage.svelte";
import type { Invoice } from "../src/lib/types";
import { toId } from "../src/lib/utils";

const components: ReturnType<typeof mount>[] = [];
const invoice: Invoice = {
	_id: toId<"invoices">("invoice-1"), _creationTime: 1, siteUrl: "example.test",
	invoiceNumber: "INV-001", clientId: toId<"photographyClients">("client-1"),
	clientName: "Avery", invoiceType: "one-time", status: "draft", taxPercent: 6.25,
	items: [
		{ description: "First half", quantity: 0.5, unitPrice: 1999 },
		{ description: "Second half", quantity: 0.5, unitPrice: 1999 },
	],
};

vi.mock("convex-svelte", () => ({
	useQuery: (ref: string) => ({ data: ref === "invoices" ? [invoice] : undefined, isLoading: false }),
}));
vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({
		siteUrl: "example.test",
		api: { orders: { getStats: "orders" }, crm: { getStats: "crm" }, invoices: { list: "invoices" }, quotes: { list: "quotes" } },
	}),
}));

afterEach(async () => {
	for (const component of components.splice(0)) await unmount(component);
	document.body.replaceChildren();
});

async function input(selector: string, value: string) {
	const field = document.querySelector<HTMLInputElement>(selector)!;
	field.value = value;
	field.dispatchEvent(new Event("input", { bubbles: true }));
	await tick();
	return field;
}

function button(label: string) {
	const element = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
		.find((entry) => entry.textContent?.trim() === label);
	if (!element) throw new Error(`Missing button: ${label}`);
	return element;
}

function renderDetail(doc = invoice) {
	const save = vi.fn(async () => {});
	components.push(mount(InvoiceDetailModal, {
		target: document.body,
		props: {
			invoice: doc, templates: [], onsave: save, onaction: vi.fn(async () => {}),
			onsend: vi.fn(async () => {}), ondelete: vi.fn(async () => {}), onshare: vi.fn(async () => {}),
			onemailresolved: vi.fn(), onemailrecovery: vi.fn(), onemailterminal: vi.fn(),
			onemailrecoverydismiss: vi.fn(), shareLinkCopied: false, onclose: vi.fn(),
		},
	}));
	return save;
}

describe("fractional invoice amounts", () => {
	it("includes rounded lines and tax in the dashboard pending amount", async () => {
		components.push(mount(DashboardPage, { target: document.body, props: { data: { newInquiryCount: 0 } } }));
		await tick();
		const summary = Array.from(document.querySelectorAll(".summary-line")).find((entry) => entry.textContent?.includes("invoices outstanding"));
		expect(summary?.textContent).toMatch(/\$21\.25\s+pending/);
	});

	it("accepts fractional quantity and tax inputs with cent-accurate create previews and payloads", async () => {
		const create = vi.fn(async () => {});
		components.push(mount(InvoiceCreateModal, {
			target: document.body,
			props: {
				clients: [{ _id: toId<"photographyClients">("client-1"), _creationTime: 1, siteUrl: "example.test", name: "Avery", email: "avery@example.test", category: "photography", status: "lead" }],
				invoices: [], numberPreview: "INV-001", emailTemplates: [], oncreate: create,
				onsaveandsend: vi.fn(async () => {}), onclose: vi.fn(),
			},
		}));
		await tick();
		const client = document.querySelector<HTMLSelectElement>("#create-client")!;
		client.value = "client-1";
		client.dispatchEvent(new Event("change", { bubbles: true }));
		await input('[aria-label="Item description"]', "First half");
		const quantity = await input('[aria-label="Quantity"]', "0.5");
		await input('[aria-label="Unit price"]', "19.99");
		button("+ add item").click(); await tick();
		await input('.item-block:nth-child(3) [aria-label="Item description"]', "Second half");
		await input('.item-block:nth-child(3) [aria-label="Quantity"]', "0.5");
		await input('.item-block:nth-child(3) [aria-label="Unit price"]', "19.99");
		const tax = await input("#create-tax", "6.25");
		expect(quantity.validity.valid).toBe(true);
		expect(tax.validity.valid).toBe(true);
		expect(Array.from(document.querySelectorAll(".item-line-total"), (entry) => entry.textContent)).toEqual(["$10.00", "$10.00"]);
		expect(document.querySelector(".totals-line")?.textContent).toContain("subtotal: $20.00");
		expect(document.querySelector(".totals-line")?.textContent).toContain("tax: $1.25");
		expect(document.querySelector(".totals-line")?.textContent).toContain("total: $21.25");
		button("save as draft").click(); await tick();
		expect(create).toHaveBeenCalledExactlyOnceWith({
			clientId: "client-1", invoiceType: "one-time", items: invoice.items, taxPercent: 6.25,
		});
		await input('[aria-label="Quantity"]', "");
		expect(button("save as draft").disabled).toBe(true);
		expect(button("save & send").disabled).toBe(true);
		expect(document.querySelector('[role="alert"]')?.textContent).toContain("positive quantities");
		expect(document.body.textContent).not.toContain("NaN");
	});

	it("uses identical fractional amounts in the list, detail, and edit form and can clear tax", async () => {
		components.push(mount(InvoiceTable, { target: document.body, props: { invoices: [invoice], onselect: vi.fn() } }));
		const save = renderDetail();
		await tick();
		expect(document.querySelector(".td-total")?.textContent).toBe("$21.25");
		expect(document.querySelector(".total-amount")?.textContent).toContain("$21.25");
		expect(Array.from(document.querySelectorAll(".items-table-row .itcol-total"), (entry) => entry.textContent)).toEqual(["$10.00", "$10.00"]);
		button("edit").click(); await tick();
		expect(document.querySelector(".total-amount")?.textContent).toContain("$21.25");
		await input("#edit-tax", "0");
		expect(document.querySelector(".total-amount")?.textContent).toContain("$20.00");
		button("save changes").click(); await tick();
		expect(save).toHaveBeenCalledExactlyOnceWith({ items: invoice.items, taxPercent: 0, dueDate: undefined, notes: undefined });
	});

	it("keeps invalid legacy amounts editable without crashing and blocks invalid numeric drafts", async () => {
		const invalid = { ...invoice, items: [{ description: "Invalid", quantity: -1, unitPrice: 100 }] };
		components.push(mount(InvoiceTable, { target: document.body, props: { invoices: [invalid], onselect: vi.fn() } }));
		const save = renderDetail(invalid);
		await tick();
		expect(document.querySelector(".td-total")?.textContent).toBe("invalid amount");
		expect(document.querySelector('[role="alert"]')?.textContent).toBe("invalid invoice amount");
		button("edit").click(); await tick();
		expect(button("save changes").disabled).toBe(true);
		await input('[aria-label="Quantity"]', "0.00001");
		expect(button("save changes").disabled).toBe(false);
		await input('[aria-label="Unit price"]', "");
		expect(button("save changes").disabled).toBe(true);
		expect(save).not.toHaveBeenCalled();
	});
});
