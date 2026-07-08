import { describe, expect, it } from "vitest";
import { replaceTemplateVariables } from "../src/lib/server/email";

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
		expect(result).toBe(
			"Hi Jane, your invoice INV-001 is due on 2026-05-01.",
		);
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
