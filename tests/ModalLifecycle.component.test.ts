import { mount, tick, unmount } from "svelte";
import { afterEach, expect, it, vi } from "vitest";
import Harness from "./ModalLifecycleHarness.svelte";
import { getToasts, removeToast } from "../src/lib/toast";

let component: ReturnType<typeof mount<typeof Harness>> | undefined;
afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	for (const toast of getToasts()) removeToast(toast.id);
	document.body.innerHTML = "";
	document.body.style.overflow = "";
});
function button(label: string) {
	return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
		(element) => element.textContent?.trim() === label || element.getAttribute("aria-label") === label,
	)!;
}
async function click(label: string) {
	const target = button(label);
	target.focus();
	target.click();
	await tick();
	return target;
}
function key(key: string, shiftKey = false) {
	const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
	document.activeElement!.dispatchEvent(event);
	return event;
}
async function start() {
	component = mount(Harness, { target: document.body });
	await tick();
	return component;
}

it("owns focus and scroll only for its mounted lifetime and refreshes its close callback", async () => {
	const harness = await start();
	document.body.style.overflow = "clip";
	const opener = await click("open admin");
	expect(document.body.style.overflow).toBe("hidden");
	expect(document.activeElement).toBe(button("Close dialog"));
	harness.replaceCloseCallback();
	await tick();
	expect(document.activeElement).toBe(button("Close dialog"));
	key("Escape");
	await tick();
	expect(document.querySelector("output")!.textContent).toBe("updated");
	expect(document.querySelector('[role="dialog"]')).toBeNull();
	expect(document.activeElement).toBe(opener);
	expect(document.body.style.overflow).toBe("clip");
	await click("open admin");
	await unmount(harness);
	component = undefined;
	expect(document.body.style.overflow).toBe("clip");
});

it("only lets the current nested owner wrap Tab or dismiss on Escape", async () => {
	await start();
	const opener = await click("open admin");
	const nestedOpener = await click("open nested picker");
	expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
	expect(document.activeElement).toBe(button("Close media picker"));
	key("Tab", true);
	expect(document.activeElement).toBe(button("next"));
	key("Tab");
	expect(document.activeElement).toBe(button("Close media picker"));
	key("Escape");
	await tick();
	expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
	expect(document.activeElement).toBe(nestedOpener);
	expect(document.body.style.overflow).toBe("hidden");
	key("Escape");
	await tick();
	expect(document.querySelector('[role="dialog"]')).toBeNull();
	expect(document.activeElement).toBe(opener);
	expect(document.body.style.overflow).toBe("");
});

it("retains separate backdrop policies and does not dismiss from content clicks", async () => {
	await start();
	await click("open admin");
	document.querySelector<HTMLElement>(".modal-content")!.click();
	await tick();
	expect(document.querySelector(".modal-overlay")).not.toBeNull();
	document.querySelector<HTMLElement>(".modal-overlay")!.click();
	await tick();
	expect(document.querySelector(".modal-overlay")).toBeNull();
	await click("open picker");
	document.querySelector<HTMLElement>(".backdrop")!.click();
	document.querySelector<HTMLElement>(".picker")!.click();
	await tick();
	expect(document.querySelector(".picker")).not.toBeNull();
	await click("Close media picker");
	expect(document.querySelector(".picker")).toBeNull();
});

it("recovers paging-disabled focus without stealing deliberate toast or recovery-panel focus", async () => {
	await start();
	await click("open admin");
	await click("show save error");
	const dismiss = button("Dismiss");
	dismiss.focus();
	expect(key("Tab").defaultPrevented).toBe(false);
	expect(document.activeElement).toBe(dismiss);
	const recovery = document.querySelector<HTMLElement>('[aria-label="Recovery panel"]')!;
	recovery.focus();
	expect(key("Tab").defaultPrevented).toBe(false);
	expect(document.activeElement).toBe(recovery);
	await click("open nested picker");
	await click("next");
	expect(button("next").disabled).toBe(true);
	key("Tab");
	expect(document.activeElement).toBe(button("Close media picker"));
});

it("respects child-consumed Escape and removes its keyboard listener on teardown", async () => {
	const harness = await start();
	await click("open admin");
	document.querySelector<HTMLInputElement>('input[aria-label="Consumes Escape"]')!.focus();
	key("Escape");
	await tick();
	expect(document.querySelector(".modal-overlay")).not.toBeNull();
	await unmount(harness);
	component = undefined;
	const listener = vi.fn();
	window.addEventListener("keydown", listener);
	try {
		expect(key("Escape").defaultPrevented).toBe(false);
		expect(listener).toHaveBeenCalledOnce();
	} finally {
		window.removeEventListener("keydown", listener);
	}
});

it("skips disconnected openers and preserves a pre-existing external scroll lock", async () => {
	const harness = await start();
	document.body.style.overflow = "hidden";
	const opener = await click("open picker");
	opener.remove();
	harness.removePicker();
	await tick();
	expect(document.body.style.overflow).toBe("hidden");
	expect(document.querySelector(".picker")).toBeNull();
	expect(document.activeElement).toBe(document.body);
});

it("does not steal upper-owner focus when the lower owner is removed first", async () => {
	const harness = await start();
	document.body.style.overflow = "auto";
	const opener = await click("open admin");
	await click("open second admin");
	const currentFocus = document.activeElement;
	harness.removeAdmin();
	await tick();
	expect(document.activeElement).toBe(currentFocus);
	expect(document.body.style.overflow).toBe("hidden");
	key("Escape");
	await tick();
	expect(document.querySelector('[role="dialog"]')).toBeNull();
	expect(document.activeElement).toBe(opener);
	expect(document.body.style.overflow).toBe("auto");
});

it("recovers a removed focused control but keeps an ordinary content tab unhandled", async () => {
	await start();
	await click("open admin");
	const last = button("last admin control");
	last.focus();
	last.remove();
	expect(document.activeElement).toBe(document.body);
	expect(key("Tab").defaultPrevented).toBe(true);
	expect(document.activeElement).toBe(button("Close dialog"));
	expect(key("Tab").defaultPrevented).toBe(false);
});

it("falls back to the surviving owner when the upper opener became disabled", async () => {
	await start();
	await click("open admin");
	const opener = await click("open second admin");
	opener.disabled = true;
	key("Escape");
	await tick();
	expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
	expect(document.activeElement).toBe(button("Close dialog"));
});
