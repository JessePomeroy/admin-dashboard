import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQuery = vi.fn();
const mockMutation = vi.fn();

vi.mock("convex/browser", () => {
	class MockConvexHttpClient {
		query = mockQuery;
		mutation = mockMutation;
	}
	return { ConvexHttpClient: MockConvexHttpClient };
});

vi.mock("../src/lib/server/email", async () => {
	const actual = await vi.importActual<
		typeof import("../src/lib/server/email")
	>("../src/lib/server/email");
	return {
		...actual,
		sendEmail: vi
			.fn()
			.mockResolvedValue({ data: { id: "msg_123" }, error: null }),
	};
});

import { type AdminServerConfig, setServerConfig } from "../src/lib/config";
import { sendEmail } from "../src/lib/server/email";
import { createEmailSendHandler } from "../src/lib/server/handlers/createEmailSendHandler";
import { createQuoteSendHandler } from "../src/lib/server/handlers/sendQuote";
import type { EmailCategory } from "../src/lib/types";

const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";
const CANONICAL_ATTEMPT_ID = "33333333-3333-4333-8333-333333333333";
const DOCUMENT_ID = "doc-1";
const refs = {
	getAttempt: "documentEmailAttempts.get",
	getRecovery: "documentEmailAttempts.getRecovery",
	getOpenRecoveryByDocument:
		"documentEmailAttempts.getOpenRecoveryByDocument",
	prepareAttempt: "documentEmailAttempts.prepare",
	claimAttempt: "documentEmailAttempts.claim",
	completeAttempt: "documentEmailAttempts.complete",
	failAttempt: "documentEmailAttempts.fail",
	getTemplate: "emailTemplates.get",
	getTemplateByCategory: "emailTemplates.getByCategory",
};

interface TestAttempt {
	protocolVersion: 1;
	siteUrl: string;
	attemptId: string;
	document: { type: "invoice" | "quote" | "contract"; id: string };
	portalUrl: string;
	envelope: {
		from: string;
		to: string;
		subject: string;
		text: string;
		html: string;
	};
	providerIdempotencyKey: string;
	providerTags: Array<{ name: string; value: string }>;
	open: boolean;
	documentKey: string;
	status:
		| "prepared"
		| "claimed"
		| "sent"
		| "failed"
		| "uncertain"
		| "resolved_not_sent";
	claimId?: string;
	providerMessageId?: string;
}

let storedAttempt: TestAttempt | null;
let templateQuery: (ref: string, args: Record<string, unknown>) => unknown;

function attemptFromPrepare(args: Record<string, unknown>): TestAttempt {
	const envelope = args.envelope as TestAttempt["envelope"];
	const document = args.document as TestAttempt["document"];
	return {
		protocolVersion: 1,
		siteUrl: String(args.siteUrl),
		attemptId: String(args.attemptId),
		document,
		portalUrl: `${String(args.portalOrigin)}/portal/${String(args.portalToken)}`,
		envelope,
		providerIdempotencyKey: `document-email-v1/${document.type}/${document.id}/${String(args.attemptId)}`,
		providerTags: [
			{ name: "document_attempt", value: String(args.attemptId) },
		],
		open: true,
		documentKey: `${document.type}:${document.id}`,
		status: "prepared",
	};
}

function existingAttempt(
	status: TestAttempt["status"],
	overrides: Partial<TestAttempt> = {},
): TestAttempt {
	return {
		protocolVersion: 1,
		siteUrl: "example.com",
		attemptId: ATTEMPT_ID,
		document: { type: "invoice", id: DOCUMENT_ID },
		portalUrl: "https://example.com/portal/frozen-token",
		envelope: {
			from: "Example <mail@example.com>",
			to: "frozen@example.com",
			subject: "frozen subject",
			text: "frozen text\n\nhttps://example.com/portal/frozen-token",
			html: "<p>frozen html https://example.com/portal/frozen-token</p>",
		},
		providerIdempotencyKey: `document-email-v1/invoice/${DOCUMENT_ID}/${ATTEMPT_ID}`,
		providerTags: [{ name: "document_attempt", value: ATTEMPT_ID }],
		open: status !== "sent" && status !== "failed" && status !== "resolved_not_sent",
		documentKey: `invoice:${DOCUMENT_ID}`,
		status,
		...overrides,
	};
}

function recoveryFromAttempt(attempt: TestAttempt) {
	return {
		protocolVersion: 1,
		attemptId: attempt.attemptId,
		document: attempt.document,
		status: attempt.status,
		recipient: attempt.envelope.to,
		subject: attempt.envelope.subject,
		...(attempt.providerMessageId
			? { providerMessageId: attempt.providerMessageId }
			: {}),
		claimCount: 1,
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_000_100,
		retryUntil: 1_700_082_800_000,
		resolveNotAcceptedAt: 1_700_082_800_000,
		portalExpired: false,
		canRetry: attempt.status === "uncertain",
		canFinalizeAcceptance:
			attempt.status === "uncertain" && Boolean(attempt.providerMessageId),
		canRecordAcceptance:
			attempt.status === "uncertain" && !attempt.providerMessageId,
		canResolveNotAccepted: false,
	};
}

