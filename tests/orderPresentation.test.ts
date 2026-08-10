import { describe, expect, it } from "vitest";
import {
	buildOrdersCsv,
	formatStripeMinorUnits,
	getStripeFeeCapturePresentation,
	groupGrossPayments,
	type AdminOrder,
} from "../src/lib/pages/orders/orderPresentation";

function order(overrides: Partial<AdminOrder> = {}): AdminOrder {
	return {
		_id: "order-1",
		orderNumber: "AR-1001",
		createdAt: "2026-07-12T12:00:00.000Z",
		customerEmail: "client@example.com",
		customerName: "Client Name",
		total: 10_000,
		status: "new",
		currency: "usd",
		items: [{ productName: "Print", quantity: 1, price: 10_000 }],
		shippingAddress: null,
		notes: "",
		...overrides,
	};
}

const providerProvenanceV1 = {
	stripeFeeChargeId: "ch_verified",
	stripeFeeBalanceTransactionId: "txn_verified",
	stripeFeeCapturedAt: 1_720_000_000_000,
	stripeFeeProvenanceVersion: 1,
} as const;

describe("getStripeFeeCapturePresentation", () => {
	it("keeps pending fees and derived amounts unknown", () => {
		expect(
			getStripeFeeCapturePresentation(
				order({
					...providerProvenanceV1,
					stripeFeeCaptureStatus: "pending",
					stripeFeeCaptureAttempts: 1,
					stripeFeeCaptureNextAttemptAt: 123,
					stripeFeeCaptureError: "balance_transaction_not_ready",
				}),
			),
		).toMatchObject({
			tone: "pending",
			label: "pending",
			actualFeeMinorUnits: null,
			unverifiedRecordedFeeMinorUnits: null,
			grossLessActualFeeMinorUnits: null,
			nextAttemptAt: 123,
		});
	});

	it("treats a captured zero-dollar fee as a known amount", () => {
			expect(
			getStripeFeeCapturePresentation(
				order({
					...providerProvenanceV1,
					stripeFees: 0,
					stripeFeeCurrency: "usd",
					stripeFeeProvenance: "provider_verified",
					stripeFeeCaptureStatus: "captured",
					stripeFeeCaptureAttempts: 1,
				}),
			),
		).toMatchObject({
			tone: "captured",
			label: "provider verified",
			actualFeeMinorUnits: 0,
			unverifiedRecordedFeeMinorUnits: null,
			feeCurrency: "usd",
			grossLessActualFeeMinorUnits: 10_000,
		});
	});

	it("reports terminal failures without inventing fee amounts", () => {
		const presentation = getStripeFeeCapturePresentation(
			order({
				stripeFeeCaptureStatus: "failed",
				stripeFeeCaptureAttempts: 3,
				stripeFeeCaptureError: "stripe_api_error",
			}),
		);

		expect(presentation).toMatchObject({
			tone: "failed",
			label: "failed",
			actualFeeMinorUnits: null,
			grossLessActualFeeMinorUnits: null,
		});
		expect(presentation.detail).toContain("Stripe could not be reached");
	});

	it("presents normalized authority failures without provider details", () => {
		const presentation = getStripeFeeCapturePresentation(
			order({
				stripeFeeCaptureStatus: "failed",
				stripeFeeCaptureError: "authority_configuration_invalid",
			}),
		);

		expect(presentation.detail).toBe(
			"Fee verification authority is not configured safely.",
		);
		expect(presentation.actualFeeMinorUnits).toBeNull();
	});

	it("never promotes legacy recorded fees into actual fees or derived amounts", () => {
		expect(
			getStripeFeeCapturePresentation(
				order({
					stripeFees: 0,
					stripeFeeCurrency: "usd",
					stripeFeeCaptureStatus: "legacy_unverified",
					stripeFeeProvenance: "legacy_unverified",
				}),
			),
		).toMatchObject({
			label: "recorded (unverified)",
			actualFeeMinorUnits: null,
			unverifiedRecordedFeeMinorUnits: 0,
			grossLessActualFeeMinorUnits: null,
		});
		expect(getStripeFeeCapturePresentation(order())).toMatchObject({
			tone: "unknown",
			label: "unknown",
			actualFeeMinorUnits: null,
			unverifiedRecordedFeeMinorUnits: null,
			grossLessActualFeeMinorUnits: null,
		});
		expect(
			getStripeFeeCapturePresentation(
				order({ stripeFeeCaptureStatus: "legacy_unverified" }),
			),
		).toMatchObject({ label: "legacy unverified" });
	});

	it("flags incomplete provider-verification records without exposing a fee", () => {
		expect(
			getStripeFeeCapturePresentation(
				order({
					stripeFees: 325,
					stripeFeeProvenance: "provider_verified",
					stripeFeeCaptureStatus: "captured",
				}),
			),
		).toMatchObject({
			tone: "failed",
			label: "verification incomplete",
			actualFeeMinorUnits: null,
			unverifiedRecordedFeeMinorUnits: null,
		});
	});

	it("treats a captured amount without provider provenance as unverified", () => {
		expect(
			getStripeFeeCapturePresentation(
				order({
					stripeFees: 325,
					stripeFeeCurrency: "usd",
					stripeFeeCaptureStatus: "captured",
				}),
			),
		).toMatchObject({
			label: "recorded (unverified)",
			actualFeeMinorUnits: null,
			unverifiedRecordedFeeMinorUnits: 325,
			grossLessActualFeeMinorUnits: null,
		});
	});

	it("keeps canceled fees unavailable and terminal", () => {
		expect(
			getStripeFeeCapturePresentation(
				order({ stripeFeeCaptureStatus: "canceled", stripeFees: 325 }),
			),
		).toMatchObject({
			tone: "canceled",
			label: "canceled",
			actualFeeMinorUnits: null,
			unverifiedRecordedFeeMinorUnits: null,
			grossLessActualFeeMinorUnits: null,
		});
	});

	it("does not subtract provider-verified fees across currencies", () => {
		const presentation = getStripeFeeCapturePresentation(
			order({
				...providerProvenanceV1,
				stripeFees: 325,
				stripeFeeCurrency: "cad",
				stripeFeeProvenance: "provider_verified",
				stripeFeeCaptureStatus: "captured",
			}),
		);

		expect(presentation).toMatchObject({
			actualFeeMinorUnits: 325,
			feeCurrency: "cad",
			grossLessActualFeeMinorUnits: null,
		});
		expect(presentation.detail).toContain("currencies differ");
	});

	it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
		"rejects invalid recorded minor units (%s)",
		(stripeFees) => {
			expect(
				getStripeFeeCapturePresentation(
					order({
						...providerProvenanceV1,
						stripeFees,
						stripeFeeCurrency: "usd",
						stripeFeeProvenance: "provider_verified",
						stripeFeeCaptureStatus: "captured",
					}),
				),
			).toMatchObject({
				actualFeeMinorUnits: null,
				grossLessActualFeeMinorUnits: null,
			});
		},
	);
});

