import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import OrderTable from "../src/lib/pages/orders/OrderTable.svelte";
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

afterEach(() => {
	document.body.innerHTML = "";
});

describe("OrderTable", () => {
	it("shows pending fee state without an amount", () => {
		const component = mount(OrderTable, {
			target: document.body,
			props: {
				orders: [order({ stripeFeeCaptureStatus: "pending" })],
				onorderclick: vi.fn(),
				onupdatestatus: vi.fn(),
			},
		});

		expect(document.querySelector(".fee-state")?.textContent).toBe("pending");
		expect(document.querySelector(".td-total")?.textContent).toBe("$100.00 USD");
		unmount(component);
	});

	it("shows unknown currency as raw minor units", () => {
		const component = mount(OrderTable, {
			target: document.body,
			props: {
				orders: [order({ currency: null })],
				onorderclick: vi.fn(),
				onupdatestatus: vi.fn(),
			},
		});

		expect(document.querySelector(".td-total")?.textContent).toBe(
			"10000 minor units (currency unavailable)",
		);
		unmount(component);
	});
});
