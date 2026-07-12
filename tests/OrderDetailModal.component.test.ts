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

	it("shows known captured fee and net amounts, including a zero fee", () => {
		const component = mountModal(
			order({
				stripeFeeCaptureStatus: "captured",
				stripeFeeCaptureAttempts: 1,
				stripeFees: 0,
			}),
		);

		expect(document.querySelector(".fee-status")?.textContent).toBe("captured");
		expect(document.querySelector(".fee-amounts")?.textContent).toContain(
			"fee: $0.00",
		);
		expect(document.querySelector(".fee-amounts")?.textContent).toContain(
			"net: $100.00",
		);
		unmount(component);
	});
});
