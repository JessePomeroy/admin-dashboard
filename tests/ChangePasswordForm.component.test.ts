import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChangePasswordForm from "../src/lib/components/ChangePasswordForm.svelte";

function enter(label: string, value: string) {
	const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
	if (!input) throw new Error(`Missing ${label} input`);
	input.value = value;
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function submit() {
	document.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
	await tick();
}

afterEach(() => {
	vi.useRealTimers();
	document.body.innerHTML = "";
});

describe("ChangePasswordForm", () => {
	it("submits both passwords and reports an authentication error", async () => {
		const changePassword = vi.fn(async () => ({ error: { message: "Current password is wrong" } }));
		const component = mount(ChangePasswordForm, {
			target: document.body,
			props: { changePassword, onSuccess: vi.fn() },
		});

		enter("Current password", "old-password");
		enter("New password", "new-password");
		await submit();

		expect(changePassword).toHaveBeenCalledWith({
			currentPassword: "old-password",
			newPassword: "new-password",
		});
		expect(document.querySelector('[role="alert"]')?.textContent).toBe("Current password is wrong");
		unmount(component);
	});

	it("shows success and closes after the existing delay", async () => {
		vi.useFakeTimers();
		const onSuccess = vi.fn();
		const component = mount(ChangePasswordForm, {
			target: document.body,
			props: { changePassword: vi.fn(async () => ({ error: null })), onSuccess },
		});

		enter("Current password", "old-password");
		enter("New password", "new-password");
		await submit();
		expect(document.querySelector('[role="status"]')?.textContent).toBe("password updated");

		vi.advanceTimersByTime(1500);
		expect(onSuccess).toHaveBeenCalledOnce();
		unmount(component);
	});
});
