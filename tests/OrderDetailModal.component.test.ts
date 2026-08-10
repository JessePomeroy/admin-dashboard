import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import OrderDetailModal from "../src/lib/pages/orders/OrderDetailModal.svelte";
import type { AdminOrder } from "../src/lib/pages/orders/orderPresentation";

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

function mountModal(value: AdminOrder) {
	return mount(OrderDetailModal, {
		target: document.body,
		props: {
			order: value,
			onclose: vi.fn(),
			onupdatestatus: vi.fn(),
			onsavenotes: vi.fn(async () => undefined),
		},
	});
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("OrderDetailModal", () => {
	it("shows pending capture without presenting an invented fee", () => {
		const component = mountModal(
			order({
				...providerProvenanceV1,
				stripeFeeCaptureStatus: "pending",
				stripeFeeCaptureAttempts: 1,
				stripeFeeCaptureError: "balance_transaction_not_ready",
			}),
		);

		expect(document.querySelector(".fee-status")?.textContent).toBe("pending");
		expect(document.querySelector(".fee-section")?.textContent).toContain(
			"balance transaction was not ready",
		);
		expect(document.querySelector(".fee-amounts")).toBeNull();
		unmount(component);
	});

	it("shows provider-verified fee and derived gross subtraction, including zero", () => {
		const component = mountModal(
			order({
				...providerProvenanceV1,
				stripeFeeCaptureStatus: "captured",
				stripeFeeProvenance: "provider_verified",
				stripeFeeCurrency: "usd",
				stripeFeeCaptureAttempts: 1,
				stripeFees: 0,
			}),
		);

		expect(document.querySelector(".fee-status")?.textContent).toBe(
			"provider verified",
		);
		expect(document.querySelector(".fee-amounts")?.textContent).toContain(
			"actual processing fee: $0.00 USD",
		);
		expect(document.querySelector(".fee-amounts")?.textContent).toContain(
			"gross less actual fee: $100.00 USD",
		);
		unmount(component);
	});

	it("shows legacy amounts only as unverified and never derives a net", () => {
		const component = mountModal(
			order({
				stripeFeeCaptureStatus: "legacy_unverified",
				stripeFeeProvenance: "legacy_unverified",
				stripeFees: 325,
			}),
		);

		expect(document.querySelector(".fee-status")?.textContent).toBe(
			"recorded (unverified)",
		);
		expect(document.querySelector(".fee-amounts")?.textContent).toContain(
			"recorded fee (unverified): 325 minor units (currency unavailable)",
		);
		expect(document.querySelector(".fee-amounts")?.textContent).not.toContain(
			"gross less",
		);
		unmount(component);
	});

	it("shows canceled capture without any fee amount", () => {
		const component = mountModal(
			order({ stripeFeeCaptureStatus: "canceled", stripeFees: 325 }),
		);

		expect(document.querySelector(".fee-status")?.textContent).toBe("canceled");
		expect(document.querySelector(".fee-section")?.textContent).toContain(
			"actual Stripe processing fee is unavailable",
		);
		expect(document.querySelector(".fee-amounts")).toBeNull();
		unmount(component);
	});
});
