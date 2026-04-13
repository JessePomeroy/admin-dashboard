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

vi.mock("../server/email", async () => {
	const actual = await vi.importActual<typeof import("../server/email")>(
		"../server/email",
	);
	return {
		...actual,
		sendEmail: vi.fn().mockResolvedValue({ data: { id: "msg_123" } }),
	};
});

// Imports AFTER mocks so the module graph uses them
import { setServerConfig } from "../config";
import { createEmailSendHandler } from "../server/handlers/createEmailSendHandler";
import type { EmailCategory } from "../types";

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
		});
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
});
