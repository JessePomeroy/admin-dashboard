import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentEmailRecovery } from "../src/lib/documentEmailRecovery";
import ContractsPage from "../src/lib/pages/ContractsPage.svelte";
import InvoicingPage from "../src/lib/pages/InvoicingPage.svelte";
import QuotesPage from "../src/lib/pages/QuotesPage.svelte";
import { getToasts, removeToast } from "../src/lib/toast";
import {
	acknowledgeDocument, type DocumentKind, resetDocuments,
	savedContract, savedDocument, savedInvoice, savedQuote, type SavedDocument,
} from "./DocumentSendContextState.svelte";

const transport = vi.hoisted(() => ({
	modern: false,
	mutation: vi.fn(),
	query: vi.fn(),
	fetch: vi.fn<typeof fetch>(),
}));

vi.mock("convex-svelte", async () => {
	const { queryData } = await import("./DocumentSendContextState.svelte");
	return {
		useQuery: (ref: string, args?: Parameters<typeof queryData>[1]) => ({
			get data() { return queryData(ref, args); },
			isLoading: false,
		}),
	};
});
vi.mock("../src/lib/adminClient", () => ({
	useAdminClient: () => ({ mutation: transport.mutation, query: transport.query }),
}));
vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({
		siteUrl: "example.test",
		api: {
			invoices: { list: "invoices", get: "getInvoice", getNextNumber: "invoiceNumber", create: "createInvoice", update: "updateInvoice" },
			quotes: { list: "quotes", get: "getQuote", getNextNumber: "quoteNumber", listPresets: "presets", create: "createQuote", update: "updateQuote" },
			contracts: { list: "contracts", get: "getContract", listTemplates: "contractTemplates", create: "createContract", update: "updateContract" },
			crm: { listClients: "clients" },
			emailTemplates: { list: "emailTemplates" },
			...(transport.modern ? { businessRecords: { list: "records", get: "rawRecord" } } : {}),
		},
	}),
}));

type Outcome = "confirmed" | "failed" | "uncertain";
type PostBody = Record<string, unknown> & { attemptId: string };
type Mode = "legacy" | "modern";
const kinds: DocumentKind[] = ["invoice", "quote", "contract"];
const terminalFilter = { invoice: "paid", quote: "accepted", contract: "signed" };
const reader = { invoice: "getInvoice", quote: "getQuote", contract: "getContract" };
const creator = { invoice: "createInvoice", quote: "createQuote", contract: "createContract" };
const idArgument = { invoice: "invoiceId", quote: "quoteId", contract: "contractId" };

let component: ReturnType<typeof mount> | undefined;
let kind: DocumentKind;
let firstPost: ReturnType<typeof Promise.withResolvers<Response>>;
let createAcknowledgement: ReturnType<typeof Promise.withResolvers<string>> | undefined;
let recoveryRead: ReturnType<typeof Promise.withResolvers<DocumentEmailRecovery | null>> | undefined;
let heldRecoveryFetches: number;
let consumedRecoveryBodies: number;
let allowExplicitRelease: boolean;
let outcome: "pending" | Outcome;
let posted: { endpoint: string; body: PostBody }[];
let unexpected: string[];

function rejectUnexpected(message: string): never {
	unexpected.push(message);
	throw new Error(`Unexpected fictional request: ${message}`);
}

function endpoint() {
	return `/api/admin/${kind === "invoice" ? "invoicing" : `${kind}s`}/${kind}-new/send`;
}

function parsePostBody(body: RequestInit["body"]): PostBody {
	if (typeof body !== "string") throw new Error("Expected a JSON email request body");
	const value: unknown = JSON.parse(body);
	if (typeof value !== "object" || value === null || !("attemptId" in value) || typeof value.attemptId !== "string") {
		throw new Error("Missing email attempt ID");
	}
	return value;
}

function recovery(status: DocumentEmailRecovery["status"] = "uncertain"): DocumentEmailRecovery {
	const attemptId = posted.at(-1)?.body.attemptId;
	if (!attemptId) throw new Error("Recovery requested before a send attempt exists");
	return {
		protocolVersion: 1, attemptId, document: { type: kind, id: `${kind}-new` }, status,
		recipient: "frozen@example.test", subject: "Frozen message for original recipient",
		claimCount: 1, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_100,
		retryUntil: 1_700_082_800_000, resolveNotAcceptedAt: 1_700_082_800_000,
		portalExpired: false, canRetry: status === "uncertain", canFinalizeAcceptance: false,
		canRecordAcceptance: status === "uncertain", canResolveNotAccepted: status === "uncertain" && allowExplicitRelease,
	};
}

function postReply(): Response {
	const attemptId = posted.at(-1)?.body.attemptId;
	if (outcome === "failed") return Response.json({ error: "rejected", message: "Fictional recipient rejected", attemptId }, { status: 422 });
	if (outcome === "uncertain") return Response.json({ error: "uncertain", message: "Fictional uncertain response", attemptId, recovery: recovery() }, { status: 409 });
	return Response.json({ success: true, attemptId });
}

