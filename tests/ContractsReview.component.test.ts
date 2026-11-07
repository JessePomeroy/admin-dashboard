import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ContractsPage from "../src/lib/pages/ContractsPage.svelte";
import type { Contract, ContractStatus } from "../src/lib/types";
import { toId } from "../src/lib/utils";

const transport = vi.hoisted(() => ({
	mutation: vi.fn(),
	fetch: vi.fn<typeof fetch>(),
	contracts: [] as Contract[],
}));

vi.mock("convex-svelte", () => ({
	useQuery: (ref: string) => ({
		data: ref === "contracts" ? transport.contracts
			: ref === "emailTemplates" ? [{
				_id: "email-template", name: "client note",
				subject: "Hello {{clientName}}", body: "Review {{portalUrl}}",
			}]
			: [],
		isLoading: false,
	}),
}));
vi.mock("../src/lib/adminClient", () => ({
	useAdminClient: () => ({ mutation: transport.mutation }),
}));
vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({
		siteUrl: "example.test",
		api: {
			contracts: { list: "contracts", listTemplates: "templates", update: "updateContract" },
			crm: { listClients: "clients" },
			emailTemplates: { list: "emailTemplates" },
		},
	}),
}));

let component: ReturnType<typeof mount> | undefined;

function contract(status: ContractStatus = "draft", second = false): Contract {
	return {
		_id: toId<"contracts">(second ? "contract-2" : "contract-1"),
		_creationTime: 1,
		siteUrl: "example.test",
		title: second ? "Other contract" : "Original contract",
		clientId: toId<"photographyClients">("client-1"),
		clientName: "Avery",
		category: "web",
		status,
		body: second ? "Other terms" : "Original terms",
		totalPrice: second ? 4500 : 12345,
		depositAmount: 1234,
		eventDate: "2026-10-01",
		eventLocation: "Studio",
		sentAt: status === "sent" ? 1_700_000_000_000 : undefined,
	};
}

async function render(records = [contract()]) {
	transport.contracts = records;
	component = mount(ContractsPage, {
		target: document.body,
		props: { data: { adminSession: {
			status: "authorized", email: "artist@example.test", tier: "full", isCreator: true,
		} } },
	});
	await tick();
}

function dialog() {
	const element = document.querySelector<HTMLElement>('[role="dialog"]');
	if (!element) throw new Error("Missing contract dialog");
	return element;
}

function button(label: string) {
	const element = Array.from(dialog().querySelectorAll<HTMLButtonElement>("button"))
		.find((entry) => entry.textContent?.trim() === label);
	if (!element) throw new Error(`Missing button: ${label}`);
	return element;
}

async function click(label: string) {
	const element = button(label);
	expect(element.disabled).toBe(false);
	element.click();
	await tick();
}

function field(selector: string) {
	const element = dialog().querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
	if (!element) throw new Error(`Missing field: ${selector}`);
	return element;
}

async function fill(selector: string, value: string) {
	const element = field(selector);
	element.value = value;
	element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
	await tick();
}

async function open(index = 0) {
	const row = document.querySelectorAll<HTMLElement>(".ct-row")[index];
	if (!row) throw new Error(`Missing contract row: ${index}`);
	row.click();
	await tick();
}

async function close() {
	dialog().querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')?.click();
	await tick();
	expect(document.querySelector('[role="dialog"]')).toBeNull();
}

async function edit() {
	await click("edit");
	await fill("#edit-title", "Updated contract");
	await fill("#edit-body", "Updated terms");
	await fill("#edit-total-price", "19.99");
}

function sends() {
	return transport.fetch.mock.calls.filter(([, init]) => init?.method === "POST");
}

function detailValue(label: string) {
	return Array.from(dialog().querySelectorAll(".detail-field"))
		.find((entry) => entry.querySelector(".detail-label")?.textContent?.trim() === label)
		?.querySelector(".detail-value")?.textContent;
}

beforeEach(() => {
	transport.mutation.mockReset().mockResolvedValue(null);
	transport.fetch.mockReset().mockImplementation(async (input, init) => {
		if (init?.method === "POST") return Response.json({ success: true });
		if (String(input).startsWith("/api/admin/document-email-attempts/open?")) {
			return Response.json({ recovery: null });
		}
		throw new Error(`Unexpected request: ${String(input)}`);
	});
	vi.stubGlobal("fetch", transport.fetch);
	sessionStorage.clear();
});

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
	sessionStorage.clear();
	vi.unstubAllGlobals();
});

