import { describe, expect, it } from "vitest";
import {
	normalizeEditableQuotePackages,
	toEditableQuotePackages,
} from "../src/lib/pages/quotes/quotePackages";

describe("quote package form boundary", () => {
	it("normalizes dollar form values for persistence", () => {
		const included = ["six hours", "online gallery"];
		const normalized = normalizeEditableQuotePackages([
			{
				name: "essential",
				description: "coverage",
				price: 12.345,
				included,
			},
			{
				name: "simple",
				description: "",
				price: 0,
				included: [],
			},
		]);

		expect(normalized).toEqual([
			{
				name: "essential",
				description: "coverage",
				price: 1235,
				included,
			},
			{
				name: "simple",
				description: undefined,
				price: 0,
				included: undefined,
			},
		]);
		expect(normalized[0].included).not.toBe(included);
	});

	it("creates editable dollar values without sharing included arrays", () => {
		const included = ["album"];
		const editable = toEditableQuotePackages([
			{
				name: "heirloom",
				price: 250050,
				included,
			},
		]);

		expect(editable).toEqual([
			{
				name: "heirloom",
				description: "",
				price: 2500.5,
				included,
			},
		]);
		expect(editable[0].included).not.toBe(included);
	});
});
