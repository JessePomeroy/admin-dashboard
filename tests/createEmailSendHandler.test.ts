import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Module mocks ────────────────────────────────────────────────────────────

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
	const actual =
		await vi.importActual<typeof import("../src/lib/server/email")>(
			"../src/lib/server/email",
		);
	return {
		...actual,
		sendEmail: vi.fn().mockResolvedValue({ data: { id: "msg_123" } }),
	};
});

// Imports AFTER mocks so the module graph uses them
import { setServerConfig, type AdminServerConfig } from "../src/lib/config";
import { sendEmail } from "../src/lib/server/email";
import { createEmailSendHandler } from "../src/lib/server/handlers/createEmailSendHandler";
import type { EmailCategory } from "../src/lib/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHandler(fallbackCategories: readonly EmailCategory[]) {
	return createEmailSendHandler({
		docType: "invoice",
		fetchDocument: async () => ({
			clientEmail: "client@example.com",
			invoiceNumber: "INV-1",
		}),
		getClientEmail: (doc) => doc.clientEmail,
		extractVars: () => ({}),
		buildDefaultHtml: () => "<p>default</p>",
		defaultSubject: () => "default subject",
		markSent: async () => {},
		fallbackCategories,
	});
}

function makeEvent(body: Record<string, unknown> = {}) {
	return {
		params: { id: "doc-1" },
		request: new Request("http://localhost/api/admin/invoice/doc-1/send", {
			method: "POST",
			body: JSON.stringify(body),
		}),
	// biome-ignore lint/suspicious/noExplicitAny: partial SvelteKit RequestEvent mock for testing
	} as any;
}

