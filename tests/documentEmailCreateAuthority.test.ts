import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const createModals = [
	{
		name: "invoice",
		path: "src/lib/pages/invoicing/InvoiceCreateModal.svelte",
		templateField: "templateId",
	},
	{
		name: "quote",
		path: "src/lib/pages/quotes/QuoteCreateModal.svelte",
		templateField: "templateId",
	},
	{
		name: "contract",
		path: "src/lib/pages/contracts/ContractCreateModal.svelte",
		templateField: "emailTemplateId",
	},
] as const;

describe("document create email source authority", () => {
	for (const modal of createModals) {
		it(`${modal.name} sends custom email fields only through the paired raw-source seam`, () => {
			const source = readFileSync(modal.path, "utf8");

			expect(source).toContain("buildDocumentEmailCreateFields(");
			expect(source).toContain(`\"${modal.templateField}\"`);
			expect(source).toContain("customContent: customEmailContent");
			expect(source).toContain("oncustomcontentchange=");
			expect(source).not.toMatch(/emailSubject:\s*editedSubject/);
			expect(source).not.toMatch(/emailBody:\s*editedBody/);
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