async function click(label: string, scope: ParentNode = document) {
	const button = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((entry) => entry.textContent?.trim() === label);
	if (!button) throw new Error(`Missing button: ${label}`);
	expect(button.disabled, `${label} must be enabled`).toBe(false);
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

async function flushAsyncTurns() {
	// Response.json, tracker Promise.allSettled and Svelte effects must all finish.
	for (let turn = 0; turn < 3; turn += 1) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		await tick();
	}
}

function filter() {
	const select = document.querySelector<HTMLSelectElement>('select[aria-label="all statuses"], select.filter-select');
	if (!select) throw new Error("Missing document status filter");
	return select;
}

function receipt(id = `${kind}-new`) {
	const item = document.querySelector<HTMLElement>(`[aria-label="saved document email requests"] li[data-document-id="${id}"]`);
	if (!item) throw new Error(`Missing saved-document receipt: ${id}`);
	return item;
}

function detail() {
	const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
	if (!dialog) throw new Error("Missing document dialog");
	return dialog;
}

async function closeDialog() {
	const close = detail().querySelector<HTMLButtonElement>('[aria-label="Close dialog"]');
	if (!close) throw new Error("Missing dialog Close action");
	close.click();
	await tick();
}

async function render(documentKind: DocumentKind, mode: Mode = "legacy") {
	kind = documentKind;
	transport.modern = mode === "modern";
	const props = { data: { adminSession: { status: "authorized", email: "artist@example.test", tier: "full", isCreator: true } } };
	if (kind === "invoice") component = mount(InvoicingPage, { target: document.body, props });
	else if (kind === "quote") component = mount(QuotesPage, { target: document.body, props });
	else component = mount(ContractsPage, { target: document.body, props });
	await tick();
	filter().value = terminalFilter[kind];
	filter().dispatchEvent(new Event("change", { bubbles: true }));
	await tick();
	await fill(".filter-search", "avery");
	if (mode === "modern") {
		await click("next", document.querySelector('nav[aria-label="Record pages"]') ?? document);
		expect(document.querySelector('nav[aria-label="Record pages"]')?.textContent).toContain("page 2");
	}
}

async function fillNewDocument() {
	await click(`new ${kind}`);
	await fill("#create-client", "client-1");
	if (kind === "invoice") {
		await fill('[aria-label="Item description"]', "New session");
		await fill('[aria-label="Unit price"]', "123.45");
	} else if (kind === "quote") {
		await fill("#pkg-name-0", "New session");
		await fill("#pkg-price-0", "123.45");
	} else {
		await fill("#create-title", "Contract submitted for approval");
		await fill("#create-body", "Fictional agreed session terms");
		await fill("#create-total-price", "123.45");
	}
	await fill("#tpl-select", "email-template");
	await click("edit source");
	await fill("#tpl-subject", "Frozen {{clientName}} subject");
}

async function startSend() {
	await fillNewDocument();
	await click("save & send");
	await vi.waitFor(() => expect(posted).toHaveLength(1));
	expect(document.querySelector('[role="dialog"]')).toBeNull();
	expect(receipt().textContent).toContain("email request in progress");
	expect(transport.mutation).toHaveBeenCalledOnce();
}

async function openSaved() {
	await click(`open saved ${kind}`, receipt());
	await vi.waitFor(() => expect(document.querySelector('.detail-client')?.textContent).toBe("Avery Current"));
	expect(transport.query).toHaveBeenLastCalledWith(reader[kind], { [idArgument[kind]]: `${kind}-new` });
	expect(detail().textContent).toContain(kind === "invoice" ? "INV-SAVED" : kind === "quote" ? "QT-SAVED" : "Saved contract");
	expect(detail().textContent).not.toContain("PREVIEW");
}

async function finishSend(value: Outcome) {
	outcome = value;
	firstPost.resolve(postReply());
	await vi.waitFor(() => {
		const text = receipt().textContent;
		expect(text).not.toContain("email request in progress");
		if (value === "confirmed") expect(text).toContain("email request confirmed");
		else if (value === "failed") expect(text).toContain("Fictional recipient rejected");
		else expect(text).toContain("Delivery is still being reconciled");
	}, { timeout: 3000 });
	await tick();
}

