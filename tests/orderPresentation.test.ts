import { describe, expect, it } from "vitest";
import {
	buildOrdersCsv,
	getStripeFeeCapturePresentation,
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

describe("getStripeFeeCapturePresentation", () => {
	it("keeps pending fees and net revenue unknown", () => {
		expect(
			getStripeFeeCapturePresentation(
				order({
					stripeFeeCaptureStatus: "pending",
					stripeFeeCaptureAttempts: 1,
					stripeFeeCaptureNextAttemptAt: 123,
					stripeFeeCaptureError: "balance_transaction_not_ready",
				}),
			),
		).toMatchObject({
			tone: "pending",
			label: "pending",
			feeCents: null,
			netRevenueCents: null,
			nextAttemptAt: 123,
		});
	});

	it("treats a captured zero-dollar fee as a known amount", () => {
		expect(
			getStripeFeeCapturePresentation(
				order({
					stripeFees: 0,
					stripeFeeCaptureStatus: "captured",
					stripeFeeCaptureAttempts: 1,
				}),
			),
		).toMatchObject({
			tone: "captured",
			label: "captured",
			feeCents: 0,
			netRevenueCents: 10_000,
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
			feeCents: null,
			netRevenueCents: null,
		});
		expect(presentation.detail).toContain("Stripe could not be reached");
	});

	it("distinguishes legacy known fees from legacy unknown fees", () => {
		expect(
			getStripeFeeCapturePresentation(order({ stripeFees: 0 })),
		).toMatchObject({
			label: "captured (legacy)",
			feeCents: 0,
			netRevenueCents: 10_000,
		});
		expect(getStripeFeeCapturePresentation(order())).toMatchObject({
			label: "not tracked (legacy)",
			feeCents: null,
			netRevenueCents: null,
		});
	});
});

describe("buildOrdersCsv", () => {
	it("exports capture state and leaves unknown fee and net cells blank", () => {
		const csv = buildOrdersCsv([
			order({
				stripeFeeCaptureStatus: "pending",
				stripeFeeCaptureAttempts: 0,
			}),
		]);

		expect(csv.split("\n")[0]).toContain("Stripe Fee Capture");
		expect(csv.split("\n")[1]).toContain('"100.00","pending","",""');
	});

	it("exports known captured zero fees and net revenue", () => {
		const csv = buildOrdersCsv([
			order({ stripeFeeCaptureStatus: "captured", stripeFees: 0 }),
		]);

		expect(csv.split("\n")[1]).toContain(
			'"100.00","captured","0.00","100.00"',
		);
	});
});
