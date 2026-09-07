import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InvoicingPage from "../src/lib/pages/InvoicingPage.svelte";
import ContractsPage from "../src/lib/pages/ContractsPage.svelte";

const mocks = vi.hoisted(() => ({
	mutation: vi.fn(),
	request: vi.fn(),
	invoice: {
		_id: "invoice-1", _creationTime: 1, siteUrl: "example.test", invoiceNumber: "INV-001",
		clientId: "client-1", clientName: "Avery", invoiceType: "one-time", status: "draft",
		items: [{ description: "Half hour", quantity: 0.5, unitPrice: 1999 }],
		taxPercent: 6.25, dueDate: "2026-10-01", notes: "Invoice notes",
	},
	contract: {
		_id: "contract-1", _creationTime: 1, siteUrl: "example.test", title: "Original contract",
		clientId: "client-1", clientName: "Avery", status: "draft", body: "Original terms",
		totalPrice: 12345, depositAmount: 1234, eventDate: "2026-10-01", eventLocation: "Studio",
	},
}));

vi.mock("convex-svelte", () => ({
	useQuery: (ref: string) => ({
		data: ref === "invoices" ? [mocks.invoice]
			: ref === "contracts" ? [mocks.contract]
			: ref === "number" ? "INV-002"
			: ref === "clients" ? [{ _id: "client-1", name: "Avery" }]
			: ref === "contractTemplates" ? [{ _id: "contract-template", name: "Session terms", body: "Template terms" }]
			: ref === "emailTemplates" ? [{ _id: "email-template", name: "Document email", subject: "Hello {{clientName}}", body: "Review {{portalUrl}}" }]
			: [],
		isLoading: false,
	}),
}));
vi.mock("../src/lib/adminClient", () => ({ useAdminClient: () => ({ mutation: mocks.mutation }) }));
vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({
		siteUrl: "example.test",
		api: {
			invoices: { list: "invoices", getNextNumber: "number", create: "createInvoice", update: "updateInvoice" },
			contracts: { list: "contracts", listTemplates: "contractTemplates", create: "createContract", update: "updateContract" },
			crm: { listClients: "clients" }, emailTemplates: { list: "emailTemplates" },
		},
	}),
}));

let component: ReturnType<typeof mount> | undefined;

beforeEach(() => {
	mocks.mutation.mockReset().mockResolvedValue("created-document");
	mocks.request.mockReset().mockResolvedValue(Response.json({ success: true, recovery: null }));
	vi.stubGlobal("fetch", mocks.request);
	sessionStorage.clear();
});

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

async function render(kind: "invoice" | "contract") {
	component = mount(kind === "invoice" ? InvoicingPage : ContractsPage, {
		target: document.body,
		props: { data: { adminSession: { status: "authorized", email: "artist@example.test", tier: "full", isCreator: true } } },
	});
	await tick();
}

async function click(label: string) {
	const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
		.find((entry) => entry.textContent?.trim() === label);
	if (!button) throw new Error(`Missing button: ${label}`);
	expect(button.disabled).toBe(false);
	button.click();
	await tick();
}

async function fill(selector: string, value: string) {
	const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
	if (!input) throw new Error(`Missing field: ${selector}`);
	input.value = value;
	input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
	await tick();
}

async function customizeEmail() {
	await fill("#tpl-select", "email-template");
	await click("edit source");
	await fill("#tpl-subject", "Updated {{clientName}}");
}

async function expectCreate(action: string, kind: "invoice" | "contract", payload: object, custom = true) {
	await click(action);
	await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
	expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith(kind === "invoice" ? "createInvoice" : "createContract", payload);
	if (action === "save as draft") {
		expect(mocks.request).not.toHaveBeenCalled();
	} else {
		await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
		const [endpoint, request] = mocks.request.mock.calls[0];
		expect(endpoint).toBe(`/api/admin/${kind === "invoice" ? "invoicing" : "contracts"}/created-document/send`);
		expect(JSON.parse(request.body)).toEqual({
			...(custom ? { templateId: "email-template", customSubject: "Updated {{clientName}}", customBody: "Review {{portalUrl}}" } : {}),
			attemptId: expect.any(String),
		});
	}
}

const actions = ["save as draft", "save & send"];