beforeEach(() => {
	resetDocuments();
	sessionStorage.clear();
	posted = [];
	unexpected = [];
	outcome = "pending";
	firstPost = Promise.withResolvers<Response>();
	createAcknowledgement = undefined;
	recoveryRead = undefined;
	heldRecoveryFetches = 0;
	consumedRecoveryBodies = 0;
	allowExplicitRelease = false;
	transport.modern = false;
	transport.query.mockReset().mockImplementation(async (ref: string, args: Record<string, string>) => {
		expect(ref).toBe(reader[kind]);
		expect(args).toEqual({ [idArgument[kind]]: `${kind}-new` });
		return savedDocument(kind);
	});
	transport.mutation.mockReset().mockImplementation(async (ref: string, args: Record<string, unknown>) => {
		expect(ref).toBe(creator[kind]);
		expect(args.siteUrl).toBe("example.test");
		expect(args.clientId).toBe("client-1");
		const id = createAcknowledgement ? await createAcknowledgement.promise : `${kind}-new`;
		acknowledgeDocument(kind, id);
		return id;
	});
	transport.fetch.mockReset().mockImplementation(async (input, init) => {
		const url = new URL(String(input), "https://fixture.invalid");
		if (init?.method === "POST" && url.pathname === endpoint()) {
			posted.push({ endpoint: url.pathname, body: parsePostBody(init.body) });
			return posted.length === 1 ? firstPost.promise : postReply();
		}
		if ((!init?.method || init.method === "GET") && url.pathname.startsWith("/api/admin/document-email-attempts/")) {
			const type = url.searchParams.get("documentType");
			const id = url.searchParams.get("documentId");
			if (type !== kind) return rejectUnexpected(`recovery document type: ${type}`);
			if (id === `${kind}-first` || id === `${kind}-second`) return Response.json({ recovery: null });
			if (id !== `${kind}-new`) return rejectUnexpected(`recovery document ID: ${id}`);
			if (url.pathname !== "/api/admin/document-email-attempts/open" && url.pathname !== `/api/admin/document-email-attempts/${posted[0]?.body.attemptId}`) {
				return rejectUnexpected(`recovery attempt: ${url.pathname}`);
			}
			if (recoveryRead) {
				heldRecoveryFetches += 1;
				const response = Response.json({ recovery: await recoveryRead.promise });
				const json = response.json.bind(response);
				vi.spyOn(response, "json").mockImplementation(async () => {
					const body: unknown = await json();
					consumedRecoveryBodies += 1;
					return body;
				});
				return response;
			}
			if (outcome === "confirmed") return Response.json({ recovery: null });
			return Response.json({ recovery: recovery(outcome === "pending" ? "claimed" : outcome === "failed" ? "failed" : "uncertain") });
		}
		return rejectUnexpected(`${init?.method ?? "GET"} ${url.pathname}`);
	});
	vi.stubGlobal("fetch", transport.fetch);
});

afterEach(async () => {
	// Do not strand a held network boundary if an assertion fails.
	outcome = "confirmed";
	firstPost.resolve(Response.json({ success: true }));
	createAcknowledgement?.resolve(`${kind}-new`);
	recoveryRead?.resolve(null);
	await flushAsyncTurns();
	if (component) await unmount(component);
	component = undefined;
	for (const toast of getToasts()) removeToast(toast.id);
	document.body.replaceChildren();
	sessionStorage.clear();
	vi.unstubAllGlobals();
	expect(unexpected).toEqual([]);
});

