import { describe, expect, it } from "vitest";
import { getOrderStatsPresentation } from "../src/lib/pages/dashboard/orderStatsPresentation";

describe("getOrderStatsPresentation", () => {
	it("keeps the all-time claim for complete results", () => {
		expect(
			getOrderStatsPresentation({
				totalOrders: 128,
				isTruncated: false,
				scanLimit: 5000,
			}),
		).toEqual({
			scopeLabel: "all time",
			orderCountLabel: "128 orders",
			completenessNote: null,
		});
	});

	it("describes truncated revenue as a partial bounded window", () => {
		expect(
			getOrderStatsPresentation({
				totalOrders: 5000,
				isTruncated: true,
				scanLimit: 5000,
			}),
		).toEqual({
			scopeLabel: "latest 5,000 orders",
			orderCountLabel: "5,000 orders · partial total",
			completenessNote:
				"Gross payment metrics are based on the latest 5,000 orders.",
		});
	});

	it("treats legacy responses without completeness fields as complete", () => {
		expect(getOrderStatsPresentation({ totalOrders: 7 })).toEqual({
			scopeLabel: "all time",
			orderCountLabel: "7 orders",
			completenessNote: null,
		});
	});

	it("reports unavailable grouped totals and unknown-currency exclusions", () => {
		expect(
			getOrderStatsPresentation({
				totalOrders: 3,
				currencyGroupedTotalsAvailable: false,
				unknownCurrencyOrderCount: 2,
			}),
		).toEqual({
			scopeLabel: "all time",
			orderCountLabel: "3 orders",
			completenessNote:
				"Currency-grouped gross payment metrics are unavailable. 2 orders are excluded from monetary totals because payment currency is unavailable.",
		});
	});
});
