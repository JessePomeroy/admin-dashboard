import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createDocumentEmailRequestTracker,
	DocumentEmailRequestError,
	getDocumentEmailRecovery,
	postDocumentEmail,
	presentableDocumentEmailRecoveryFromError,
	resolveDocumentEmailRecovery,
	statusAfterSuccessfulDocumentEmail,
} from "../src/lib/pages/documentEmailRequest";

const ATTEMPT_ONE = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_TWO = "22222222-2222-4222-8222-222222222222";

function recovery(attemptId = ATTEMPT_TWO) {
	return {
		protocolVersion: 1,
		attemptId,
		document: { type: "invoice", id: "invoice-1" },
		status: "uncertain",
		recipient: "client@example.com",
		subject: "Invoice INV-1",
		claimCount: 2,
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

function requestBodies(fetchMock: ReturnType<typeof vi.fn>) {
	return fetchMock.mock.calls.map(([, init]) =>
		JSON.parse(String((init as RequestInit).body)),
	);
}

function memoryStorage(): Storage {
	const values = new Map<string, string>();
	return {
		get length() {
			return values.size;
		},
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		key: (index) => Array.from(values.keys())[index] ?? null,
		removeItem: (key) => values.delete(key),
		setItem: (key, value) => values.set(key, value),
	};
}

function pageSource(name: "InvoicingPage" | "QuotesPage" | "ContractsPage") {
	return readFileSync(
		fileURLToPath(new URL(`../src/lib/pages/${name}.svelte`, import.meta.url)),
		"utf8",
	);
}

afterEach(() => {
	globalThis.sessionStorage?.clear();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("document email request boundary", () => {
	it("generates one attempt ID and reuses it across response and network retries", async () => {
		const randomUUID = vi
			.spyOn(globalThis.crypto, "randomUUID")
			.mockReturnValue(ATTEMPT_ONE);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("warming up", { status: 500 }))
			.mockRejectedValueOnce(new Error("connection reset"))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		await postDocumentEmail(
			"/api/admin/invoicing/invoice-1/send",
			{ templateId: "template-1", attemptId: "caller-value-is-ignored" },
			{ retries: 2, retryDelayMs: 0 },
		);

		expect(randomUUID).toHaveBeenCalledTimes(1);
		expect(requestBodies(fetchMock)).toEqual([
			{ templateId: "template-1", attemptId: ATTEMPT_ONE },
			{ templateId: "template-1", attemptId: ATTEMPT_ONE },
			{ templateId: "template-1", attemptId: ATTEMPT_ONE },
		]);
	});

	it("generates a fresh attempt ID for each separate user action", async () => {
		const randomUUID = vi
			.spyOn(globalThis.crypto, "randomUUID")
			.mockReturnValueOnce(ATTEMPT_ONE)
			.mockReturnValueOnce(ATTEMPT_TWO);
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		await postDocumentEmail("/api/admin/quotes/quote-1/send", {});
		await postDocumentEmail("/api/admin/quotes/quote-1/send", {});

		expect(randomUUID).toHaveBeenCalledTimes(2);
		expect(requestBodies(fetchMock).map((body) => body.attemptId)).toEqual([
			ATTEMPT_ONE,
			ATTEMPT_TWO,
		]);
	});

	it("rejects a non-ok response instead of concealing save-and-send failure", async () => {
		vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(ATTEMPT_ONE);
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response("delivery rejected", { status: 400 }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			postDocumentEmail(
				"/api/admin/contracts/contract-1/send",
				{},
				{ retries: 2, retryDelayMs: 0 },
			),
		).rejects.toMatchObject({
			kind: "rejected",
			status: 400,
			attemptId: ATTEMPT_ONE,
			message: "Email request failed (400)",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("treats an unreadable conflict response as ambiguous", async () => {
		vi.stubGlobal("sessionStorage", memoryStorage());
		vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(ATTEMPT_ONE);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("upstream conflict", { status: 409 })),
		);
		const tracker = createDocumentEmailRequestTracker();

		await expect(
			tracker.post("invoice:invoice-1", "/send", { templateId: "frozen" }),
		).rejects.toMatchObject({
			kind: "uncertain",
			attemptId: ATTEMPT_ONE,
		});
		expect(tracker.pending("invoice:invoice-1", "/send")).toMatchObject({
			attemptId: ATTEMPT_ONE,
			body: { templateId: "frozen" },
		});
	});

	it("replays the original endpoint and body after an ambiguous pre-server failure", async () => {
		vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(ATTEMPT_ONE);
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("connection reset"))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const tracker = createDocumentEmailRequestTracker();

		await expect(
			tracker.post(
				"invoice:1",
				"/api/admin/invoicing/invoice-1/send",
				{ templateId: "original", changeNote: "payment reminder" },
			),
		).rejects.toMatchObject({ kind: "uncertain", attemptId: ATTEMPT_ONE });
		await tracker.post(
			"invoice:1",
			"/api/admin/invoicing/invoice-1/send",
			{ templateId: "changed", changeNote: "different" },
		);

		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"/api/admin/invoicing/invoice-1/send",
			"/api/admin/invoicing/invoice-1/send",
		]);
		expect(requestBodies(fetchMock)).toEqual([
			{
				templateId: "original",
				changeNote: "payment reminder",
				attemptId: ATTEMPT_ONE,
			},
			{
				templateId: "original",
				changeNote: "payment reminder",
				attemptId: ATTEMPT_ONE,
			},
		]);
	});

	it("coalesces concurrent calls for the same document action", async () => {
		vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(ATTEMPT_ONE);
		let release: (() => void) | undefined;
		const responseGate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const fetchMock = vi.fn(async () => {
			await responseGate;
			return new Response(null, { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);
		const tracker = createDocumentEmailRequestTracker();

		const first = tracker.post("invoice:1", "/first", { templateId: "original" });
		const second = tracker.post("invoice:1", "/changed", { templateId: "changed" });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		release?.();

		await expect(Promise.all([first, second])).resolves.toEqual([
			{ attemptId: ATTEMPT_ONE },
			{ attemptId: ATTEMPT_ONE },
		]);
		expect(requestBodies(fetchMock)).toEqual([
			{ templateId: "original", attemptId: ATTEMPT_ONE },
		]);
	});

	it("recovers the exact ambiguous action after a page-level tracker reload", async () => {
		vi.stubGlobal("sessionStorage", memoryStorage());
		const randomUUID = vi
			.spyOn(globalThis.crypto, "randomUUID")
			.mockReturnValue(ATTEMPT_ONE);
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("connection reset"))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createDocumentEmailRequestTracker().post("quote:1", "/original", {
				templateId: "original",
				changeNote: "first",
			}),
		).rejects.toMatchObject({ kind: "uncertain", attemptId: ATTEMPT_ONE });

		await createDocumentEmailRequestTracker().post("quote:1", "/original", {
			templateId: "changed",
			changeNote: "second",
		});

		expect(randomUUID).toHaveBeenCalledTimes(1);
		expect(requestBodies(fetchMock)).toEqual([
			{
				templateId: "original",
				changeNote: "first",
				attemptId: ATTEMPT_ONE,
			},
			{
				templateId: "original",
				changeNote: "first",
				attemptId: ATTEMPT_ONE,
			},
		]);
	});

	it("adopts a server-selected canonical attempt across tabs and reloads", async () => {
		vi.stubGlobal("sessionStorage", memoryStorage());
		const randomUUID = vi
			.spyOn(globalThis.crypto, "randomUUID")
			.mockReturnValue(ATTEMPT_ONE);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						error: "uncertain",
						message: "Use the existing delivery attempt.",
						attemptId: ATTEMPT_TWO,
						recovery: recovery(),
					}),
					{
						status: 503,
						headers: { "Content-Type": "application/json" },
					},
				),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ success: true, attemptId: ATTEMPT_TWO }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createDocumentEmailRequestTracker().post("invoice:invoice-1", "/send", {
				templateId: "original",
			}),
		).rejects.toMatchObject({
			kind: "uncertain",
			attemptId: ATTEMPT_TWO,
			recovery: { attemptId: ATTEMPT_TWO },
		});
		await createDocumentEmailRequestTracker().post(
			"invoice:invoice-1",
			"/send",
			{ templateId: "changed" },
		);

		expect(randomUUID).toHaveBeenCalledTimes(1);
		expect(requestBodies(fetchMock)).toEqual([
			{ templateId: "original", attemptId: ATTEMPT_ONE },
			{ templateId: "original", attemptId: ATTEMPT_TWO },
		]);
	});

	it("clears a terminal tracker only when the exact attempt ID matches", async () => {
		vi.stubGlobal("sessionStorage", memoryStorage());
		vi.spyOn(globalThis.crypto, "randomUUID")
			.mockReturnValueOnce(ATTEMPT_ONE)
			.mockReturnValueOnce(ATTEMPT_TWO);
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("connection reset"))
			.mockRejectedValueOnce(new Error("still unknown"))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const tracker = createDocumentEmailRequestTracker();

		await expect(tracker.post("contract:1", "/send", { version: 1 })).rejects.toBeTruthy();
		expect(tracker.clearResolved("contract:1", ATTEMPT_TWO)).toBe(false);
		await expect(tracker.post("contract:1", "/send", { version: 2 })).rejects.toBeTruthy();
		expect(tracker.clearResolved("contract:1", ATTEMPT_ONE)).toBe(true);
		await tracker.post("contract:1", "/send", { version: 3 });

		expect(requestBodies(fetchMock)).toEqual([
			{ version: 1, attemptId: ATTEMPT_ONE },
			{ version: 1, attemptId: ATTEMPT_ONE },
			{ version: 3, attemptId: ATTEMPT_TWO },
		]);
	});

	it("classifies a bounded send timeout as ambiguous and keeps its attempt ID", async () => {
		const controller = new AbortController();
		controller.abort(new DOMException("deadline", "TimeoutError"));
		const createTimeoutSignal = vi.fn(() => controller.signal);
		const fetchImpl = vi.fn().mockRejectedValue(
			new DOMException("deadline", "TimeoutError"),
		);

		await expect(
			postDocumentEmail(
				"/send",
				{},
				{
					attemptId: ATTEMPT_ONE,
					fetchImpl,
					createTimeoutSignal,
					requestTimeoutMs: 1_234,
				},
			),
		).rejects.toMatchObject({
			kind: "uncertain",
			attemptId: ATTEMPT_ONE,
			message: "The email request timed out before delivery could be confirmed",
		});
		expect(createTimeoutSignal).toHaveBeenCalledWith(1_234);
		expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
	});

	it("makes a timed-out recovery read explicitly safe to retry", async () => {
		const controller = new AbortController();
		controller.abort(new DOMException("deadline", "TimeoutError"));
		const fetchImpl = vi.fn().mockRejectedValue(
			new DOMException("deadline", "TimeoutError"),
		);

		await expect(
			getDocumentEmailRecovery(ATTEMPT_ONE, {
				type: "invoice",
				id: "invoice-1",
			}, {
				fetchImpl,
				createTimeoutSignal: () => controller.signal,
			}),
		).rejects.toThrow("The recovery check timed out. It is safe to try again");
	});

	it("makes a timed-out recovery resolution safe to check and retry", async () => {
		const controller = new AbortController();
		controller.abort(new DOMException("deadline", "TimeoutError"));
		const fetchImpl = vi.fn().mockRejectedValue(
			new DOMException("deadline", "TimeoutError"),
		);

		await expect(
			resolveDocumentEmailRecovery(
				ATTEMPT_ONE,
				{ type: "invoice", id: "invoice-1" },
				{ kind: "accepted", providerMessageId: "email_1" },
				{
					fetchImpl,
					createTimeoutSignal: () => controller.signal,
				},
			),
		).rejects.toThrow(
			"The recovery update timed out. Its status is safe to check again",
		);
	});

	it("surfaces a definite provider rejection as a truthful terminal recovery", () => {
		const failed = recovery(ATTEMPT_ONE);
		failed.status = "failed";
		failed.canRetry = false;
		failed.canRecordAcceptance = false;
		const error = new DocumentEmailRequestError({
			kind: "failed",
			status: 409,
			attemptId: ATTEMPT_ONE,
			message: "provider rejected",
			recovery: failed,
		});

		expect(presentableDocumentEmailRecoveryFromError(error)).toEqual({
			attemptId: ATTEMPT_ONE,
			recovery: failed,
		});
	});

	it("exposes the session attempt first, then adopts backend canonical discovery", async () => {
		vi.stubGlobal("sessionStorage", memoryStorage());
		vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(ATTEMPT_ONE);
		const tracker = createDocumentEmailRequestTracker();
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection reset")));
		await expect(
			tracker.post("invoice:invoice-1", "/send", { templateId: "frozen" }),
		).rejects.toMatchObject({ attemptId: ATTEMPT_ONE });

		expect(tracker.pending("invoice:invoice-1", "/send")).toEqual({
			attemptId: ATTEMPT_ONE,
			endpoint: "/send",
			body: { templateId: "frozen" },
		});

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ recovery: recovery(ATTEMPT_TWO) }), {
					headers: { "Content-Type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ recovery: recovery(ATTEMPT_ONE) }), {
					headers: { "Content-Type": "application/json" },
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			tracker.hydrate("invoice:invoice-1", "/send", {
				type: "invoice",
				id: "invoice-1",
			}),
		).resolves.toMatchObject({
			attemptId: ATTEMPT_TWO,
			recovery: { attemptId: ATTEMPT_TWO },
		});
		expect(tracker.pending("invoice:invoice-1", "/send")).toEqual({
			attemptId: ATTEMPT_TWO,
			endpoint: "/send",
			body: { templateId: "frozen" },
		});
	});

	it("hydrates a canonical backend attempt when browser storage is absent", async () => {
		vi.stubGlobal("sessionStorage", memoryStorage());
		const tracker = createDocumentEmailRequestTracker();
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ recovery: recovery(ATTEMPT_TWO) }), {
					headers: { "Content-Type": "application/json" },
				}),
			),
		);

		await expect(
			tracker.hydrate("invoice:invoice-1", "/send", {
				type: "invoice",
				id: "invoice-1",
			}),
		).resolves.toMatchObject({ attemptId: ATTEMPT_TWO });
		expect(tracker.pending("invoice:invoice-1", "/send")).toEqual({
			attemptId: ATTEMPT_TWO,
			endpoint: "/send",
			body: {},
		});
	});

	it("does not let stale discovery erase an ambiguous send started during hydration", async () => {
		vi.stubGlobal("sessionStorage", memoryStorage());
		vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(ATTEMPT_ONE);
		let finishDiscovery: ((response: Response) => void) | undefined;
		const discoveryResponse = new Promise<Response>((resolve) => {
			finishDiscovery = resolve;
		});
		const discoveryFetch = vi.fn(() => discoveryResponse);
		const tracker = createDocumentEmailRequestTracker();

		const hydration = tracker.hydrate(
			"invoice:invoice-1",
			"/send",
			{ type: "invoice", id: "invoice-1" },
			{ fetchImpl: discoveryFetch },
		);
		await vi.waitFor(() => expect(discoveryFetch).toHaveBeenCalledTimes(1));

		await expect(
			tracker.post(
				"invoice:invoice-1",
				"/send",
				{ templateId: "started-during-discovery" },
				{ fetchImpl: vi.fn().mockRejectedValue(new Error("connection reset")) },
			),
		).rejects.toMatchObject({
			kind: "uncertain",
			attemptId: ATTEMPT_ONE,
		});

		finishDiscovery?.(
			new Response(JSON.stringify({ recovery: null }), {
				headers: { "Content-Type": "application/json" },
			}),
		);
		await expect(hydration).resolves.toEqual({ attemptId: ATTEMPT_ONE });
		expect(tracker.pending("invoice:invoice-1", "/send")).toMatchObject({
			attemptId: ATTEMPT_ONE,
			body: { templateId: "started-during-discovery" },
		});
	});

	it.each(["sent", "failed", "resolved_not_sent"] as const)(
		"clears the exact session tracker after hydrating terminal %s",
		async (status) => {
			vi.stubGlobal("sessionStorage", memoryStorage());
			vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(ATTEMPT_ONE);
			const tracker = createDocumentEmailRequestTracker();
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection reset")));
			await expect(
				tracker.post("invoice:invoice-1", "/send", { templateId: "frozen" }),
			).rejects.toBeTruthy();

			const terminal = recovery(ATTEMPT_ONE);
			terminal.status = status;
			terminal.canRetry = false;
			terminal.canRecordAcceptance = false;
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ recovery: null }), {
						headers: { "Content-Type": "application/json" },
					}),
				)
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ recovery: terminal }), {
						headers: { "Content-Type": "application/json" },
					}),
				);
			vi.stubGlobal("fetch", fetchMock);

			await expect(
				tracker.hydrate("invoice:invoice-1", "/send", {
					type: "invoice",
					id: "invoice-1",
				}),
			).resolves.toMatchObject({ recovery: { status } });
			expect(tracker.pending("invoice:invoice-1", "/send")).toBeUndefined();
		},
	);
});

