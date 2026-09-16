import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentEmailRecovery } from "../src/lib/documentEmailRecovery";
import InvoicingPage from "../src/lib/pages/InvoicingPage.svelte";
import type { Invoice } from "../src/lib/types";
import { toId } from "../src/lib/utils";

const transport = vi.hoisted(() => ({ mutation: vi.fn(), fetch: vi.fn<typeof fetch>() }));
const invoice: Invoice = {
	_id: toId<"invoices">("invoice-1"),
	_creationTime: 1,
	siteUrl: "example.test",
	invoiceNumber: "INV-001",
	clientId: toId<"photographyClients">("client-1"),
	clientName: "Avery",
	invoiceType: "one-time",
	status: "sent",
	items: [{ description: "Session", quantity: 1, unitPrice: 10000 }],
};
const localAttempt = "11111111-1111-4111-8111-111111111111";
const canonicalAttempt = "22222222-2222-4222-8222-222222222222";
const endpoint = "/api/admin/invoicing/invoice-1/send";
const discovery = "/api/admin/document-email-attempts/open?documentType=invoice&documentId=invoice-1";

vi.mock("convex-svelte", () => ({
	useQuery: (ref: string) => ({
		data: ref === "invoices" ? [invoice] : ref === "number" ? "INV-002" : [],
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
			invoices: { list: "invoices", getNextNumber: "number", update: "updateInvoice" },
			crm: { listClients: "clients" },
			emailTemplates: { list: "templates" },
		},
	}),
}));

let component: ReturnType<typeof mount> | undefined;

function recovery(attemptId: string): DocumentEmailRecovery {
	return {
		protocolVersion: 1,
		attemptId,
		document: { type: "invoice", id: "invoice-1" },
		status: "uncertain",
		recipient: "avery@example.test",
		subject: "Frozen invoice message",
		claimCount: 1,
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_000_100,
		retryUntil: 1_700_082_800_000,
		resolveNotAcceptedAt: 1_700_082_800_000,
		portalExpired: false,
		canRetry: true,
		canFinalizeAcceptance: false,
		canRecordAcceptance: true,
		canResolveNotAccepted: false,
	};
}

async function render() {
	component = mount(InvoicingPage, {
		target: document.body,
		props: { data: { adminSession: {
			status: "authorized", email: "artist@example.test", tier: "full", isCreator: true,
		} } },
	});
	await tick();
}

async function openInvoice() {
	const row = document.querySelector<HTMLElement>("tbody tr");
	if (!row) throw new Error("Missing invoice row");
	row.click();
	await tick();
	expect(document.querySelector('[role="dialog"]')).not.toBeNull();
}

async function closeInvoice() {
	const close = document.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]');
	if (!close) throw new Error("Missing close button");
	close.click();
	await tick();
	expect(document.querySelector('[role="dialog"]')).toBeNull();
}

beforeEach(() => {
	sessionStorage.clear();
	transport.mutation.mockReset().mockResolvedValue(null);
	transport.fetch.mockReset().mockImplementation(async (input, init) => {
		if (input === discovery) return Response.json({ recovery: null });
		if (input === endpoint && init?.method === "POST") return Response.json({ success: true });
		throw new Error(`Unexpected request: ${String(input)}`);
	});
	vi.stubGlobal("fetch", transport.fetch);
});

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
	sessionStorage.clear();
	vi.unstubAllGlobals();
});

describe("invoice page email recovery", () => {
	it("hydrates a reopened invoice from local and canonical backend recovery", async () => {
		const response = Promise.withResolvers<Response>();
		sessionStorage.setItem("document-email-request-v1:invoice%3Ainvoice-1", JSON.stringify({
			version: 1, attemptId: localAttempt, endpoint, body: {},
		}));
		transport.fetch.mockImplementation(async (input) => {
			if (input === discovery) return response.promise;
			for (const attemptId of [localAttempt, canonicalAttempt]) {
				if (input === `/api/admin/document-email-attempts/${attemptId}?documentType=invoice&documentId=invoice-1`) {
					return Response.json({ recovery: recovery(attemptId) });
				}
			}
			throw new Error(`Unexpected request: ${String(input)}`);
		});
		await render();
		await openInvoice();
		await vi.waitFor(() => expect(document.querySelector(".recovery code")?.textContent).toBe(localAttempt));
		expect(transport.fetch).toHaveBeenCalledWith(discovery, expect.objectContaining({ cache: "no-store" }));

		response.resolve(Response.json({ recovery: recovery(canonicalAttempt) }));
		await vi.waitFor(() => expect(document.querySelector(".recovery code")?.textContent).toBe(canonicalAttempt));
		expect(document.querySelector(".recovery")?.textContent).toContain("Frozen invoice message");
		expect(document.querySelector(".recovery")?.textContent).toContain("avery@example.test");

		await closeInvoice();
		transport.fetch.mockClear();
		// A new response is required for each read; Response bodies are one-shot.
		transport.fetch.mockImplementation(async () => Response.json({ recovery: recovery(canonicalAttempt) }));
		await openInvoice();
		await vi.waitFor(() => expect(document.querySelector(".recovery code")?.textContent).toBe(canonicalAttempt));
		expect(transport.fetch).toHaveBeenCalledWith(discovery, expect.objectContaining({ cache: "no-store" }));
		expect(transport.fetch.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
	});

	it("sends the captured invoice reminder after closing during the overdue update", async () => {
		const update = Promise.withResolvers<null>();
		transport.mutation.mockReturnValueOnce(update.promise);
		await render();
		await openInvoice();
		const action = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
			.find((button) => button.textContent?.trim() === "mark overdue");
		if (!action) throw new Error("Missing overdue action");
		action.click();
		await tick();
		expect(transport.mutation).toHaveBeenCalledExactlyOnceWith("updateInvoice", {
			invoiceId: "invoice-1", siteUrl: "example.test", status: "overdue",
		});
		await closeInvoice();
		expect(transport.fetch.mock.calls.some(([input]) => input === endpoint)).toBe(false);
		update.resolve(null);
		await vi.waitFor(() => expect(transport.fetch).toHaveBeenCalledWith(endpoint, expect.objectContaining({
			method: "POST",
			body: expect.any(String),
		})));
		const sends = transport.fetch.mock.calls.filter(([input]) => input === endpoint);
		expect(sends).toHaveLength(1);
		expect(JSON.parse(String(sends[0][1]?.body))).toEqual({
			changeNote: "payment overdue", attemptId: expect.any(String),
		});
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});
});
