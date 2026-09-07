export interface InvoiceAmountItem {
	quantity: number;
	unitPrice: number;
}

function requireCents(value: number): number {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError("Invoice amounts must be nonnegative safe integer cents");
	}
	return value;
}

export function calculateInvoiceTax(subtotal: number, taxPercent: number): number {
	requireCents(subtotal);
	if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) {
		throw new RangeError("Invoice tax must be between 0 and 100 percent");
	}
	return requireCents(Math.round(subtotal * taxPercent / 100));
}

export function calculateInvoiceAmounts(
	items: readonly InvoiceAmountItem[],
	taxPercent = 0,
) {
	// Rounded line amounts are authoritative so the displayed lines reconcile with the subtotal.
	const lineTotals = items.map((item) => {
		if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
			throw new RangeError("Invoice quantities must be finite and positive");
		}
		requireCents(item.unitPrice);
		return requireCents(Math.round(item.quantity * item.unitPrice));
	});
	const subtotal = lineTotals.reduce((sum, lineTotal) => requireCents(sum + lineTotal), 0);
	const tax = calculateInvoiceTax(subtotal, taxPercent);
	return { lineTotals, subtotal, tax, total: requireCents(subtotal + tax) };
}

export function tryInvoiceAmounts(items: readonly InvoiceAmountItem[], taxPercent = 0) {
	try {
		return calculateInvoiceAmounts(items, taxPercent);
	} catch (error) {
		if (error instanceof RangeError) return null;
		throw error;
	}
}