function categoriesQueried(): string[] {
	return mockQuery.mock.calls
		.filter((c) => c[0] === "getByCategory")
		.map((c) => c[1].category);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("createEmailSendHandler template fallback cascade", () => {
	beforeEach(() => {
		mockQuery.mockReset();
		mockMutation.mockReset();
		mockMutation.mockResolvedValue(undefined);
		vi.mocked(sendEmail).mockClear();

		setServerConfig({
			api: {
				emailTemplates: {
					get: "get",
					getByCategory: "getByCategory",
				},
				emailLog: { create: "create" },
			// biome-ignore lint/suspicious/noExplicitAny: partial AdminAPI mock — only the fields the handler touches
			} as any,
			siteUrl: "https://example.com",
			siteName: "Example",
			convexUrl: "https://convex.example.com",
			resendApiKey: "re_test",
			verifyAdmin: vi.fn(async () => true),
		});
	});

	it("rejects missing authorization configuration before provider work", async () => {
		setServerConfig({
			api: {},
			siteUrl: "https://example.com",
			siteName: "Example",
			convexUrl: "https://convex.example.com",
			resendApiKey: "re_test",
			// Exercise the runtime boundary used by JavaScript or casted consumers.
			verifyAdmin: undefined,
		} as unknown as AdminServerConfig);

		await expect(makeHandler([])(makeEvent())).rejects.toMatchObject({ status: 500 });
		expect(mockQuery).not.toHaveBeenCalled();
		expect(mockMutation).not.toHaveBeenCalled();
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("tries fallback categories in order and stops at the first match", async () => {
		mockQuery.mockImplementation((_name: string, args: any) => {
			if (args?.category === "custom") {
				return Promise.resolve({
					subject: "CUSTOM subject",
					body: "CUSTOM body",
				});
			}
			return Promise.resolve(null);
		});

		const handler = makeHandler(["booking-confirmation", "custom"]);
		await handler(makeEvent());

		// Should have queried booking-confirmation first, then custom (and stopped)
		expect(categoriesQueried()).toEqual(["booking-confirmation", "custom"]);
	});

	it("stops at the first matching category without querying the rest", async () => {
		mockQuery.mockImplementation((_name: string, args: any) => {
			if (args?.category === "booking-confirmation") {
				return Promise.resolve({
					subject: "booked",
					body: "booked body",
				});
			}
			return Promise.resolve(null);
		});

		const handler = makeHandler(["booking-confirmation", "custom"]);
		await handler(makeEvent());

		expect(categoriesQueried()).toEqual(["booking-confirmation"]);
	});

	it("invoice-style config with fallbackCategories=['custom'] does NOT query booking-confirmation", async () => {
		// This is the regression guard for audit #7a: before the fix, invoices
		// would silently render a booking-confirmation template if one existed.
		mockQuery.mockResolvedValue(null);

		const handler = makeHandler(["custom"]);
		await handler(makeEvent());

		expect(categoriesQueried()).toEqual(["custom"]);
		expect(categoriesQueried()).not.toContain("booking-confirmation");
	});

	it("falls through to default HTML when no categories match", async () => {
		mockQuery.mockResolvedValue(null);

		const handler = makeHandler(["custom"]);
		const response = await handler(makeEvent());

		expect(response).toBeInstanceOf(Response);
		// Verify the default-subject path was taken by checking the email log
		// mutation received the default subject.
		const logCall = mockMutation.mock.calls.find(
			(c) => c[0] === "create",
		);
		expect(logCall?.[1].subject).toBe("default subject");
	});

	it("skips the category cascade entirely when an explicit templateId is provided", async () => {
		mockQuery.mockImplementation((name: string) => {
			if (name === "get") {
				return Promise.resolve({
					subject: "picked subject",
					body: "picked body",
				});
			}
			return Promise.resolve(null);
		});

		const handler = makeHandler(["custom"]);
		await handler(makeEvent({ templateId: "tpl-1" }));

		expect(categoriesQueried()).toHaveLength(0);
	});

	it("handles an empty fallbackCategories list by falling through to default HTML", async () => {
		const handler = makeHandler([]);
		await handler(makeEvent());

		expect(categoriesQueried()).toEqual([]);
		const logCall = mockMutation.mock.calls.find(
			(c) => c[0] === "create",
		);
		expect(logCall?.[1].subject).toBe("default subject");
	});

	it("renders custom subject/body variables and optional portal URLs before sending", async () => {
		const handler = createEmailSendHandler({
			docType: "invoice",
			fetchDocument: async () => ({
				_id: "invoice-1",
				clientEmail: "client@example.com",
				invoiceNumber: "INV-1",
			}),
			getClientEmail: (doc) => doc.clientEmail,
			extractVars: (doc) => ({
				invoiceNumber: doc.invoiceNumber,
			}),
			buildDefaultHtml: () => "<p>default</p>",
			defaultSubject: () => "default subject",
			createPortalUrl: async () => "https://example.com/portal/token-1",
			markSent: async () => {},
			fallbackCategories: [],
		});

		await handler(
			makeEvent({
				customSubject: "invoice {{ invoiceNumber }}",
				customBody: "pay here: {{portalUrl}}",
			}),
		);

		expect(vi.mocked(sendEmail)).toHaveBeenLastCalledWith(
			expect.objectContaining({
				subject: "invoice INV-1",
				html: expect.stringContaining("https://example.com/portal/token-1"),
			}),
		);
	});

	it("finalizes rendered custom bodies after variable replacement", async () => {
		const handler = createEmailSendHandler({
			docType: "invoice",
			fetchDocument: async () => ({
				clientEmail: "client@example.com",
				invoiceNumber: "INV-1",
			}),
			getClientEmail: (doc) => doc.clientEmail,
			extractVars: (doc) => ({
				invoiceNumber: doc.invoiceNumber,
			}),
			buildDefaultHtml: () => "<p>default</p>",
			defaultSubject: () => "default subject",
			createPortalUrl: async () => "https://example.com/portal/token-1",
			finalizeRenderedBody: (body, vars) => `${body}\n${vars.portalUrl}`,
			markSent: async () => {},
			fallbackCategories: [],
		});

		await handler(
			makeEvent({
				customSubject: "invoice {{invoiceNumber}}",
				customBody: "custom invoice body",
			}),
		);

		expect(vi.mocked(sendEmail)).toHaveBeenLastCalledWith(
			expect.objectContaining({
				subject: "invoice INV-1",
				html: expect.stringContaining("custom invoice body"),
			}),
		);
		expect(vi.mocked(sendEmail)).toHaveBeenLastCalledWith(
			expect.objectContaining({
				html: expect.stringContaining("https://example.com/portal/token-1"),
			}),
		);
	});
});
