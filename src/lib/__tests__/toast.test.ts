import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addToast, getToasts, removeToast } from "../toast";

describe("toast store", () => {
	beforeEach(() => {
		// Clear all toasts
		for (const t of getToasts()) {
			removeToast(t.id);
		}
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("adds a toast with default error type", () => {
		addToast("Something failed");
		const toasts = getToasts();
		expect(toasts).toHaveLength(1);
		expect(toasts[0].message).toBe("Something failed");
		expect(toasts[0].type).toBe("error");
	});

	it("adds a toast with specific type", () => {
		addToast("Saved!", "success");
		expect(getToasts()[0].type).toBe("success");
	});

	it("supports multiple concurrent toasts", () => {
		addToast("Error 1");
		addToast("Error 2");
		addToast("Saved!", "success");
		expect(getToasts()).toHaveLength(3);
	});

	it("removes a toast by id", () => {
		addToast("Will be removed");
		const id = getToasts()[0].id;
		removeToast(id);
		expect(getToasts()).toHaveLength(0);
	});

	it("auto-dismisses after 5 seconds", () => {
		addToast("Temporary");
		expect(getToasts()).toHaveLength(1);

		vi.advanceTimersByTime(4999);
		expect(getToasts()).toHaveLength(1);

		vi.advanceTimersByTime(1);
		expect(getToasts()).toHaveLength(0);
	});

	it("assigns unique ids to each toast", () => {
		addToast("First");
		addToast("Second");
		const toasts = getToasts();
		expect(toasts[0].id).not.toBe(toasts[1].id);
	});
});
