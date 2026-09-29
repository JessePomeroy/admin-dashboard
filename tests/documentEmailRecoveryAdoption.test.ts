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
	it("retains an automatic overdue ambiguity in page-owned recovery state", () => {
		const modal = source(
			"src/lib/pages/invoicing/InvoiceDetailModal.svelte",
		);
		const overdueCatch = modal.match(
			/await onsend\(invoiceId, undefined, "payment overdue"\);[\s\S]*?addToast\(`Marked overdue/,
		)?.[0];

		expect(overdueCatch).toBeDefined();
		expect(overdueCatch).toContain(
			"presentableDocumentEmailRecoveryFromError(err)",
		);
		expect(overdueCatch).toContain("onemailrecovery(invoiceId");
	});

	it("keeps an overdue action from updating a different selected invoice", () => {
		const page = source("src/lib/pages/InvoicingPage.svelte");
		const action = page.match(
			/async function handleAction\(invoiceId: string, action: string\)[\s\S]*?\n}\n\nasync function handleSendEmail/,
		)?.[0];

		expect(action).toBeDefined();
		expect(action).toContain("selectedInvoice?._id === invoiceId");
	});

});