function makeHandler(
	fallbackCategoriesForAction?: (
		changeNote: string,
	) => readonly EmailCategory[],
	overrides: Partial<Parameters<typeof createEmailSendHandler>[0]> = {},
) {
	return createEmailSendHandler({
		docType: "invoice",
		fetchDocument: vi.fn(async () => ({
			_id: DOCUMENT_ID,
			siteUrl: "example.com",
			clientId: "client-1",
			clientEmail: "client@example.com",
			invoiceNumber: "INV-1",
			status: "draft",
		})),
		getClientEmail: (doc) => doc.clientEmail as string | undefined,
		extractVars: (doc) => ({
			values: { invoiceNumber: String(doc.invoiceNumber) },
		}),
		buildDefaultMessage: (_doc, { portalUrl }) => ({
			html: `<p>default <a href="${portalUrl}">${portalUrl}</a></p>`,
			text: `default\n${portalUrl}`,
		}),
		defaultSubject: () => "default subject",
		fallbackCategoriesForAction,
		...overrides,
	});
}

function makeEvent(body: Record<string, unknown> = {}) {
	return {
		params: { id: DOCUMENT_ID },
		request: new Request(
			`http://localhost/api/admin/invoice/${DOCUMENT_ID}/send`,
			{
				method: "POST",
				body: JSON.stringify({ attemptId: ATTEMPT_ID, ...body }),
			},
		),
		// biome-ignore lint/suspicious/noExplicitAny: partial SvelteKit RequestEvent mock
	} as any;
}

function categoriesQueried(): string[] {
	return mockQuery.mock.calls
		.filter((call) => call[0] === refs.getTemplateByCategory)
		.map((call) => String(call[1].category));
}

function mutationCalls(ref: string): Record<string, unknown>[] {
	return mockMutation.mock.calls
		.filter((call) => call[0] === ref)
		.map((call) => call[1] as Record<string, unknown>);
}

function expectPrivateNoStore(response: Response) {
	expect(response.headers.get("Cache-Control")).toBe("private, no-store");
}

