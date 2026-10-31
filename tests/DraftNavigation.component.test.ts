import type { BeforeNavigate } from "@sveltejs/kit";
import { mount, tick, unmount } from "svelte";
import { expect, it, vi } from "vitest";
import Harness from "./DraftNavigationHarness.svelte";
const hooks = vi.hoisted(() => ({
	navigate: undefined as ((navigation: BeforeNavigate) => void) | undefined,
}));
vi.mock("$app/navigation", () => ({
	beforeNavigate: (callback: (navigation: BeforeNavigate) => void) => {
		hooks.navigate = callback;
	},
}));
it("blocks a canceled navigation and unload while dirty, then releases both after saving", async () => {
	const component = mount(Harness, { target: document.body });
	await tick();
	const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(false);
	const cancel = vi.fn();
	const navigation = { willUnload: false, cancel } as BeforeNavigate;
	hooks.navigate?.(navigation);
	expect(cancel).toHaveBeenCalledOnce();
	const event = new Event("beforeunload", { cancelable: true });
	window.dispatchEvent(event);
	expect(event.defaultPrevented).toBe(true);
	document.querySelector("button")!.click();
	await tick();
	confirm.mockClear();
	cancel.mockClear();
	hooks.navigate?.(navigation);
	expect(cancel).not.toHaveBeenCalled();
	expect(confirm).not.toHaveBeenCalled();
	const saved = new Event("beforeunload", { cancelable: true });
	window.dispatchEvent(saved);
	expect(saved.defaultPrevented).toBe(false);
	await unmount(component);
	confirm.mockRestore();
	document.body.replaceChildren();
});