describe("buildOrdersCsv", () => {
	it("exports capture state and leaves unknown fee and net cells blank", () => {
		const csv = buildOrdersCsv([
			order({
				stripeFeeCaptureStatus: "pending",
				stripeFeeCaptureAttempts: 0,
			}),
		]);

		expect(csv.split("\n")[0]).toContain("Actual Stripe Processing Fee");
		expect(csv.split("\n")[0]).toContain("Unverified Recorded Fee");
		expect(csv.split("\n")[1]).toContain(
			'"10000","usd","pending","","","",""',
		);
	});

	it("exports provider-verified zero fees and an explicit derived subtraction", () => {
		const csv = buildOrdersCsv([
			order({
				...providerProvenanceV1,
				stripeFeeCaptureStatus: "captured",
				stripeFeeProvenance: "provider_verified",
				stripeFeeCurrency: "usd",
				stripeFees: 0,
			}),
		]);

		expect(csv.split("\n")[1]).toContain(
			'"10000","usd","provider verified","0","usd","","10000"',
		);
	});

	it("exports legacy recorded values only in the unverified column", () => {
		const csv = buildOrdersCsv([
			order({
				stripeFeeCaptureStatus: "legacy_unverified",
				stripeFeeProvenance: "legacy_unverified",
				stripeFeeCurrency: "usd",
				stripeFees: 325,
			}),
		]);

		expect(csv.split("\n")[1]).toContain(
			'"recorded (unverified)","","usd","325",""',
		);
	});
});

describe("formatStripeMinorUnits", () => {
	it("formats two-, zero-, and three-decimal minor-unit currencies", () => {
		expect(formatStripeMinorUnits(1234, "usd")).toBe("$12.34 USD");
		expect(formatStripeMinorUnits(1234, "jpy")).toBe("¥1,234 JPY");
		expect(formatStripeMinorUnits(1234, "bhd")).toBe("BHD 1.234 BHD");
		// Stripe's UGX backwards-compatibility rule uses two-decimal API amounts.
		expect(formatStripeMinorUnits(500, "ugx")).toBe("UGX\u00a05 UGX");
	});

	it("does not infer a currency when it is missing", () => {
		expect(formatStripeMinorUnits(1234, null)).toBe(
			"1234 minor units (currency unavailable)",
		);
	});
});

describe("groupGrossPayments", () => {
	it("groups safe totals by currency and excludes unknown currency", () => {
		expect(groupGrossPayments([
			{ currency: "usd", total: 1000 },
			{ currency: "eur", total: 2000 },
			{ currency: "usd", total: 3000 },
			{ currency: null, total: 4000 },
		])).toEqual({
			groups: [
				{ currency: "eur", totalMinorUnits: 2000, orderCount: 1 },
				{ currency: "usd", totalMinorUnits: 4000, orderCount: 2 },
			],
			unknownCurrencyOrderCount: 1,
			invalidAmountOrderCount: 0,
		});
	});

	it("drops a currency group whose safe-integer aggregate overflows", () => {
		expect(groupGrossPayments([
			{ currency: "usd", total: Number.MAX_SAFE_INTEGER },
			{ currency: "usd", total: 1 },
		])).toEqual({
			groups: [],
			unknownCurrencyOrderCount: 0,
			invalidAmountOrderCount: 2,
		});
	});
});