describe("createEmailSendHandler durable delivery", () => {
	beforeEach(() => {
		storedAttempt = null;
		templateQuery = () => null;
		mockQuery.mockReset();
		mockMutation.mockReset();
		vi.mocked(sendEmail).mockReset();
		vi.mocked(sendEmail).mockResolvedValue({
			data: { id: "msg_123" },
			error: null,
		});
		vi.spyOn(console, "error").mockImplementation(() => {});

		mockQuery.mockImplementation(
			(ref: string, args: Record<string, unknown>) => {
				if (ref === refs.getAttempt) return Promise.resolve(storedAttempt);
				if (ref === refs.getRecovery)
					return Promise.resolve(
						storedAttempt ? recoveryFromAttempt(storedAttempt) : null,
					);
				return Promise.resolve(templateQuery(ref, args));
			},
		);
		mockMutation.mockImplementation(
			(ref: string, args: Record<string, unknown>) => {
				if (ref === refs.prepareAttempt) {
					storedAttempt = attemptFromPrepare(args);
					return Promise.resolve({
						outcome: "prepared",
						attempt: storedAttempt,
					});
				}
				if (ref === refs.claimAttempt) {
					storedAttempt = {
						...(storedAttempt as TestAttempt),
						status: "claimed",
						claimId: String(args.claimId),
					};
					return Promise.resolve({
						outcome: "claimed",
						attempt: storedAttempt,
					});
				}
				if (ref === refs.completeAttempt) {
					storedAttempt = {
						...(storedAttempt as TestAttempt),
						status: "sent",
						providerMessageId: String(args.providerMessageId),
					};
					return Promise.resolve({ outcome: "sent", attempt: storedAttempt });
				}
				if (ref === refs.failAttempt) {
					storedAttempt = {
						...(storedAttempt as TestAttempt),
						status: args.disposition as "failed" | "uncertain",
						...(typeof args.providerMessageId === "string"
							? { providerMessageId: args.providerMessageId }
							: {}),
					};
					return Promise.resolve({
						outcome: args.disposition,
						attempt: storedAttempt,
					});
				}
				throw new Error(`unexpected mutation ${ref}`);
			},
		);

		setServerConfig({
			api: {
				documentEmailAttempts: {
					get: refs.getAttempt,
					getRecovery: refs.getRecovery,
					getOpenRecoveryByDocument: refs.getOpenRecoveryByDocument,
					prepare: refs.prepareAttempt,
					claim: refs.claimAttempt,
					complete: refs.completeAttempt,
					fail: refs.failAttempt,
					resolve: "documentEmailAttempts.resolve",
				},
				emailTemplates: {
					get: refs.getTemplate,
					getByCategory: refs.getTemplateByCategory,
				},
				quotes: { get: "quotes.get" },
				// biome-ignore lint/suspicious/noExplicitAny: partial AdminAPI mock
			} as any,
			siteUrl: "example.com",
			siteName: "Example",
			fromEmail: "Example <mail@example.com>",
			isCreator: true,
			convexUrl: "https://convex.example.com",
			resendApiKey: "re_test",
			verifyAdmin: vi.fn(async () => true),
		});
	});

	it("fails closed on missing authorization or journal configuration before provider work", async () => {
		setServerConfig({
			api: {},
			siteUrl: "example.com",
			siteName: "Example",
			fromEmail: "mail@example.com",
			isCreator: true,
			convexUrl: "https://convex.example.com",
			resendApiKey: "re_test",
			verifyAdmin: undefined,
		} as unknown as AdminServerConfig);
		await expect(makeHandler()(makeEvent())).rejects.toMatchObject({
			status: 500,
		});

		setServerConfig({
			api: {},
			siteUrl: "example.com",
			siteName: "Example",
			fromEmail: "mail@example.com",
			isCreator: true,
			convexUrl: "https://convex.example.com",
			resendApiKey: "re_test",
			verifyAdmin: vi.fn(async () => true),
		} as unknown as AdminServerConfig);
		await expect(makeHandler()(makeEvent())).rejects.toMatchObject({
			status: 500,
		});

		expect(mockQuery).not.toHaveBeenCalled();
		expect(mockMutation).not.toHaveBeenCalled();
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("requires a valid attempt UUID before any Convex or provider work", async () => {
		for (const attemptId of [undefined, "not-a-uuid"]) {
			await expect(
				makeHandler()(makeEvent({ attemptId })),
			).rejects.toMatchObject({ status: 400 });
		}
		expect(mockQuery).not.toHaveBeenCalled();
		expect(mockMutation).not.toHaveBeenCalled();
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("prepares, claims, sends, and atomically completes one frozen envelope", async () => {
		const response = await makeHandler()(makeEvent());
		expectPrivateNoStore(response);
		expect(await response.json()).toEqual({
			success: true,
			attemptId: ATTEMPT_ID,
		});

		const [prepared] = mutationCalls(refs.prepareAttempt);
		expect(prepared).toMatchObject({
			siteUrl: "example.com",
			attemptId: ATTEMPT_ID,
			document: { type: "invoice", id: DOCUMENT_ID },
			portalOrigin: "https://example.com",
			envelope: {
				from: "Example <mail@example.com>",
				to: "client@example.com",
				subject: "default subject",
				text: expect.stringContaining("https://example.com/portal/"),
				html: expect.stringContaining("https://example.com/portal/"),
			},
		});
		expect(prepared.portalToken).toMatch(/^[0-9a-f-]{36}$/i);
		expect(prepared).not.toHaveProperty("clientId");
		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(sendEmail).toHaveBeenCalledWith(
			{ ...storedAttempt?.envelope, tags: storedAttempt?.providerTags },
			{
			idempotencyKey: `document-email-v1/invoice/${DOCUMENT_ID}/${ATTEMPT_ID}`,
			},
		);
		expect(mutationCalls(refs.completeAttempt)).toEqual([
			expect.objectContaining({
				siteUrl: "example.com",
				attemptId: ATTEMPT_ID,
				providerMessageId: "msg_123",
			}),
		]);
	});

	it("returns deterministic prepare rejection as private no-store", async () => {
		mockMutation.mockImplementation((ref: string) => {
			if (ref === refs.prepareAttempt) {
				return Promise.resolve({
					outcome: "rejected",
					reason: "message_invalid",
				});
			}
			throw new Error(`unexpected mutation ${ref}`);
		});

		const response = await makeHandler()(makeEvent());

		expect(response.status).toBe(400);
		expectPrivateNoStore(response);
		expect(await response.json()).toMatchObject({
			success: false,
			error: "rejected",
			reason: "message_invalid",
			attemptId: ATTEMPT_ID,
		});
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("tries action-specific tenant templates in order and stops at the first match", async () => {
		templateQuery = (ref, args) =>
			ref === refs.getTemplateByCategory && args.category === "custom"
				? { siteUrl: "example.com", subject: "CUSTOM", body: "CUSTOM body" }
				: null;

		await makeHandler(() => ["booking-confirmation", "custom"])(makeEvent());
		expect(categoriesQueried()).toEqual(["booking-confirmation", "custom"]);
		expect(storedAttempt?.envelope.subject).toBe("CUSTOM");
		expect(storedAttempt?.envelope.html).toContain("CUSTOM body");
	});

	it("selects reminder fallback only for an explicit reminder action", async () => {
		templateQuery = (ref, args) =>
			ref === refs.getTemplateByCategory && args.category === "reminder"
				? { siteUrl: "example.com", subject: "reminder", body: "reminder body" }
				: null;
		const categories = (changeNote: string) =>
			changeNote === "payment reminder"
				? (["reminder"] as const)
				: [];

		await makeHandler(categories)(makeEvent({ changeNote: "payment reminder" }));
		expect(categoriesQueried()).toEqual(["reminder"]);

		storedAttempt = null;
		mockQuery.mockClear();
		await makeHandler(categories)(makeEvent());
		expect(categoriesQueried()).toEqual([]);
		expect(storedAttempt?.envelope.subject).toBe("default subject");
	});

	it("uses the previewed default when no template or named action was selected", async () => {
		templateQuery = (ref) =>
			ref === refs.getTemplateByCategory
				? { siteUrl: "example.com", subject: "hidden fallback", body: "hidden" }
				: null;

		await makeHandler()(makeEvent());

		expect(categoriesQueried()).toEqual([]);
		expect(storedAttempt?.envelope.subject).toBe("default subject");
		expect(storedAttempt?.envelope.html).toContain("default");
		expect(storedAttempt?.envelope.html).not.toContain("hidden fallback");
	});

	it("uses an explicit same-tenant template without consulting fallback categories", async () => {
		templateQuery = (ref) =>
			ref === refs.getTemplate
				? { siteUrl: "example.com", subject: "picked", body: "picked body" }
				: null;

		await makeHandler(() => ["custom"])(makeEvent({ templateId: "tpl-1" }));
		expect(categoriesQueried()).toEqual([]);
		expect(storedAttempt?.envelope.subject).toBe("picked");
	});

	it("fails closed when an explicitly selected template no longer exists", async () => {
		await expect(
			makeHandler()(makeEvent({ templateId: "deleted-template" })),
		).rejects.toMatchObject({ status: 404 });

		expect(categoriesQueried()).toEqual([]);
		expect(mutationCalls(refs.prepareAttempt)).toEqual([]);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("rejects documents and explicit templates from another tenant before provider work", async () => {
		const wrongDocument = makeHandler(undefined, {
			fetchDocument: vi.fn(async () => ({
				_id: DOCUMENT_ID,
				siteUrl: "other.example.com",
				clientId: "client-1",
				clientEmail: "client@example.com",
				status: "draft",
			})),
		});
		await expect(wrongDocument(makeEvent())).rejects.toMatchObject({
			status: 404,
		});

		templateQuery = (ref) =>
			ref === refs.getTemplate
				? { siteUrl: "other.example.com", subject: "wrong", body: "wrong" }
				: null;
		await expect(
			makeHandler()(makeEvent({ templateId: "tpl-other" })),
		).rejects.toMatchObject({ status: 404 });

		expect(mutationCalls(refs.prepareAttempt)).toEqual([]);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("renders variables and guarantees portal access for custom copy that omits it", async () => {
		await makeHandler()(
			makeEvent({
				customSubject: "invoice {{invoiceNumber}}",
				customBody: "custom invoice body",
			}),
		);

		expect(storedAttempt?.envelope.subject).toBe("invoice INV-1");
		expect(storedAttempt?.envelope.html).toContain("custom invoice body");
		expect(storedAttempt?.envelope.html).toContain("View and pay invoice");
		expect(storedAttempt?.envelope.html).toContain(storedAttempt?.portalUrl);
		expect(storedAttempt?.envelope.text).toContain(
			`View and pay invoice:\n${storedAttempt?.portalUrl}`,
		);
	});

	it("resolves the legacy invoice-link alias and rejects every unknown placeholder", async () => {
		await makeHandler()(
			makeEvent({
				customSubject: "invoice {{invoiceNumber}}",
				customBody: "pay here: {{invoiceLink}}",
			}),
		);
		expect(storedAttempt?.envelope.html).toContain(storedAttempt?.portalUrl);
		expect(storedAttempt?.envelope.html).not.toContain("{{invoiceLink}}");

		storedAttempt = null;
		mockMutation.mockClear();
		await expect(
			makeHandler()(
				makeEvent({
					customSubject: "invoice {{invoiceNumber}}",
					customBody: "missing {{galleryLink}}",
				}),
			),
		).rejects.toMatchObject({ status: 400 });
		expect(mutationCalls(refs.prepareAttempt)).toEqual([]);
		expect(sendEmail).toHaveBeenCalledTimes(1);
	});

	it("uses structural HTML breaks for authored prose", async () => {
		await makeHandler()(
			makeEvent({
				customSubject: "Your invoice",
				customBody: "first line\r\n\r\nsecond line",
			}),
		);

		expect(storedAttempt?.envelope.html).toContain(
			"first line<br>\n&nbsp;<br>\nsecond line",
		);
		expect(storedAttempt?.envelope.text).toContain(
			"first line\r\n\r\nsecond line",
		);
	});

	it("rejects a partial custom override instead of silently sending another source", async () => {
		await expect(
			makeHandler()(makeEvent({ customSubject: "Only a subject" })),
		).rejects.toMatchObject({ status: 400 });
		await expect(
			makeHandler()(makeEvent({ customBody: "Only a body" })),
		).rejects.toMatchObject({ status: 400 });
		await expect(
			makeHandler()(makeEvent({ customSubject: "  ", customBody: "body" })),
		).rejects.toMatchObject({ status: 400 });
		await expect(
			makeHandler()(makeEvent({ customSubject: "subject", customBody: "\n" })),
		).rejects.toMatchObject({ status: 400 });

		expect(mutationCalls(refs.prepareAttempt)).toEqual([]);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("rejects invalid or oversized rendered envelopes before journal preparation", async () => {
		for (const overrides of [
			{ defaultSubject: () => "bad\nsubject" },
			{
				buildDefaultMessage: () => ({
					html: "<p>body</p>",
					text: "界".repeat(43_691),
				}),
			},
			{
				buildDefaultMessage: () => ({
					html: `<p>${"界".repeat(87_382)}</p>`,
					text: "body",
				}),
			},
		] as const) {
			await expect(
				makeHandler(undefined, overrides)(makeEvent()),
			).rejects.toMatchObject({ status: 400 });
		}
		expect(mutationCalls(refs.prepareAttempt)).toEqual([]);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("rejects an expired quote before creating a portal token", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-09-02T00:00:00.000Z"));
		templateQuery = (ref) =>
			ref === "quotes.get"
				? {
						_id: DOCUMENT_ID,
						siteUrl: "example.com",
						clientId: "client-1",
						clientEmail: "client@example.com",
						status: "sent",
						quoteNumber: "Q-1",
						packages: [],
						validUntil: "2026-09-01",
					}
				: null;

		await expect(createQuoteSendHandler()(makeEvent())).rejects.toMatchObject({
			status: 409,
		});
		expect(mutationCalls(refs.prepareAttempt)).toEqual([]);
		vi.useRealTimers();
	});

	it("keeps raw text readable while escaping the same variables exactly once in HTML", async () => {
		const handler = makeHandler(undefined, {
			extractVars: () => ({
				values: { clientName: "O'Connor & Sons" },
			}),
		});
		await handler(
			makeEvent({
				customSubject: "For {{clientName}}",
				customBody: "<p>Hello {{clientName}}</p>",
			}),
		);

		expect(storedAttempt?.envelope.subject).toBe("For O'Connor & Sons");
		expect(storedAttempt?.envelope.text).toContain("Hello O'Connor & Sons");
		expect(storedAttempt?.envelope.html).toContain(
			"Hello O&#39;Connor &amp; Sons",
		);
		expect(storedAttempt?.envelope.html).not.toContain("&amp;amp;");
	});

	it("inserts a visible portal action inside an authored HTML document even when a hidden URL exists", async () => {
		await makeHandler()(
			makeEvent({
				customSubject: "Your invoice",
				customBody:
					"<html><body><p>Review this invoice.</p><!-- {{portalUrl}} --></body></html>",
			}),
		);

		const html = storedAttempt?.envelope.html ?? "";
		expect(html).toContain("View and pay invoice");
		expect(html.indexOf("View and pay invoice")).toBeLessThan(
			html.indexOf("</body>"),
		);
		expect(html).toContain('<table role="presentation"');
		expect(html).toContain('bgcolor="#3f352e"');
		expect(html).toContain("mso-padding-alt: 14px 22px");
		expect(html).toContain("max-width: 600px; margin: 0 auto");
	});

	it("creates a readable text alternative from a full authored HTML document", async () => {
		await makeHandler()(
			makeEvent({
				customSubject: "Your invoice",
				customBody:
					'<html><head><title>hidden title</title><style>.hero{color:red}</style></head><body><script>steal()</script><h1>Invoice &mdash; Avery&rsquo;s</h1><table><tr><td>Total</td><td>$100</td></tr></table><img src="cid:receipt" alt="Receipt image"><p><a href="https://example.com/help">Get help</a></p></body></html>',
			}),
		);

		const text = storedAttempt?.envelope.text ?? "";
		expect(text).toContain("Invoice — Avery’s");
		expect(text).toContain("Total | $100");
		expect(text).toContain("Receipt image");
		expect(text).toContain("Get help (https://example.com/help)");
		expect(text).not.toContain("hidden title");
		expect(text).not.toContain(".hero");
		expect(text).not.toContain("steal()");
	});

	it.each([
		["invoice", "View and pay invoice"],
		["quote", "Review your quote"],
		["contract", "Review and sign contract"],
	] as const)("guarantees the %s portal action in authored templates", async (docType, label) => {
		await makeHandler(undefined, { docType })(
			makeEvent({
				customSubject: "Your document",
				customBody: "Please review.",
			}),
		);
		expect(storedAttempt?.envelope.html).toContain(label);
		expect(storedAttempt?.envelope.text).toContain(label);
		storedAttempt = null;
	});

	it("replays a sent attempt without fetching, rendering, preparing, or sending", async () => {
		storedAttempt = existingAttempt("sent");
		const fetchDocument = vi.fn();
		const response = await makeHandler(undefined, { fetchDocument })(makeEvent());

		expectPrivateNoStore(response);
		expect(await response.json()).toEqual({
			success: true,
			replay: true,
			attemptId: ATTEMPT_ID,
		});
		expect(fetchDocument).not.toHaveBeenCalled();
		expect(mutationCalls(refs.prepareAttempt)).toEqual([]);
		expect(mutationCalls(refs.claimAttempt)).toEqual([]);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("resumes a prepared attempt from its frozen envelope without refetching mutable data", async () => {
		storedAttempt = existingAttempt("prepared");
		const fetchDocument = vi.fn();
		await makeHandler(undefined, { fetchDocument })(makeEvent());

		expect(fetchDocument).not.toHaveBeenCalled();
		expect(mutationCalls(refs.prepareAttempt)).toEqual([]);
		expect(sendEmail).toHaveBeenCalledWith(
			{ ...storedAttempt?.envelope, tags: storedAttempt?.providerTags },
			{
			idempotencyKey: `document-email-v1/invoice/${DOCUMENT_ID}/${ATTEMPT_ID}`,
			},
		);
	});

	it("adopts a document-scoped blocked attempt and replays its exact provider payload", async () => {
		const canonical = existingAttempt("prepared", {
			attemptId: CANONICAL_ATTEMPT_ID,
			providerIdempotencyKey: `document-email-v1/invoice/${DOCUMENT_ID}/${CANONICAL_ATTEMPT_ID}`,
			providerTags: [
				{ name: "document_attempt", value: CANONICAL_ATTEMPT_ID },
			],
		});
		mockMutation.mockImplementation(
			(ref: string, args: Record<string, unknown>) => {
				if (ref === refs.prepareAttempt) {
					storedAttempt = canonical;
					return Promise.resolve({ outcome: "blocked", attempt: canonical });
				}
				if (ref === refs.claimAttempt) {
					expect(args.attemptId).toBe(CANONICAL_ATTEMPT_ID);
					storedAttempt = {
						...canonical,
						status: "claimed",
						claimId: String(args.claimId),
					};
					return Promise.resolve({ outcome: "claimed", attempt: storedAttempt });
				}
				if (ref === refs.completeAttempt) {
					storedAttempt = {
						...(storedAttempt as TestAttempt),
						status: "sent",
						open: false,
						providerMessageId: String(args.providerMessageId),
					};
					return Promise.resolve({ outcome: "sent", attempt: storedAttempt });
				}
				throw new Error(`unexpected mutation ${ref}`);
			},
		);

		const response = await makeHandler()(makeEvent());

		expect(await response.json()).toMatchObject({
			success: true,
			attemptId: CANONICAL_ATTEMPT_ID,
		});
		expect(sendEmail).toHaveBeenCalledWith(
			{ ...canonical.envelope, tags: canonical.providerTags },
			{
				idempotencyKey: canonical.providerIdempotencyKey,
			},
		);
	});

	it("resumes the frozen same-document attempt after a prepare conflict race", async () => {
		const frozen = existingAttempt("prepared");
		mockMutation.mockImplementation(
			(ref: string, args: Record<string, unknown>) => {
				if (ref === refs.prepareAttempt) {
					storedAttempt = frozen;
					return Promise.resolve({
						outcome: "rejected",
						reason: "attempt_conflict",
					});
				}
				if (ref === refs.claimAttempt) {
					storedAttempt = {
						...frozen,
						status: "claimed",
						claimId: String(args.claimId),
					};
					return Promise.resolve({ outcome: "claimed", attempt: storedAttempt });
				}
				if (ref === refs.completeAttempt) {
					storedAttempt = {
						...(storedAttempt as TestAttempt),
						status: "sent",
						open: false,
						providerMessageId: String(args.providerMessageId),
					};
					return Promise.resolve({ outcome: "sent", attempt: storedAttempt });
				}
				throw new Error(`unexpected mutation ${ref}`);
			},
		);

		const response = await makeHandler()(makeEvent());

		expect(response.status).toBe(200);
		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(sendEmail).toHaveBeenCalledWith(
			{ ...frozen.envelope, tags: frozen.providerTags },
			{ idempotencyKey: frozen.providerIdempotencyKey },
		);
	});

	it("never contacts the provider when frozen provider tags are malformed", async () => {
		storedAttempt = existingAttempt("prepared", { providerTags: [] });

		await expect(makeHandler()(makeEvent())).rejects.toMatchObject({
			status: 500,
		});
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("finalizes a durably recorded provider acceptance without sending again", async () => {
		storedAttempt = existingAttempt("uncertain", {
			claimId: "22222222-2222-4222-8222-222222222222",
			providerMessageId: "msg_already_accepted",
		});
		const response = await makeHandler()(makeEvent());

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			replay: true,
			attemptId: ATTEMPT_ID,
		});
		expect(sendEmail).not.toHaveBeenCalled();
		expect(mutationCalls(refs.completeAttempt)).toEqual([
			expect.objectContaining({
				claimId: "22222222-2222-4222-8222-222222222222",
				providerMessageId: "msg_already_accepted",
			}),
		]);
	});

	it("reconciles an unknown provider outcome with the frozen idempotency key", async () => {
		storedAttempt = existingAttempt("uncertain");
		const frozenEnvelope = storedAttempt.envelope;
		const response = await makeHandler()(makeEvent());

		expect(response.status).toBe(200);
		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(sendEmail).toHaveBeenCalledWith(
			{ ...frozenEnvelope, tags: storedAttempt?.providerTags },
			{
			idempotencyKey: `document-email-v1/invoice/${DOCUMENT_ID}/${ATTEMPT_ID}`,
			},
		);
		expect(mutationCalls(refs.prepareAttempt)).toEqual([]);
		expect(mutationCalls(refs.completeAttempt)).toHaveLength(1);
	});

	it("does not call the provider for busy or terminal journal outcomes", async () => {
		for (const outcome of ["busy", "failed", "uncertain"] as const) {
			storedAttempt = existingAttempt("prepared");
			mockMutation.mockImplementation((ref: string) => {
				if (ref !== refs.claimAttempt)
					throw new Error(`unexpected mutation ${ref}`);
				return Promise.resolve({
					outcome,
					attempt: {
						...storedAttempt,
						status: outcome === "busy" ? "claimed" : outcome,
					},
				});
			});
			const response = await makeHandler()(makeEvent());
			expect(response.status).toBe(
				outcome === "busy" || outcome === "failed" ? 409 : 503,
			);
			expectPrivateNoStore(response);
			expect(await response.json()).toMatchObject({
				success: false,
				error: outcome,
			});
		}
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("keeps an expired uncertain attempt held for recovery", async () => {
		storedAttempt = existingAttempt("prepared");
		mockMutation.mockImplementation((ref: string) => {
			if (ref !== refs.claimAttempt)
				throw new Error(`unexpected mutation ${ref}`);
			storedAttempt = existingAttempt("uncertain");
			return Promise.resolve({ outcome: "expired", attempt: storedAttempt });
		});

		const response = await makeHandler()(makeEvent());

		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({
			error: "uncertain",
			attemptId: ATTEMPT_ID,
		});
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("treats an expired definitely-unsent attempt as released", async () => {
		storedAttempt = existingAttempt("prepared");
		mockMutation.mockImplementation((ref: string) => {
			if (ref !== refs.claimAttempt)
				throw new Error(`unexpected mutation ${ref}`);
			storedAttempt = existingAttempt("resolved_not_sent", { open: false });
			return Promise.resolve({ outcome: "expired", attempt: storedAttempt });
		});

		const response = await makeHandler()(makeEvent());

		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			error: "rejected",
			attemptId: ATTEMPT_ID,
		});
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("records resolved provider rejection as failed", async () => {
		vi.mocked(sendEmail).mockResolvedValueOnce({
			data: null,
			error: { message: "provider rejected", name: "validation_error" },
		});
		const response = await makeHandler()(makeEvent());
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ error: "failed" });
		expect(mutationCalls(refs.failAttempt)).toEqual([
			expect.objectContaining({
				disposition: "failed",
				error: "provider rejected",
			}),
		]);
		expect(mutationCalls(refs.completeAttempt)).toEqual([]);
	});

	it.each([
		"concurrent_idempotent_requests",
		"application_error",
		"invalid_idempotent_request",
		"internal_server_error",
		"rate_limit_exceeded",
	])("records retryable provider error %s as uncertain", async (name) => {
		vi.mocked(sendEmail).mockResolvedValueOnce({
			data: null,
			error: { message: "try later", name },
		});
		const response = await makeHandler()(makeEvent());

		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ error: "uncertain" });
		expect(mutationCalls(refs.failAttempt)).toEqual([
			expect.objectContaining({
				disposition: "uncertain",
				error: "try later",
			}),
		]);
	});

	it("treats an unknown provider error name as uncertain", async () => {
		vi.mocked(sendEmail).mockResolvedValueOnce({
			data: null,
			error: { message: "new provider condition", name: "future_error" },
		});
		const response = await makeHandler()(makeEvent());

		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ error: "uncertain" });
		expect(mutationCalls(refs.failAttempt)).toEqual([
			expect.objectContaining({
				disposition: "uncertain",
				error: "new provider condition",
			}),
		]);
	});

	it("rejects terminal document sends before preparing a portal token", async () => {
		for (const [docType, status] of [
			["invoice", "paid"],
			["quote", "accepted"],
			["contract", "signed"],
		] as const) {
			const handler = makeHandler(undefined, {
				docType,
				fetchDocument: vi.fn(async () => ({
					_id: DOCUMENT_ID,
					siteUrl: "example.com",
					clientId: "client-1",
					clientEmail: "client@example.com",
					status,
				})),
			});
			await expect(handler(makeEvent())).rejects.toMatchObject({ status: 409 });
		}
		expect(mutationCalls(refs.prepareAttempt)).toEqual([]);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("blocks partially paid invoices until a remaining-balance checkout exists", async () => {
		const handler = makeHandler(undefined, {
			fetchDocument: vi.fn(async () => ({
				_id: DOCUMENT_ID,
				siteUrl: "example.com",
				clientId: "client-1",
				clientEmail: "client@example.com",
				invoiceNumber: "INV-1",
				status: "partial",
			})),
		});

		await expect(
			handler(makeEvent({ changeNote: "payment reminder" })),
		).rejects.toMatchObject({ status: 409 });
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("records thrown and ambiguous provider outcomes as uncertain", async () => {
		vi.mocked(sendEmail).mockRejectedValueOnce(new Error("network timeout"));
		const thrownResponse = await makeHandler()(makeEvent());
		expect(thrownResponse.status).toBe(503);
		expect(await thrownResponse.json()).toMatchObject({ error: "uncertain" });
		expect(mutationCalls(refs.failAttempt)).toEqual([
			expect.objectContaining({
				disposition: "uncertain",
				error: "network timeout",
			}),
		]);

		storedAttempt = null;
		mockMutation.mockClear();
		vi.mocked(sendEmail).mockResolvedValueOnce({ data: null, error: null });
		const missingIdResponse = await makeHandler()(makeEvent());
		expect(missingIdResponse.status).toBe(503);
		expect(await missingIdResponse.json()).toMatchObject({
			error: "uncertain",
		});
		expect(mutationCalls(refs.failAttempt)).toEqual([
			expect.objectContaining({
				disposition: "uncertain",
				error: "Email provider returned no delivery id",
			}),
		]);
	});

	it("bounds multibyte provider failures before recording them", async () => {
		vi.mocked(sendEmail).mockRejectedValueOnce(
			new Error("界".repeat(2_000)),
		);
		const response = await makeHandler()(makeEvent());
		const [failure] = mutationCalls(refs.failAttempt);
		const recorded = String(failure.error);

		expect(response.status).toBe(503);
		expect(new TextEncoder().encode(recorded).byteLength).toBeLessThanOrEqual(4_096);
		expect(recorded).toMatch(/…$/);
	});

	it("marks the attempt uncertain when provider success cannot be durably completed", async () => {
		mockMutation.mockImplementation(
			(ref: string, args: Record<string, unknown>) => {
				if (ref === refs.prepareAttempt) {
					storedAttempt = attemptFromPrepare(args);
					return Promise.resolve({
						outcome: "prepared",
						attempt: storedAttempt,
					});
				}
				if (ref === refs.claimAttempt) {
					storedAttempt = {
						...(storedAttempt as TestAttempt),
						status: "claimed",
					};
					return Promise.resolve({
						outcome: "claimed",
						attempt: storedAttempt,
					});
				}
				if (ref === refs.completeAttempt)
					throw new Error("completion unavailable");
				if (ref === refs.failAttempt) {
					return Promise.resolve({
						outcome: "uncertain",
						attempt: { ...(storedAttempt as TestAttempt), status: "uncertain" },
					});
				}
				throw new Error(`unexpected mutation ${ref}`);
			},
		);

		const response = await makeHandler()(makeEvent());
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ error: "uncertain" });
		expect(mutationCalls(refs.failAttempt)).toEqual([
			expect.objectContaining({
				disposition: "uncertain",
				error: "completion unavailable",
				providerMessageId: "msg_123",
			}),
		]);
	});

	it("returns success when completion committed but its response was lost", async () => {
		mockMutation.mockImplementation(
			(ref: string, args: Record<string, unknown>) => {
				if (ref === refs.prepareAttempt) {
					storedAttempt = attemptFromPrepare(args);
					return Promise.resolve({
						outcome: "prepared",
						attempt: storedAttempt,
					});
				}
				if (ref === refs.claimAttempt) {
					storedAttempt = {
						...(storedAttempt as TestAttempt),
						status: "claimed",
						claimId: String(args.claimId),
					};
					return Promise.resolve({
						outcome: "claimed",
						attempt: storedAttempt,
					});
				}
				if (ref === refs.completeAttempt) {
					storedAttempt = {
						...(storedAttempt as TestAttempt),
						status: "sent",
						providerMessageId: String(args.providerMessageId),
					};
					throw new Error("completion response lost");
				}
				if (ref === refs.failAttempt) {
					return Promise.resolve({ outcome: "sent", attempt: storedAttempt });
				}
				throw new Error(`unexpected mutation ${ref}`);
			},
		);

		const response = await makeHandler()(makeEvent());

		expect(response.status).toBe(200);
		expectPrivateNoStore(response);
		expect(await response.json()).toEqual({
			success: true,
			replay: true,
			attemptId: ATTEMPT_ID,
		});
		expect(sendEmail).toHaveBeenCalledTimes(1);
	});

	it("rejects a journal row whose scope does not match the requested document", async () => {
		storedAttempt = existingAttempt("prepared", {
			document: { type: "invoice", id: "another-document" },
		});
		await expect(makeHandler()(makeEvent())).rejects.toMatchObject({
			status: 500,
		});
		expect(sendEmail).not.toHaveBeenCalled();
	});
});
