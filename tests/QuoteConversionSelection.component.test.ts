import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QuotesPage from "../src/lib/pages/QuotesPage.svelte";

const mocks = vi.hoisted(() => ({
	mutation: vi.fn(),
	toast: vi.fn(),
	logError: vi.fn(),
	quotes: ["A", "B"].map((name) => ({
		_id: `quote-${name}`,
		_creationTime: 1,
		siteUrl: "example.test",
		quoteNumber: `QT-${name}`,
		clientId: `client-${name}`,
		clientName: `Client ${name}`,
		status: "accepted",
		acceptedAt: 1,
		packages: [{ name: `Package ${name}`, price: 10000 }],
	})),
}));

vi.mock("convex-svelte", () => ({
	useQuery: (ref: string) => ({
		data: ref === "quotes" ? mocks.quotes : ref === "quoteNumber" ? "QT-003" : ref === "invoiceNumber" ? "INV-001" : [],
		isLoading: false,
	}),
}));
vi.mock("../src/lib/adminClient", () => ({
	useAdminClient: () => ({ mutation: mocks.mutation }),
}));
vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({
		siteUrl: "example.test",
		api: {
			quotes: { list: "quotes", getNextNumber: "quoteNumber", listPresets: "presets", convertToInvoice: "convert" },
			crm: { listClients: "clients" },
			invoices: { getNextNumber: "invoiceNumber" },
			emailTemplates: { list: "templates" },
		},
	}),
}));
vi.mock("../src/lib/toast", () => ({ addToast: mocks.toast }));
vi.mock("../src/lib/logger", () => ({ logger: { error: mocks.logError } }));

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}

let component: ReturnType<typeof mount> | undefined;

beforeEach(() => {
	mocks.mutation.mockReset();
	mocks.toast.mockReset();
	mocks.logError.mockReset();
	sessionStorage.clear();
	vi.stubGlobal("fetch", vi.fn(async () => Response.json({ recovery: null })));
});

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});

async function render() {
	component = mount(QuotesPage, {
		target: document.body,
		props: { data: { adminSession: { status: "authorized", email: "artist@example.test", tier: "full", isCreator: true } } },
	});
	await tick();
}

async function openQuote(name: "A" | "B") {
	const row = Array.from(document.querySelectorAll<HTMLElement>(".q-row"))
		.find((entry) => entry.textContent?.includes(`QT-${name}`));
	if (!row) throw new Error(`Missing quote ${name}`);
	row.click();
	await tick();
	expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe(`QT-${name}`);
}

async function closeQuote() {
	document.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!.click();
	await tick();
}

function button(text: string) {
	const found = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
		.find((entry) => entry.textContent?.trim() === text);
	if (!found) throw new Error(`Missing button: ${text}`);
	return found;
}

async function startConversion() {
	button("convert to invoice").click();
	await tick();
	button("create invoice").click();
	await tick();
	expect(button("creating...").disabled).toBe(true);
}

async function settle(pending: ReturnType<typeof deferred<string>>, outcome: "success" | "failure") {
	if (outcome === "success") pending.resolve("invoice-old");
	else pending.reject(new Error("Conversion failed"));
	await tick();
	await tick();
}

describe("quote conversion selection", () => {
	it("shows a successful conversion for the initiating open quote", async () => {
		const pending = deferred<string>();
		mocks.mutation.mockReturnValueOnce(pending.promise);
		await render();
		await openQuote("A");
		await startConversion();
		expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith("convert", {
			quoteId: "quote-A", siteUrl: "example.test", invoiceType: "one-time", dueDate: undefined, notes: undefined,
		});
		await settle(pending, "success");
		expect(document.querySelector(".convert-status")?.textContent).toContain("invoice created");
		expect(document.querySelector(".convert-form")).toBeNull();
		expect(mocks.toast).not.toHaveBeenCalled();
	});

	it("reports an active conversion failure and allows a retry", async () => {
		const pending = deferred<string>();
		mocks.mutation.mockReturnValueOnce(pending.promise);
		await render();
		await openQuote("A");
		await startConversion();
		await settle(pending, "failure");
		expect(mocks.toast).toHaveBeenCalledExactlyOnceWith("Failed to convert to invoice.");
		expect(document.querySelector(".convert-status")).toBeNull();
		expect(button("convert to invoice").disabled).toBe(false);
	});

	it.each(["success", "failure"] as const)("does not reopen a closed quote after conversion %s", async (outcome) => {
		const pending = deferred<string>();
		mocks.mutation.mockReturnValueOnce(pending.promise);
		await render();
		await openQuote("A");
		await startConversion();
		await closeQuote();
		await settle(pending, outcome);
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(mocks.toast).not.toHaveBeenCalled();
		expect(mocks.mutation).toHaveBeenCalledTimes(1);
	});

	it.each([
		{ next: "B" as const, close: false, outcome: "success" as const },
		{ next: "B" as const, close: false, outcome: "failure" as const },
		{ next: "A" as const, close: true, outcome: "success" as const },
		{ next: "A" as const, close: true, outcome: "failure" as const },
	])("keeps $next's new conversion pending after older $outcome (close: $close)", async ({ next, close, outcome }) => {
		const older = deferred<string>();
		const current = deferred<string>();
		mocks.mutation.mockReturnValueOnce(older.promise).mockReturnValueOnce(current.promise);
		await render();
		await openQuote("A");
		await startConversion();
		if (close) await closeQuote();
		await openQuote(next);
		await startConversion();
		expect(mocks.mutation.mock.calls.map(([, args]) => args.quoteId)).toEqual(["quote-A", `quote-${next}`]);
		await settle(older, outcome);
		expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe(`QT-${next}`);
		expect(document.querySelector(".convert-status")).toBeNull();
		expect(button("creating...").disabled).toBe(true);
		expect(mocks.toast).not.toHaveBeenCalled();
		current.resolve("invoice-current");
		await tick();
		await tick();
		expect(document.querySelector(".convert-status")?.textContent).toContain("invoice created");
	});
});