describe("document forms through their page mutation and email adapters", () => {
	for (const action of actions) {
		it.each(["one-time", "recurring", "deposit", "package", "milestone"])(`preserves %s invoice fields for ${action}`, async (invoiceType) => {
			await render("invoice");
			await click("new invoice");
			await fill("#create-client", "client-1");
			await fill("#create-type", invoiceType);
			await fill('[aria-label="Item description"]', "Half hour");
			await fill('[aria-label="Quantity"]', "0.5");
			await fill('[aria-label="Unit price"]', "19.99");
			await fill("#create-tax", "6.25");
			await fill("#create-due", "2026-10-01");
			await fill("#create-notes", "Invoice notes");
			if (invoiceType === "recurring") {
				await fill("#create-interval", "quarterly");
				await fill("#create-next-due", "2026-10-02");
				await fill("#create-end-date", "2027-10-02");
			} else if (invoiceType === "deposit") {
				await fill("#create-deposit-pct", "25");
				await fill("#create-total-project", "123.45");
			} else if (invoiceType === "milestone") {
				await fill("#create-milestone-name", "Second session");
				await fill("#create-milestone-index", "2");
				await fill("#create-parent-invoice", "invoice-1");
			}
			await customizeEmail();
			await expectCreate(action, "invoice", {
				siteUrl: "example.test", clientId: "client-1", invoiceType,
				items: mocks.invoice.items, taxPercent: 6.25, notes: "Invoice notes", dueDate: "2026-10-01",
				recurring: invoiceType === "recurring" ? { interval: "quarterly", nextDueDate: "2026-10-02", endDate: "2027-10-02" } : undefined,
				depositPercent: invoiceType === "deposit" ? 25 : undefined,
				totalProject: invoiceType === "deposit" ? 12345 : undefined,
				milestoneName: invoiceType === "milestone" ? "Second session" : undefined,
				milestoneIndex: invoiceType === "milestone" ? 2 : undefined,
				parentInvoiceId: invoiceType === "milestone" ? "invoice-1" : undefined,
			});
		});

		it(`preserves absent invoice options and a zero project amount for ${action}`, async () => {
			await render("invoice");
			await click("new invoice");
			await fill("#create-client", "client-1");
			await fill("#create-type", "deposit");
			await fill('[aria-label="Item description"]', "Free session");
			await expectCreate(action, "invoice", {
				siteUrl: "example.test", clientId: "client-1", invoiceType: "deposit",
				items: [{ description: "Free session", quantity: 1, unitPrice: 0 }],
				taxPercent: undefined, notes: undefined, dueDate: undefined, recurring: undefined,
				depositPercent: 50, totalProject: 0, milestoneName: undefined, milestoneIndex: undefined, parentInvoiceId: undefined,
			}, false);
		});

		it(`preserves contract template, metadata, and cent conversions for ${action}`, async () => {
			await render("contract");
			await click("new contract");
			await fill("#create-title", "Session contract");
			await fill("#create-client", "client-1");
			await fill("#create-category", "web");
			await fill("#create-template", "contract-template");
			await fill("#create-event-date", "2026-10-01");
			await fill("#create-event-location", "Studio");
			await fill("#create-total-price", "123.45");
			await fill("#create-deposit", "12.34");
			await customizeEmail();
			await expectCreate(action, "contract", {
				siteUrl: "example.test", clientId: "client-1", title: "Session contract", category: "web",
				templateId: "contract-template", body: "Template terms", eventDate: "2026-10-01",
				eventLocation: "Studio", totalPrice: 12345, depositAmount: 1234,
			});
		});

		it(`leaves absent contract options and default email untouched for ${action}`, async () => {
			await render("contract");
			await click("new contract");
			await fill("#create-title", "Session contract");
			await fill("#create-client", "client-1");
			await fill("#create-body", "Custom terms");
			await expectCreate(action, "contract", {
				siteUrl: "example.test", clientId: "client-1", title: "Session contract", category: "photography",
				templateId: undefined, body: "Custom terms", eventDate: undefined,
				eventLocation: undefined, totalPrice: undefined, depositAmount: undefined,
			}, false);
		});
	}

	it("passes explicit zero tax and existing optional-field clearing through invoice updates", async () => {
		await render("invoice");
		document.querySelector<HTMLElement>(".inv-row")!.click(); await tick();
		await click("edit");
		await fill("#edit-tax", "0");
		await fill("#edit-due", "");
		await fill("#edit-notes", "");
		await click("save changes");
		expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith("updateInvoice", {
			invoiceId: "invoice-1", siteUrl: "example.test", items: mocks.invoice.items,
			taxPercent: 0, notes: undefined, dueDate: undefined, status: undefined,
		});
	});

	it("preserves contract update conversions and existing omitted-zero semantics", async () => {
		await render("contract");
		document.querySelector<HTMLElement>(".ct-row")!.click(); await tick();
		await click("edit");
		await fill("#edit-title", "Updated contract");
		await fill("#edit-body", "Updated terms");
		await fill("#edit-event-date", "");
		await fill("#edit-event-location", "");
		await fill("#edit-total-price", "19.99");
		await fill("#edit-deposit", "0");
		await click("save changes");
		expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith("updateContract", {
			contractId: "contract-1", siteUrl: "example.test", title: "Updated contract", body: "Updated terms",
			eventDate: undefined, eventLocation: undefined, totalPrice: 1999, depositAmount: undefined, status: undefined,
		});
	});
});