describe("contract email and acknowledged review", () => {
	it("sends the selected email template from an existing draft", async () => {
		await render();
		await open();
		await fill("#email-template", "email-template");
		await click("send email");
		await vi.waitFor(() => expect(dialog().textContent).toContain("email sent"));
		expect(sends()).toHaveLength(1);
		const [endpoint, init] = sends()[0];
		expect(endpoint).toBe("/api/admin/contracts/contract-1/send");
		expect(JSON.parse(String(init?.body))).toEqual({ templateId: "email-template", attemptId: expect.any(String) });
	});

	it.each(["draft", "sent"] as const)("updates the open %s review only after save acknowledgement", async (status) => {
		await render([contract(status)]);
		await open();
		await edit();
		const save = Promise.withResolvers<null>();
		transport.mutation.mockReturnValueOnce(save.promise);
		await click("save changes");
		expect(button("saving...").disabled).toBe(true);
		expect(field("#edit-title").value).toBe("Updated contract");
		expect(transport.mutation).toHaveBeenCalledExactlyOnceWith("updateContract", expect.objectContaining({
			contractId: "contract-1", title: "Updated contract", body: "Updated terms", totalPrice: 1999,
		}));
		save.resolve(null);
		await vi.waitFor(() => expect(dialog().querySelector("#edit-title")).toBeNull());
		expect(dialog().querySelector(".modal-title")?.textContent).toBe("Updated contract");
		expect(dialog().querySelector(".detail-body-text")?.textContent?.trim()).toBe("Updated terms");
		expect(dialog().querySelector(".detail-pricing")?.textContent).toContain("$19.99");
		expect(dialog().querySelector(".detail-pricing")?.textContent).not.toContain("$123.45");
		expect(dialog().textContent).toContain("Avery");
		expect(dialog().textContent).toContain("web");
		expect(sends()).toHaveLength(0);
		if (status === "sent") {
			await click("yes, resend");
			await vi.waitFor(() => expect(sends()).toHaveLength(1));
			expect(JSON.parse(String(sends()[0][1]?.body))).toMatchObject({
				changeNote: "title updated, body updated, total price updated",
			});
		} else {
			expect(button("send email").disabled).toBe(false);
		}
	});

	it("retains stored optional fields when cleared edit inputs serialize as undefined", async () => {
		await render([contract("sent")]);
		await open();
		const sentTimestamp = detailValue("sent");
		expect(sentTimestamp).toBeTruthy();
		await click("edit");
		await fill("#edit-event-date", "");
		await fill("#edit-event-location", "");
		await fill("#edit-total-price", "0");
		await fill("#edit-deposit", "0");
		await click("save changes");
		await vi.waitFor(() => expect(dialog().querySelector("#edit-title")).toBeNull());
		expect(transport.mutation).toHaveBeenCalledExactlyOnceWith("updateContract", {
			contractId: "contract-1", siteUrl: "example.test", title: "Original contract", body: "Original terms",
			eventDate: undefined, eventLocation: undefined, totalPrice: undefined, depositAmount: undefined, status: undefined,
		});
		expect(dialog().querySelector(".detail-pricing")?.textContent).toContain("$123.45");
		expect(dialog().querySelector(".detail-pricing")?.textContent).toContain("$12.34");
		expect(detailValue("sent")).toBe(sentTimestamp);
		await click("no");
		await click("edit");
		expect(field("#edit-event-date").value).toBe("2026-10-01");
		expect(field("#edit-event-location").value).toBe("Studio");
		expect(field("#edit-total-price").value).toBe("123.45");
		expect(field("#edit-deposit").value).toBe("12.34");
		expect(sends()).toHaveLength(0);
	});

	it("keeps rejected edits, shows a generic inline error, and allows a successful retry", async () => {
		await render([contract("sent")]);
		await open();
		await edit();
		transport.mutation.mockRejectedValueOnce(new Error("fictional private failure detail"));
		await click("save changes");
		await vi.waitFor(() => expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("could not save changes"));
		expect(dialog().textContent).not.toContain("fictional private failure detail");
		expect(field("#edit-title").value).toBe("Updated contract");
		expect(field("#edit-body").value).toBe("Updated terms");
		expect(field("#edit-total-price").value).toBe("19.99");
		expect(button("save changes").disabled).toBe(false);
		expect(sends()).toHaveLength(0);
		const retry = Promise.withResolvers<null>();
		transport.mutation.mockReturnValueOnce(retry.promise);
		await click("save changes");
		expect(dialog().querySelector('[role="alert"]')).toBeNull();
		retry.resolve(null);
		await vi.waitFor(() => expect(dialog().querySelector("#edit-title")).toBeNull());
		expect(dialog().querySelector(".detail-body-text")?.textContent?.trim()).toBe("Updated terms");
		expect(button("yes, resend").disabled).toBe(false);
		expect(transport.mutation).toHaveBeenCalledTimes(2);
		expect(sends()).toHaveLength(0);
	});

	it.each(["other", "same"] as const)("does not replace a %s record selection when an earlier save completes", async (selection) => {
		await render([contract("sent"), contract("draft", true)]);
		await open();
		await edit();
		const save = Promise.withResolvers<null>();
		transport.mutation.mockReturnValueOnce(save.promise);
		await click("save changes");
		await close();
		await open(selection === "same" ? 0 : 1);
		save.resolve(null);
		await vi.waitFor(() => expect(transport.mutation).toHaveResolvedWith(null));
		await tick();
		expect(dialog().querySelector(".modal-title")?.textContent).toBe(selection === "same" ? "Original contract" : "Other contract");
		expect(dialog().querySelector(".detail-body-text")?.textContent?.trim()).toBe(selection === "same" ? "Original terms" : "Other terms");
		expect(dialog().querySelector(".detail-pricing")?.textContent).toContain(selection === "same" ? "$123.45" : "$45.00");
		expect(dialog().textContent).not.toContain("resend updated contract");
		expect(transport.mutation.mock.calls[0][1].contractId).toBe("contract-1");
		expect(sends()).toHaveLength(0);
	});

	it("leaves a closed review closed when its pending save completes", async () => {
		await render([contract("sent")]);
		await open();
		await edit();
		const save = Promise.withResolvers<null>();
		transport.mutation.mockReturnValueOnce(save.promise);
		await click("save changes");
		await close();
		save.resolve(null);
		await vi.waitFor(() => expect(transport.mutation).toHaveResolvedWith(null));
		await tick();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(sends()).toHaveLength(0);
	});
});
