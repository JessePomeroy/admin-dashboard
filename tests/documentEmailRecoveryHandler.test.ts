import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQuery = vi.fn();
const mockMutation = vi.fn();

vi.mock("convex/browser", () => ({
	ConvexHttpClient: class {
		query = mockQuery;
		mutation = mockMutation;
		setAuth = vi.fn();
	},
}));

import { setServerConfig } from "../src/lib/config";
import {
	createDocumentEmailRecoveryGetHandler,
	createDocumentEmailRecoveryResolveHandler,
	createOpenDocumentEmailRecoveryGetHandler,
} from "../src/lib/server/handlers/documentEmailRecovery";

const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT = { type: "invoice" as const, id: "invoice-1" };
const refs = {
	getRecovery: "documentEmailAttempts.getRecovery",
	getOpenRecoveryByDocument:
		"documentEmailAttempts.getOpenRecoveryByDocument",
	resolve: "documentEmailAttempts.resolve",
};

function recovery(overrides: Record<string, unknown> = {}) {
	return {
		protocolVersion: 1,
		attemptId: ATTEMPT_ID,
		document: DOCUMENT,
		status: "uncertain",
		recipient: "client@example.com",
		subject: "Invoice INV-1",
		failure: "provider response was ambiguous",
		claimCount: 8,
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_000_100,
		retryUntil: 1_700_082_800_000,
		resolveNotAcceptedAt: 1_700_082_800_000,
		portalExpired: false,
		canRetry: false,
		canFinalizeAcceptance: false,
		canRecordAcceptance: true,
		canResolveNotAccepted: true,
		...overrides,
	};
}

function configure(verifyAdmin = vi.fn(async () => true)) {
	setServerConfig({
		api: {
			documentEmailAttempts: {
				get: "documentEmailAttempts.get",
				getRecovery: refs.getRecovery,
				getOpenRecoveryByDocument: refs.getOpenRecoveryByDocument,
				prepare: "documentEmailAttempts.prepare",
				claim: "documentEmailAttempts.claim",
				complete: "documentEmailAttempts.complete",
				fail: "documentEmailAttempts.fail",
				resolve: refs.resolve,
			},
		},
		siteUrl: "example.com",
		convexUrl: "https://convex.example.com",
		verifyAdmin,
		// biome-ignore lint/suspicious/noExplicitAny: focused server adapter config
	} as any);
}

function getEvent(document = DOCUMENT) {
	const query = new URLSearchParams({
		documentType: document.type,
		documentId: document.id,
	});
	return {
		params: { attemptId: ATTEMPT_ID },
		request: new Request(
			`http://localhost/api/admin/document-email-attempts/${ATTEMPT_ID}?${query}`,
		),
	};
}

function postEvent(body: unknown) {
	return {
		params: { attemptId: ATTEMPT_ID },
		request: new Request(
			`http://localhost/api/admin/document-email-attempts/${ATTEMPT_ID}/resolve`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			},
		),
	};
}

function openEvent(document = DOCUMENT) {
	const query = new URLSearchParams({
		documentType: document.type,
		documentId: document.id,
	});
	return {
		request: new Request(
			`http://localhost/api/admin/document-email-attempts/open?${query}`,
		),
	};
}

function expectPrivateNoStore(response: Response) {
	expect(response.headers.get("Cache-Control")).toBe("private, no-store");
}

