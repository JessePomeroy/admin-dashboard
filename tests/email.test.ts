import { beforeEach, describe, expect, it, vi } from "vitest";

const resendSend = vi.fn();

vi.mock("resend", () => ({
	Resend: class {
		emails = { send: resendSend };
	},
}));

import { setServerConfig } from "../src/lib/config";
import { replaceTemplateVariables, sendEmail } from "../src/lib/server/email";

describe("replaceTemplateVariables", () => {
	it("replaces single variable", () => {
		const result = replaceTemplateVariables("Hello {{name}}", { name: "Jane" });
		expect(result).toBe("Hello Jane");
	});

	it("replaces multiple variables", () => {
		const result = replaceTemplateVariables(
			"Hi {{name}}, your invoice {{invoiceNumber}} is due on {{dueDate}}.",
			{
				name: "Jane",
				invoiceNumber: "INV-001",
				dueDate: "2026-05-01",
			},
		);
		expect(result).toBe("Hi Jane, your invoice INV-001 is due on 2026-05-01.");
	});

	it("replaces all occurrences of the same variable", () => {
		const result = replaceTemplateVariables(
			"{{name}} said hello. {{name}} left.",
			{ name: "Jane" },
		);
		expect(result).toBe("Jane said hello. Jane left.");
	});

	it("leaves unmatched placeholders untouched", () => {
		const result = replaceTemplateVariables("Hello {{name}}, {{unknown}}", {
			name: "Jane",
		});
		expect(result).toBe("Hello Jane, {{unknown}}");
	});

	it("replaces placeholders with whitespace inside braces", () => {
		const result = replaceTemplateVariables(
			"Hello {{ name }}, invoice {{ invoiceNumber }}",
			{
				name: "Jane",
				invoiceNumber: "INV-001",
			},
		);
		expect(result).toBe("Hello Jane, invoice INV-001");
	});

	it("handles empty variables object", () => {
		const result = replaceTemplateVariables("Hello {{name}}", {});
		expect(result).toBe("Hello {{name}}");
	});

	it("handles empty template", () => {
		const result = replaceTemplateVariables("", { name: "Jane" });
		expect(result).toBe("");
	});

	it("handles variables with special characters", () => {
		const result = replaceTemplateVariables("Amount: {{amount}}", {
			amount: "$1,500.00",
		});
		expect(result).toBe("Amount: $1,500.00");
	});
});

describe("sendEmail", () => {
	beforeEach(() => {
		resendSend.mockReset();
		resendSend.mockResolvedValue({ data: { id: "msg_1" }, error: null });
		setServerConfig({
			fromEmail: "Default <mail@example.com>",
			resendApiKey: "re_test",
			// biome-ignore lint/suspicious/noExplicitAny: sendEmail reads only these two server fields
		} as any);
	});

	it("forwards the frozen envelope and stable provider idempotency key", async () => {
		await sendEmail(
			{
				from: "Studio <studio@example.com>",
				to: "client@example.com",
				replyTo: "reply@example.com",
				subject: "Your document",
				text: "Plain text",
				html: "<p>HTML</p>",
				tags: [
					{
						name: "document_attempt",
						value: "11111111-1111-4111-8111-111111111111",
					},
				],
			},
			{ idempotencyKey: "document-email-v1/invoice/doc-1/attempt-1" },
		);

		expect(resendSend).toHaveBeenCalledWith(
			{
				from: "Studio <studio@example.com>",
				to: "client@example.com",
				replyTo: "reply@example.com",
				subject: "Your document",
				text: "Plain text",
				html: "<p>HTML</p>",
				tags: [
					{
						name: "document_attempt",
						value: "11111111-1111-4111-8111-111111111111",
					},
				],
			},
			{ idempotencyKey: "document-email-v1/invoice/doc-1/attempt-1" },
		);
	});

	it("keeps the legacy one-argument provider call when no idempotency key is supplied", async () => {
		await sendEmail({
			to: "client@example.com",
			subject: "Legacy",
			html: "<p>Legacy</p>",
		});

		expect(resendSend).toHaveBeenCalledWith({
			from: "Default <mail@example.com>",
			to: "client@example.com",
			subject: "Legacy",
			html: "<p>Legacy</p>",
		});
	});
});