describe("created-document email context through the real pages", () => {
	for (const status of ["sent", "failed", "resolved_not_sent"] as const) {
		it.each(kinds)(`%s: reconciles the saved receipt after an exact terminal ${status} refresh`, async documentKind => {
			await render(documentKind);
			await startSend();
			await openSaved();
			await finishSend("uncertain");
			await flushAsyncTurns();
			const attemptId = posted[0].body.attemptId;
			const frozenBody = JSON.stringify(posted[0].body);
			const postCount = posted.length;
			transport.fetch.mockImplementationOnce(async (input, init) => {
				const url = new URL(String(input), "https://fixture.invalid");
				expect(url.pathname).toBe(`/api/admin/document-email-attempts/${attemptId}`);
				expect(Object.fromEntries(url.searchParams)).toEqual({ documentType: documentKind, documentId: `${documentKind}-new` });
				expect(init?.method ?? "GET").toBe("GET");
				return Response.json({ recovery: {
					...recovery(status), canRetry: false, canRecordAcceptance: false,
				} });
			});
			await click("refresh status", detail());
			await vi.waitFor(() => expect(document.querySelector(`[data-document-id="${kind}-new"]`)).toBeNull());
			await flushAsyncTurns();
			expect(detail().querySelector(".recovery h3")?.textContent).toContain(status === "sent" ? "confirmed" : status === "failed" ? "rejected" : "not accepted");
			expect(detail().querySelector(".status-label")?.textContent).toBe(status === "sent" ? "sent" : "draft");
			expect(posted).toHaveLength(postCount);
			expect(posted.every(request => JSON.stringify(request.body) === frozenBody)).toBe(true);
			expect(transport.mutation).toHaveBeenCalledOnce();
		});
	}

	for (const documentKind of kinds) {
		const cases: [Mode, Outcome][] = [["legacy", "confirmed"], ["modern", "uncertain"], [documentKind === "quote" ? "modern" : "legacy", "failed"]];
		it.each(cases)(`${documentKind}: retains an excluded saved record through %s %s`, async (mode, result) => {
			await render(documentKind, mode);
			await startSend();
			expect(filter().value).toBe(terminalFilter[kind]);
			expect([...document.querySelectorAll("tbody tr")].every((row) => !row.textContent?.includes("SAVED"))).toBe(true);
			await openSaved();
			expect(detail().textContent).toMatch(/(?:request in progress|sending\.\.\.)/);
			expect(posted).toHaveLength(1);
			await finishSend(result);
			if (result === "confirmed") {
				expect(detail().querySelector(".send-success")).not.toBeNull();
				expect(detail().querySelector(".recovery")).toBeNull();
			} else if (result === "failed") {
				expect(detail().querySelector(".send-error")).not.toBeNull();
				expect(detail().querySelector(".recovery")).toBeNull();
			} else {
				await vi.waitFor(() => expect(detail().querySelector(".recovery")?.textContent).toContain("Frozen message for original recipient"));
				expect(detail().querySelector(".recovery")?.textContent).toContain("frozen@example.test");
				expect(posted).toHaveLength(3);
			}
			expect(transport.mutation).toHaveBeenCalledOnce();
			expect(posted.every((request) => JSON.stringify(request.body) === JSON.stringify(posted[0].body))).toBe(true);
			expect(posted[0].body).toEqual({ templateId: "email-template", customSubject: "Frozen {{clientName}} subject", customBody: "Review {{portalUrl}}", attemptId: expect.any(String) });
			expect(filter().value).toBe(terminalFilter[kind]);
			expect(document.querySelector<HTMLInputElement>(".filter-search")?.value).toBe("avery");
			if (mode === "modern") expect(document.querySelector('nav[aria-label="Record pages"]')?.textContent).toContain("page 2");
			await closeDialog();
			expect(document.querySelector('[role="dialog"]')).toBeNull();
			expect(receipt()).not.toBeNull();
		});

		it(`${documentKind}: failed create has no saved receipt or email POST`, async () => {
			transport.mutation.mockRejectedValueOnce(new Error("Fictional create denied"));
			await render(documentKind);
			await fillNewDocument();
			await click("save & send");
			await vi.waitFor(() => expect(transport.mutation).toHaveBeenCalledOnce());
			await tick();
			expect(document.querySelector('[aria-label="saved document email requests"] li')).toBeNull();
			expect(posted).toEqual([]);
		});

		it(`${documentKind}: confirmation preserves a terminal status returned by its enriched getter`, async () => {
			const terminal: SavedDocument = documentKind === "invoice" ? { ...savedInvoice(), status: "paid" }
				: documentKind === "quote" ? { ...savedQuote(), status: "accepted" }
				: { ...savedContract(), status: "signed" };
			transport.query.mockResolvedValueOnce(terminal);
			await render(documentKind);
			await startSend();
			await openSaved();
			await finishSend("confirmed");
			expect(detail().querySelector(".status-label")?.textContent).toBe(terminalFilter[kind]);
			expect(posted).toHaveLength(1);
		});

		it(`${documentKind}: a saved-record read begun while pending reflects confirmation before the read returns`, async () => {
			const read = Promise.withResolvers<SavedDocument | null>();
			transport.query.mockReturnValueOnce(read.promise);
			await render(documentKind, "modern");
			await startSend();
			await click(`open saved ${kind}`, receipt());
			expect(transport.query).toHaveBeenLastCalledWith(reader[kind], { [idArgument[kind]]: `${kind}-new` });
			await finishSend("confirmed");
			expect(document.querySelector('[role="dialog"]')).toBeNull();
			read.resolve(savedDocument(kind));
			await vi.waitFor(() => expect(document.querySelector('.detail-client')?.textContent).toBe("Avery Current"));
			expect(detail().querySelector(".send-success")).not.toBeNull();
			expect(detail().querySelector(".status-label")?.textContent).toBe("sent");
			expect(detail().querySelector(".recovery")).toBeNull();
			expect(posted).toHaveLength(1);
			expect(transport.mutation).toHaveBeenCalledOnce();
			expect(filter().value).toBe(terminalFilter[kind]);
			expect(document.querySelector('nav[aria-label="Record pages"]')?.textContent).toContain("page 2");
		});

		it(`${documentKind}: a filter change invalidates its delayed saved-record read`, async () => {
			const read = Promise.withResolvers<SavedDocument | null>();
			transport.query.mockReturnValueOnce(read.promise);
			await render(documentKind);
			await startSend();
			await click(`open saved ${kind}`, receipt());
			filter().value = "all";
			filter().dispatchEvent(new Event("change", { bubbles: true }));
			await tick();
			read.resolve(savedDocument(kind));
			await tick();
			await tick();
			expect(document.querySelector('[role="dialog"]')).toBeNull();
			expect(filter().value).toBe("all");
			await finishSend("confirmed");
			expect(document.querySelector('[role="dialog"]')).toBeNull();
			expect(posted).toHaveLength(1);
		});
	}

	it.each(kinds)("%s: an older create acknowledgement preserves a newer form draft", async (documentKind) => {
		createAcknowledgement = Promise.withResolvers<string>();
		await render(documentKind);
		await fillNewDocument();
		await click("save & send");
		await vi.waitFor(() => expect(transport.mutation).toHaveBeenCalledOnce());
		await closeDialog();
		await click(`new ${kind}`);
		const field = kind === "invoice" ? '[aria-label="Item description"]' : kind === "quote" ? "#pkg-name-0" : "#create-title";
		await fill(field, "Newer unsaved draft");
		createAcknowledgement.resolve(`${kind}-new`);
		await vi.waitFor(() => expect(posted).toHaveLength(1));
		expect(document.querySelector<HTMLInputElement>(field)?.value).toBe("Newer unsaved draft");
		expect(receipt().textContent).toContain("email request in progress");
		await finishSend("confirmed");
		expect(document.querySelector<HTMLInputElement>(field)?.value).toBe("Newer unsaved draft");
		expect(transport.mutation).toHaveBeenCalledOnce();
	});

	it("invoice: a newer pagination intent prevents a delayed receipt read from opening", async () => {
		const read = Promise.withResolvers<SavedDocument | null>();
		transport.query.mockReturnValueOnce(read.promise);
		await render("invoice", "modern");
		await startSend();
		await click("open saved invoice", receipt());
		await click("previous", document.querySelector('nav[aria-label="Record pages"]') ?? document);
		read.resolve(savedDocument(kind));
		await tick();
		await tick();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(document.querySelector('nav[aria-label="Record pages"]')?.textContent).toContain("page 1");
		await finishSend("confirmed");
		expect(posted).toHaveLength(1);
	});

	it("quote: selecting and closing another row prevents an older saved-record read from reopening", async () => {
		const read = Promise.withResolvers<SavedDocument | null>();
		transport.query.mockReturnValueOnce(read.promise);
		await render("quote");
		await startSend();
		await click("open saved quote", receipt());
		const row = document.querySelector<HTMLElement>("tbody tr");
		if (!row) throw new Error("Missing other quote row");
		row.click();
		await tick();
		expect(detail().textContent).toContain("QT-FIRST");
		await closeDialog();
		read.resolve(savedDocument(kind));
		await tick();
		await tick();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		await finishSend("confirmed");
	});

	it("contract: opening a new form supersedes a delayed saved-record read", async () => {
		const read = Promise.withResolvers<SavedDocument | null>();
		transport.query.mockReturnValueOnce(read.promise);
		await render("contract");
		await startSend();
		await click("open saved contract", receipt());
		await click("new contract");
		await fill("#create-title", "Newer contract draft");
		read.resolve(savedDocument(kind));
		await tick();
		await tick();
		expect(document.querySelector<HTMLInputElement>("#create-title")?.value).toBe("Newer contract draft");
		expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
		await finishSend("confirmed");
		expect(document.querySelector<HTMLInputElement>("#create-title")?.value).toBe("Newer contract draft");
	});

	it("invoice: old recovery discovery cannot restore uncertainty after the original POST confirms", async () => {
		await render("invoice");
		await startSend();
		recoveryRead = Promise.withResolvers<DocumentEmailRecovery | null>();
		await openSaved();
		await vi.waitFor(() => expect(heldRecoveryFetches).toBe(2));
		expect(consumedRecoveryBodies).toBe(0);
		const oldRecovery = recovery();
		await finishSend("confirmed");
		recoveryRead.resolve(oldRecovery);
		await vi.waitFor(() => expect(consumedRecoveryBodies).toBe(2));
		await flushAsyncTurns();
		expect(detail().querySelector(".send-success")).not.toBeNull();
		expect(detail().querySelector(".recovery")).toBeNull();
		expect(sessionStorage.getItem("document-email-request-v1:invoice%3Ainvoice-new")).toBeNull();
		expect(posted).toHaveLength(1);
	});

	it.each(kinds)("%s: older discovery retains a newer uncertain send's frozen recovery details", async (documentKind) => {
		await render(documentKind);
		await startSend();
		const originalAttempt = posted[0].body.attemptId;
		const originalBody = JSON.stringify(posted[0].body);
		recoveryRead = Promise.withResolvers<DocumentEmailRecovery | null>();
		await openSaved();
		await vi.waitFor(() => expect(heldRecoveryFetches).toBe(2));
		expect(consumedRecoveryBodies).toBe(0);
		const discoveryRequests = transport.fetch.mock.calls.filter(([input]) => String(input).startsWith("/api/admin/document-email-attempts/"));
		expect(discoveryRequests).toHaveLength(2);
		expect(new Set(discoveryRequests.map(([input]) => new URL(String(input), "https://fixture.invalid").pathname))).toEqual(new Set([
			"/api/admin/document-email-attempts/open", `/api/admin/document-email-attempts/${originalAttempt}`,
		]));
		for (const [input, init] of discoveryRequests) {
			expect(Object.fromEntries(new URL(String(input), "https://fixture.invalid").searchParams)).toEqual({ documentType: documentKind, documentId: `${documentKind}-new` });
			expect(init?.method ?? "GET").toBe("GET");
			expect(init?.cache).toBe("no-store");
		}
		await finishSend("failed");
		await click("dismiss", detail());
		outcome = "uncertain";
		await click("send email", detail());
		await vi.waitFor(() => expect(posted).toHaveLength(4));
		const newerAttempt = posted[1].body.attemptId;
		expect(newerAttempt).not.toBe(originalAttempt);
		expect(posted.slice(1).every((request) => JSON.stringify(request.body) === JSON.stringify(posted[1].body))).toBe(true);
		expect(JSON.stringify(posted[0].body)).toBe(originalBody);
		await vi.waitFor(() => expect(detail().querySelector(".recovery")?.textContent).toContain("Frozen message for original recipient"));
		expect(detail().querySelector(".recovery")?.textContent).toContain("frozen@example.test");
		expect(detail().querySelector<HTMLInputElement>(`#provider-message-${newerAttempt}`)).not.toBeNull();
		expect(detail().querySelector(".recovery")?.textContent).toContain("record acceptance");

		recoveryRead.resolve(null);
		await vi.waitFor(() => expect(consumedRecoveryBodies).toBe(2));
		await flushAsyncTurns();
		expect(detail().querySelector(".recovery")?.textContent, "old discovery must retain the newer frozen subject").toContain("Frozen message for original recipient");
		expect(detail().querySelector(".recovery")?.textContent).toContain("frozen@example.test");
		expect(detail().querySelector(".recovery code")?.textContent).toBe(newerAttempt);
		expect(detail().querySelector<HTMLInputElement>(`#provider-message-${newerAttempt}`)).not.toBeNull();
		expect(detail().querySelector(".recovery")?.textContent).toContain("record acceptance");
		expect(receipt().textContent).toContain("Delivery is still being reconciled");
		expect(posted).toHaveLength(4);
		expect(transport.mutation).toHaveBeenCalledOnce();
	});

	it.each(kinds)("%s: an older full claimed response retains newer same-attempt recovery controls", async (documentKind) => {
		await render(documentKind);
		await startSend();
		const attemptId = posted[0].body.attemptId;
		const frozenBody = JSON.stringify(posted[0].body);
		recoveryRead = Promise.withResolvers<DocumentEmailRecovery | null>();
		await openSaved();
		await vi.waitFor(() => expect(heldRecoveryFetches).toBe(2));
		expect(consumedRecoveryBodies).toBe(0);
		const reads = transport.fetch.mock.calls.filter(([input]) => String(input).startsWith("/api/admin/document-email-attempts/"));
		expect(reads).toHaveLength(2);
		expect(new Set(reads.map(([input]) => new URL(String(input), "https://fixture.invalid").pathname))).toEqual(new Set([
			"/api/admin/document-email-attempts/open", `/api/admin/document-email-attempts/${attemptId}`,
		]));
		for (const [input, init] of reads) {
			expect(Object.fromEntries(new URL(String(input), "https://fixture.invalid").searchParams)).toEqual({ documentType: documentKind, documentId: `${documentKind}-new` });
			expect(init?.method ?? "GET").toBe("GET");
			expect(init?.cache).toBe("no-store");
		}
		const oldClaim: DocumentEmailRecovery = { ...recovery("claimed"), updatedAt: 1_700_000_000_050 };
		await finishSend("uncertain");
		await vi.waitFor(() => expect(detail().querySelector<HTMLInputElement>(`#provider-message-${attemptId}`)).not.toBeNull());
		expect(detail().querySelector(".recovery")?.textContent).toContain("record acceptance");
		expect(consumedRecoveryBodies).toBe(0);

		recoveryRead.resolve(oldClaim);
		await vi.waitFor(() => expect(consumedRecoveryBodies).toBe(2));
		await flushAsyncTurns();
		expect(detail().querySelector<HTMLInputElement>(`#provider-message-${attemptId}`), "old claimed projection must retain newer uncertainty reconciliation").not.toBeNull();
		expect(detail().querySelector(".recovery")?.textContent).toContain("record acceptance");
		expect(detail().querySelector(".recovery")?.textContent).toContain("Frozen message for original recipient");
		expect(detail().querySelector(".recovery")?.textContent).toContain("frozen@example.test");
		expect(detail().querySelector(".recovery code")?.textContent).toBe(attemptId);
		expect(receipt().textContent).toContain("Delivery is still being reconciled");
		expect(posted).toHaveLength(3);
		expect(posted.every((request) => JSON.stringify(request.body) === frozenBody)).toBe(true);
		expect(transport.mutation).toHaveBeenCalledOnce();
	});

	it.each(kinds)("%s: older page discovery retains a later explicit panel refresh", async (documentKind) => {
		await render(documentKind);
		await startSend();
		await finishSend("uncertain");
		const attemptId = posted[0].body.attemptId;
		const frozenBody = JSON.stringify(posted[0].body);
		recoveryRead = Promise.withResolvers<DocumentEmailRecovery | null>();
		await openSaved();
		await vi.waitFor(() => expect(heldRecoveryFetches).toBe(2));
		expect(consumedRecoveryBodies).toBe(0);
		const oldClaim: DocumentEmailRecovery = { ...recovery("claimed"), updatedAt: 1_700_000_000_200 };
		const fresh: DocumentEmailRecovery = { ...recovery("uncertain"), updatedAt: 1_700_000_000_300 };
		let refreshBodyConsumed = false;
		transport.fetch.mockImplementationOnce(async (input, init) => {
			const url = new URL(String(input), "https://fixture.invalid");
			expect(url.pathname).toBe(`/api/admin/document-email-attempts/${attemptId}`);
			expect(Object.fromEntries(url.searchParams)).toEqual({ documentType: documentKind, documentId: `${documentKind}-new` });
			expect(init?.method ?? "GET").toBe("GET");
			expect(init?.cache).toBe("no-store");
			const response = Response.json({ recovery: fresh });
			const json = response.json.bind(response);
			vi.spyOn(response, "json").mockImplementation(async () => {
				const body: unknown = await json();
				refreshBodyConsumed = true;
				return body;
			});
			return response;
		});
		await click("refresh status", detail());
		await vi.waitFor(() => expect(refreshBodyConsumed).toBe(true));
		await flushAsyncTurns();
		expect(detail().querySelector<HTMLInputElement>(`#provider-message-${attemptId}`)).not.toBeNull();
		expect(detail().querySelector(".recovery")?.textContent).toContain("record acceptance");
		expect(consumedRecoveryBodies).toBe(0);

		recoveryRead.resolve(oldClaim);
		await vi.waitFor(() => expect(consumedRecoveryBodies).toBe(2));
		await flushAsyncTurns();
		expect(detail().querySelector<HTMLInputElement>(`#provider-message-${attemptId}`), "old page discovery must not replace the newer explicit refresh").not.toBeNull();
		expect(detail().querySelector(".recovery")?.textContent).toContain("record acceptance");
		expect(detail().querySelector(".recovery")?.textContent).toContain("Frozen message for original recipient");
		expect(detail().querySelector(".recovery")?.textContent).toContain("frozen@example.test");
		expect(detail().querySelector(".recovery code")?.textContent).toBe(attemptId);
		expect(posted).toHaveLength(3);
		expect(posted.every((request) => JSON.stringify(request.body) === frozenBody)).toBe(true);
		expect(transport.fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(3);
		expect(transport.mutation).toHaveBeenCalledOnce();
	});

	it("contract: a terminal create-send receipt permits a later manual send of that saved record", async () => {
		await render("contract");
		await startSend();
		await openSaved();
		await finishSend("failed");
		const originalAttempt = posted[0].body.attemptId;
		await click("dismiss", detail());
		outcome = "confirmed";
		await click("send email", detail());
		await vi.waitFor(() => expect(posted).toHaveLength(2));
		await vi.waitFor(() => expect(detail().querySelector(".send-success")).not.toBeNull());
		expect(posted[1].body.attemptId).not.toBe(originalAttempt);
		expect(transport.mutation).toHaveBeenCalledOnce();
		expect(receipt().textContent).toContain("email request confirmed");
	});

	for (const action of ["refresh", "resolution"] as const) {
		it.each(kinds)(`%s: a closed older ${action === "refresh" ? "recovery" : "resolution"} panel cannot replace a newer confirmed send`, async (documentKind) => {
			allowExplicitRelease = action === "resolution";
			await render(documentKind);
			await startSend();
			await openSaved();
			await finishSend("uncertain");
			await vi.waitFor(() => expect(detail().querySelector(".recovery h3")?.textContent).toContain("needs review"));
			await flushAsyncTurns();
			const originalAttempt = posted[0].body.attemptId;
			const originalBody = posted[0].body;
			const originalEndpoint = endpoint();
			const exactPath = `/api/admin/document-email-attempts/${originalAttempt}`;
			const olderTerminal: DocumentEmailRecovery = {
				...recovery(action === "refresh" ? "failed" : "resolved_not_sent"), attemptId: originalAttempt, canRetry: false, canRecordAcceptance: false,
			};
			const originalFetch = transport.fetch.getMockImplementation();
			if (!originalFetch) throw new Error("Missing strict fictional fetch");
			const refresh = Promise.withResolvers<DocumentEmailRecovery>();
			let refreshStarted = false;
			let refreshBodyConsumed = false;

			function assertRecoveryRead(input: RequestInfo | URL, init: RequestInit | undefined, path: string) {
				const url = new URL(String(input), "https://fixture.invalid");
				expect(url.pathname).toBe(path);
				expect(Object.fromEntries(url.searchParams)).toEqual({ documentType: documentKind, documentId: `${documentKind}-new` });
				expect(init?.method ?? "GET").toBe("GET");
				expect(init?.cache).toBe("no-store");
			}

			try {
				transport.fetch.mockImplementationOnce(async (input, init) => {
					if (action === "refresh") assertRecoveryRead(input, init, exactPath);
					else {
						const url = new URL(String(input), "https://fixture.invalid");
						expect(url.pathname).toBe(`${exactPath}/resolve`);
						expect(url.search).toBe("");
						expect(init?.method).toBe("POST");
						expect(typeof init?.body).toBe("string");
						expect(JSON.parse(String(init?.body))).toEqual({
							expectedDocument: { type: documentKind, id: `${documentKind}-new` },
							resolution: { kind: "not_accepted", confirmation: "NOT ACCEPTED", note: "Fictional provider verification" },
						});
					}
					refreshStarted = true;
					const response = Response.json({ ...(action === "resolution" ? { outcome: "released" } : {}), recovery: await refresh.promise });
					const json = response.json.bind(response);
					vi.spyOn(response, "json").mockImplementation(async () => {
						const body: unknown = await json();
						refreshBodyConsumed = true;
						return body;
					});
					return response;
				});
				if (action === "refresh") await click("refresh status", detail());
				else {
					const release = detail().querySelector<HTMLDetailsElement>("details.release");
					if (!release) throw new Error("Missing authorized release controls");
					release.open = true;
					const checked = release.querySelector<HTMLInputElement>('input[type="checkbox"]');
					if (!checked) throw new Error("Missing provider verification checkbox");
					checked.checked = true;
					checked.dispatchEvent(new Event("change", { bubbles: true }));
					await tick();
					await fill(`#absence-confirmation-${originalAttempt}`, "NOT ACCEPTED");
					await fill(`#absence-note-${originalAttempt}`, "Fictional provider verification");
					await click("record not accepted and release", detail());
				}
				await vi.waitFor(() => expect(refreshStarted).toBe(true));
				expect(refreshBodyConsumed).toBe(false);
				await closeDialog();
				transport.fetch.mockImplementation(async (input, init) => {
					const url = new URL(String(input), "https://fixture.invalid");
					if ((!init?.method || init.method === "GET") && (url.pathname === "/api/admin/document-email-attempts/open" || url.pathname === exactPath)) {
						assertRecoveryRead(input, init, url.pathname);
						return Response.json({ recovery: url.pathname === exactPath ? olderTerminal : null });
					}
					return originalFetch(input, init);
				});
				await openSaved();
				await vi.waitFor(() => expect(detail().querySelector(".recovery h3")?.textContent).toContain(action === "refresh" ? "rejected" : "not accepted"));
				await click("dismiss status", detail());
				expect(posted).toHaveLength(3);
				expect(posted.every((request) => request.endpoint === originalEndpoint && JSON.stringify(request.body) === JSON.stringify(originalBody))).toBe(true);
				outcome = "confirmed";
				await click("send email", detail());
				await vi.waitFor(() => expect(detail().querySelector(".send-success")).not.toBeNull());
				expect(posted).toHaveLength(4);
				expect(posted[3].body.attemptId).not.toBe(originalAttempt);
				expect(posted[3].endpoint).toBe(originalEndpoint);
				expect(transport.mutation).toHaveBeenCalledOnce();

				refresh.resolve(olderTerminal);
				await vi.waitFor(() => expect(refreshBodyConsumed).toBe(true));
				await flushAsyncTurns();
				expect(detail().querySelector(".send-success"), "late closed panel must not replace newer confirmation").not.toBeNull();
				expect(detail().querySelector(".recovery")).toBeNull();
				expect(detail().querySelector(".status-label")?.textContent).toBe("sent");
				expect(sessionStorage.getItem(`document-email-request-v1:${documentKind}%3A${documentKind}-new`)).toBeNull();
				expect(posted).toHaveLength(4);
				expect(transport.mutation).toHaveBeenCalledOnce();
				expect(transport.fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(action === "resolution" ? 5 : 4);
			} finally {
				refresh.resolve(olderTerminal);
				await flushAsyncTurns();
			}
		});
	}
});