describe("document email recovery handlers", () => {
	beforeEach(() => {
		mockQuery.mockReset();
		mockMutation.mockReset();
		configure();
	});

	it("requires host authorization before reading a tenant recovery", async () => {
		configure(vi.fn(async () => false));

		const response = await createDocumentEmailRecoveryGetHandler()(getEvent());

		expect(response.status).toBe(401);
		expectPrivateNoStore(response);
		expect(mockQuery).not.toHaveBeenCalled();
	});

	it("returns only the browser-safe tenant projection", async () => {
		mockQuery.mockResolvedValue({
			...recovery(),
			siteUrl: "example.com",
			envelope: { html: "secret", text: "secret" },
			providerIdempotencyKey: "secret-provider-key",
			portalUrl: "https://example.com/portal/secret",
			claimId: "secret-claim",
		});

		const response = await createDocumentEmailRecoveryGetHandler()(getEvent());
		const body = await response.json();

		expect(response.status).toBe(200);
		expectPrivateNoStore(response);
		expect(mockQuery).toHaveBeenCalledWith(refs.getRecovery, {
			siteUrl: "example.com",
			attemptId: ATTEMPT_ID,
		});
		expect(body).toEqual({ recovery: recovery() });
		expect(JSON.stringify(body)).not.toContain("secret");
	});

	it("discovers the canonical open attempt by exact tenant document", async () => {
		mockQuery.mockResolvedValue(recovery());

		const response = await createOpenDocumentEmailRecoveryGetHandler()(
			openEvent(),
		);

		expect(response.status).toBe(200);
		expectPrivateNoStore(response);
		expect(mockQuery).toHaveBeenCalledWith(
			refs.getOpenRecoveryByDocument,
			{
				siteUrl: "example.com",
				document: DOCUMENT,
			},
		);
		expect(await response.json()).toEqual({ recovery: recovery() });
	});

	it("returns an uncached null when an exact document has no open attempt", async () => {
		mockQuery.mockResolvedValue(null);

		const response = await createOpenDocumentEmailRecoveryGetHandler()(
			openEvent(),
		);

		expect(response.status).toBe(200);
		expectPrivateNoStore(response);
		expect(await response.json()).toEqual({ recovery: null });
	});

	it("conceals an expected-document mismatch as not found", async () => {
		mockQuery.mockResolvedValue(
			recovery({ document: { type: "quote", id: "quote-1" } }),
		);

		const response = await createDocumentEmailRecoveryGetHandler()(getEvent());

		expect(response.status).toBe(404);
		expectPrivateNoStore(response);
	});

	it("injects tenant scope and forwards one accepted resolution", async () => {
		const sent = recovery({
			status: "sent",
			providerMessageId: "email_accepted",
			canRecordAcceptance: false,
			canResolveNotAccepted: false,
		});
		mockMutation.mockResolvedValue({ outcome: "sent", recovery: sent });

		const response = await createDocumentEmailRecoveryResolveHandler()(
			postEvent({
				expectedDocument: DOCUMENT,
				resolution: {
					kind: "accepted",
					providerMessageId: "email_accepted",
				},
			}),
		);

		expect(mockMutation).toHaveBeenCalledWith(refs.resolve, {
			siteUrl: "example.com",
			attemptId: ATTEMPT_ID,
			expectedDocument: DOCUMENT,
			resolution: {
				kind: "accepted",
				providerMessageId: "email_accepted",
			},
		});
		expectPrivateNoStore(response);
		expect(await response.json()).toEqual({ outcome: "sent", recovery: sent });
	});

	it("requires exact high-friction confirmation and UTF-8-bounded evidence", async () => {
		const handler = createDocumentEmailRecoveryResolveHandler();
		for (const resolution of [
			{ kind: "accepted", providerMessageId: "界".repeat(171) },
			{ kind: "not_accepted", confirmation: "not accepted", note: "checked" },
			{ kind: "not_accepted", confirmation: "NOT ACCEPTED", note: "" },
			{
				kind: "not_accepted",
				confirmation: "NOT ACCEPTED",
				note: "界".repeat(683),
			},
		]) {
			const response = await handler(
				postEvent({ expectedDocument: DOCUMENT, resolution }),
			);
			expect(response.status).toBe(400);
			expectPrivateNoStore(response);
		}
		expect(mockMutation).not.toHaveBeenCalled();
	});

	it.each([
		["DOCUMENT_EMAIL_NOT_FOUND", 404],
		["DOCUMENT_EMAIL_DOCUMENT_MISMATCH", 404],
		["DOCUMENT_EMAIL_INVALID_RESOLUTION", 400],
		["DOCUMENT_EMAIL_TERMINAL", 409],
		["DOCUMENT_EMAIL_RESOLUTION_CONFLICT", 409],
		["DOCUMENT_EMAIL_NOT_ELIGIBLE", 409],
		["DOCUMENT_EMAIL_LIVE_CLAIM", 409],
		["DOCUMENT_EMAIL_PROVIDER_EVIDENCE_REQUIRED", 409],
		["DOCUMENT_EMAIL_PROVIDER_EVIDENCE_CONFLICT", 409],
	] as const)("maps stable backend code %s to %i", async (code, status) => {
		mockMutation.mockRejectedValue({ data: { code, message: "safe" } });

		const response = await createDocumentEmailRecoveryResolveHandler()(
			postEvent({
				expectedDocument: DOCUMENT,
				resolution: { kind: "accepted", providerMessageId: "email_1" },
			}),
		);

		expect(response.status).toBe(status);
		expectPrivateNoStore(response);
	});

	it("returns an uncached generic 500 for an unexpected backend failure", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		mockMutation.mockRejectedValue(new Error("sensitive backend detail"));

		const response = await createDocumentEmailRecoveryResolveHandler()(
			postEvent({
				expectedDocument: DOCUMENT,
				resolution: { kind: "accepted", providerMessageId: "email_1" },
			}),
		);

		expect(response.status).toBe(500);
		expectPrivateNoStore(response);
		expect(await response.json()).toEqual({
			message: "Failed to resolve document email delivery",
		});
	});
});
