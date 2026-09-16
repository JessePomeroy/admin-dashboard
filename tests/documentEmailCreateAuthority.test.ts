import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const createModals = [
	{
		name: "invoice",
		path: "src/lib/pages/invoicing/InvoiceCreateModal.svelte",
	},
	{
		name: "quote",
		path: "src/lib/pages/quotes/QuoteCreateModal.svelte",
	},
	{
		name: "contract",
		path: "src/lib/pages/contracts/ContractCreateModal.svelte",
	},
] as const;

describe("document create email source authority", () => {
	for (const modal of createModals) {
		it(`${modal.name} keeps the full-size email editor available without saved templates`, () => {
			const source = readFileSync(modal.path, "utf8");

			expect(source).toContain('size="full"');
			expect(source).not.toContain("{#if emailTemplates.length > 0}");
		});
	}

	it("uses preview numbers without introducing browser-only assigned-on-save values", () => {
		const invoice = readFileSync(createModals[0].path, "utf8");
		const quote = readFileSync(createModals[1].path, "utf8");

		expect(invoice).toContain("invoiceNumber: numberPreview");
		expect(quote).toContain("quoteNumber: numberPreview");
		expect(invoice).not.toContain('invoiceNumber: "assigned on save"');
		expect(quote).not.toContain('quoteNumber: "assigned on save"');
	});
});
