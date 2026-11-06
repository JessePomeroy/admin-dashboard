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
	it.each(["Enter", " "])("leaves %j on the status select to the native control", (key) => {
		const onorderclick = vi.fn();
		const onupdatestatus = vi.fn();
		const component = mount(OrderTable, { target: document.body, props: { orders: [order()], onorderclick, onupdatestatus } });
		try {
			const select = document.querySelector<HTMLSelectElement>(".status-select")!;
			select.focus();
			const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
			select.dispatchEvent(event);
			expect(onorderclick).not.toHaveBeenCalled();
			expect(event.defaultPrevented).toBe(false);
			expect(document.activeElement).toBe(select);
			select.value = "printing";
			select.dispatchEvent(new Event("change", { bubbles: true }));
			expect(onupdatestatus).toHaveBeenCalledExactlyOnceWith("order-1", "printing");
			expect(onorderclick).not.toHaveBeenCalled();
		} finally { unmount(component); }
	});

	it.each(["Enter", " "])("opens details from the focused row with %j", (key) => {
		const onorderclick = vi.fn();
		const onupdatestatus = vi.fn();
		const selected = order();
		const component = mount(OrderTable, { target: document.body, props: { orders: [selected], onorderclick, onupdatestatus } });
		try {
			const row = document.querySelector<HTMLElement>(".order-row")!;
			row.focus();
			const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
			row.dispatchEvent(event);
			expect(event.defaultPrevented).toBe(true);
			expect(onorderclick).toHaveBeenCalledExactlyOnceWith(selected);
			expect(onupdatestatus).not.toHaveBeenCalled();
		} finally { unmount(component); }
	});

	it("retains pointer activation, nested-control suppression and non-activation keys", () => {
		const onorderclick = vi.fn();
		const onupdatestatus = vi.fn();
		const component = mount(OrderTable, { target: document.body, props: { orders: [order()], onorderclick, onupdatestatus } });
		try {
			const row = document.querySelector<HTMLElement>(".order-row")!;
			const select = document.querySelector<HTMLSelectElement>(".status-select")!;
			select.click();
			expect(onorderclick).not.toHaveBeenCalled();
			const event = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
			row.dispatchEvent(event);
			expect(event.defaultPrevented).toBe(false);
			expect(onorderclick).not.toHaveBeenCalled();
			row.click();
			expect(onorderclick).toHaveBeenCalledOnce();
		} finally { unmount(component); }
	});

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
