import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
	return readFileSync(
		fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
		"utf8",
	);
}

describe("document email recovery host adoption", () => {
	it("hydrates all document detail views from local and backend recovery state", () => {
		for (const page of [
			"src/lib/pages/InvoicingPage.svelte",
			"src/lib/pages/QuotesPage.svelte",
			"src/lib/pages/ContractsPage.svelte",
		]) {
			const value = source(page);
			expect(value).toContain("emailRequests.pending(");
			expect(value).toContain("emailRequests.hydrate(");
			expect(value).toContain("presentableDocumentEmailRecoveryFromError(");
		}
	});

	it("retains an automatic overdue ambiguity in page-owned recovery state", () => {
		const modal = source(
			"src/lib/pages/invoicing/InvoiceDetailModal.svelte",
		);
		const overdueCatch = modal.match(
			/await onsend\(invoice\._id, undefined, "payment overdue"\);[\s\S]*?addToast\(`Marked overdue/,
		)?.[0];

		expect(overdueCatch).toBeDefined();
		expect(overdueCatch).toContain(
			"presentableDocumentEmailRecoveryFromError(err)",
		);
		expect(overdueCatch).toContain("onemailrecovery(invoice._id");
	});

	it("keeps overdue mutation and reminder delivery bound to the captured invoice after close", () => {
		const page = source("src/lib/pages/InvoicingPage.svelte");
		const modal = source(
			"src/lib/pages/invoicing/InvoiceDetailModal.svelte",
		);
		const action = page.match(
			/async function handleAction\(invoiceId: string, action: string\)[\s\S]*?\n}\n\nasync function handleSendEmail/,
		)?.[0];
		const send = page.match(
			/async function handleSendEmail\([\s\S]*?\n}\n\nfunction handleEmailResolved/,
		)?.[0];

		expect(action).toBeDefined();
		expect(action).toContain("invoiceId: toId(invoiceId)");
		expect(action).toContain("selectedInvoice?._id === invoiceId");
		expect(send).toContain("sendInvoiceEmailRequest(invoiceId");
		expect(modal).toContain("await onaction(invoice._id, action)");
		expect(modal).toContain(
			'await onsend(invoice._id, undefined, "payment overdue")',
		);
	});

	it("does not let a late recovery from document A replace selected document B", () => {
		const invoices = source("src/lib/pages/InvoicingPage.svelte");
		const contracts = source("src/lib/pages/ContractsPage.svelte");
		const quotes = source("src/lib/pages/QuotesPage.svelte");

		expect(invoices).toContain(
			"if (selectedInvoice && selectedInvoice._id !== invoiceId) return;\n\trememberInvoiceRecovery(invoiceId, attempt);",
		);
		expect(invoices).toContain(
			"if (selectedInvoice && documentId !== selectedInvoice._id) return;\n\trememberInvoiceRecovery(documentId",
		);
		expect(contracts).toContain(
			"if (selectedContract && selectedContract._id !== contractId) return;\n\trememberContractRecovery(contractId, attempt);",
		);
		expect(contracts).toContain(
			"if (selectedContract && documentId !== selectedContract._id) return;\n\trememberContractRecovery(documentId",
		);
		expect(quotes).toContain(
			"if (!selectedQuote || selectedQuote._id === quoteId)",
		);
		expect(quotes).toContain(
			"if (selectedQuote && documentId !== selectedQuote._id) return;\n\temailRecoveryAttempt =",
		);
		const quoteSend = quotes.match(
			/async function sendQuoteEmail[\s\S]*?\n}\n\nfunction handleQuoteEmailResolved/,
		)?.[0];
		expect(quoteSend).toContain(
			"if (emailRecoveryDocumentId === quoteId)",
		);
		expect(quoteSend).toContain("if (selectedQuote?._id === quoteId)");
		expect(quoteSend?.indexOf('sendResult = "success"')).toBeGreaterThan(
			quoteSend?.indexOf("if (selectedQuote?._id === quoteId)") ?? -1,
		);
	});
});
