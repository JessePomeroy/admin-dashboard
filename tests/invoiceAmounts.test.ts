import { describe, expect, it } from "vitest";
import { calculateInvoiceAmounts } from "../src/lib/invoiceAmounts";
import { prepareInvoiceDraft } from "../src/lib/pages/invoicing/invoiceDraft";
import { calcSubtotal, calcTax } from "../src/lib/utils";

describe("invoice amounts", () => {
	it("rounds each fractional line before subtotal and fractional tax", () => {
		const items = [{ quantity: 0.5, unitPrice: 1999 }, { quantity: 0.5, unitPrice: 1999 }];
		expect(calculateInvoiceAmounts(items, 6.25)).toEqual({ lineTotals: [1000, 1000], subtotal: 2000, tax: 125, total: 2125 });
		expect(calcSubtotal(items)).toBe(2000);
		expect(calcTax(2000, 6.25)).toBe(125);
	});

	it("preserves integer quantities and supports zero-priced and very small fractional lines", () => {
		expect(calculateInvoiceAmounts([{ quantity: 2, unitPrice: 1999 }], 6)).toEqual({ lineTotals: [3998], subtotal: 3998, tax: 240, total: 4238 });
		expect(calculateInvoiceAmounts([{ quantity: 0.00001, unitPrice: 1999 }, { quantity: 2.5, unitPrice: 0 }])).toEqual({ lineTotals: [0, 0], subtotal: 0, tax: 0, total: 0 });
	});

	it.each([0, -1, NaN, Infinity, -Infinity])("rejects invalid quantity %s", (quantity) => {
		expect(() => calculateInvoiceAmounts([{ quantity, unitPrice: 100 }])).toThrow(RangeError);
	});

	it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid unit cents %s", (unitPrice) => {
		expect(() => calculateInvoiceAmounts([{ quantity: 1, unitPrice }])).toThrow(RangeError);
	});

	it.each([-1, 100.01, NaN, Infinity])("rejects invalid tax %s", (tax) => {
		expect(() => calculateInvoiceAmounts([{ quantity: 1, unitPrice: 100 }], tax)).toThrow(RangeError);
	});

	it("rejects line, subtotal, and final total overflow", () => {
		const largest = { quantity: 1, unitPrice: Number.MAX_SAFE_INTEGER };
		expect(() => calculateInvoiceAmounts([{ ...largest, quantity: 2 }])).toThrow(RangeError);
		expect(() => calculateInvoiceAmounts([largest, largest])).toThrow(RangeError);
		expect(() => calculateInvoiceAmounts([largest], 100)).toThrow(RangeError);
	});

	it("converts dollar unit prices to cents before calculating draft lines", () => {
		const draft = prepareInvoiceDraft([{ description: "hour", quantity: 2, unitPrice: 19.985 }], 0);
		expect(draft?.items[0].unitPrice).toBe(1999);
		expect(draft?.amounts.total).toBe(3998);
	});

	it.each([
		{ quantity: undefined, unitPrice: 19.99 },
		{ quantity: 0.5, unitPrice: undefined },
		{ quantity: 0.5, unitPrice: -0.001 },
		{ quantity: 0, unitPrice: 19.99 },
		{ quantity: Infinity, unitPrice: 19.99 },
		{ quantity: 0.5, unitPrice: Infinity },
	])("returns an invalid projection for incomplete or invalid form values (%j)", (item) => {
		expect(prepareInvoiceDraft([{ description: "hour", ...item }], 0)).toBeNull();
	});

	it("keeps an empty or invalid tax draft unsaveable", () => {
		const items = [{ description: "hour", quantity: 0.5, unitPrice: 19.99 }];
		expect(prepareInvoiceDraft(items, undefined)).toBeNull();
		expect(prepareInvoiceDraft(items, 101)).toBeNull();
	});
});