describe("document lifecycle presentation after email delivery", () => {
	it.each([
		["draft", "sent"],
		["sent", "sent"],
		["paid", "paid"],
		["overdue", "overdue"],
		["canceled", "canceled"],
		["accepted", "accepted"],
		["declined", "declined"],
		["expired", "expired"],
		["signed", "signed"],
	] as const)("keeps %s as %s", (current, expected) => {
		expect(statusAfterSuccessfulDocumentEmail(current)).toBe(expected);
	});

	it("routes all three page-level email actions through the guarded boundary", () => {
		for (const name of [
			"InvoicingPage",
			"QuotesPage",
			"ContractsPage",
		] as const) {
			const source = pageSource(name);
			expect(source).toContain("createDocumentEmailRequestTracker(");
			expect(source).toContain("emailRequests.post(");
			expect(source).toContain("statusAfterSuccessfulDocumentEmail(");
			expect(source).not.toMatch(
				/fetch\(`\/api\/admin\/(?:invoicing|quotes|contracts)\//,
			);
		}
	});

	it("does not mark a contract sent a second time after the server completes delivery", () => {
		const source = pageSource("ContractsPage");
		const sendHandler = source.match(
			/async function handleSendEmail[\s\S]*?\n}\n\nasync function handleDeleteContract/,
		)?.[0];

		expect(sendHandler).toBeDefined();
		expect(sendHandler).not.toContain("api.contracts.markSent");
	});

	it("surfaces a rejected contract save-and-send action in the create modal", () => {
		const source = readFileSync(
			fileURLToPath(
				new URL(
					"../src/lib/pages/contracts/ContractCreateModal.svelte",
					import.meta.url,
				),
			),
			"utf8",
		);

		expect(source).toContain('addToast("Failed to send contract.")');
	});
});
