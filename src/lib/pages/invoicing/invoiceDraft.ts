import { tryInvoiceAmounts } from "../../invoiceAmounts";
import { dollarsToCents } from "../../utils";

export interface InvoiceDraftItem {
	description: string;
	quantity: number | undefined;
	unitPrice: number | undefined;
}

export function prepareInvoiceDraft(
	draft: readonly InvoiceDraftItem[],
	taxPercent: number | undefined,
) {
	if (taxPercent === undefined) return null;
	const items = [];
	for (const item of draft) {
		if (item.quantity === undefined || item.unitPrice === undefined
			|| !Number.isFinite(item.unitPrice) || item.unitPrice < 0) return null;
		items.push({ ...item, quantity: item.quantity, unitPrice: dollarsToCents(item.unitPrice) });
	}
	const amounts = tryInvoiceAmounts(items, taxPercent);
	return amounts ? { items, amounts, taxPercent } : null;
}
