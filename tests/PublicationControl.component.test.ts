import { mount, tick, unmount } from "svelte";
import { afterEach, expect, it, vi } from "vitest";
import PublicationControl from "../src/lib/pages/editor/PublicationControl.svelte";

let component: ReturnType<typeof mount> | undefined;
afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

function button(label: string) {
	const element = [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === label);
	if (!element) throw new Error(`Missing button: ${label}`);
	return element;
}

it("publishes an unpublished item once and waits for the request to settle", async () => {
	let finish!: () => void;
	const onpublish = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
	component = mount(PublicationControl, { target: document.body, props: { published: false, onpublish } });
	const publish = button("publish");
	publish.click();
	publish.click();
	await tick();
	expect(onpublish).toHaveBeenCalledTimes(1);
	expect(button("publishing…").disabled).toBe(true);
	expect(document.querySelector(".publication-status")?.textContent).toBe("unpublished");
	finish();
	await tick();
	await vi.waitFor(() => expect(button("publish").disabled).toBe(false));
});

it("confirms unpublish, supports cancellation, and keeps it separate from publish", async () => {
	const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(false);
	const onpublish = vi.fn(async () => {});
	const onunpublish = vi.fn(async () => {});
	component = mount(PublicationControl, { target: document.body, props: { published: true, item: "post", onpublish, onunpublish } });
	expect(document.querySelectorAll("button")).toHaveLength(1);
	button("unpublish").click();
	expect(onunpublish).not.toHaveBeenCalled();
	confirm.mockReturnValue(true);
	button("unpublish").click();
	await tick();
	expect(onunpublish).toHaveBeenCalledTimes(1);
	expect(onpublish).not.toHaveBeenCalled();
	expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining("Your saved content stays here"));
	await vi.waitFor(() => expect(button("unpublish").hasAttribute("aria-pressed")).toBe(false));
});

it("offers both actions for a live item with draft changes, with Escape focus recovery", async () => {
	vi.spyOn(globalThis, "confirm").mockReturnValue(true);
	const onpublish = vi.fn(async () => {});
	const onunpublish = vi.fn(async () => {});
	component = mount(PublicationControl, { target: document.body, props: { published: true, hasChanges: true, onpublish, onunpublish } });
	expect(document.querySelector(".publication-status")?.textContent).toBe("published · draft changes");
	await tick();
	const options = document.querySelector("details")!;
	options.open = true;
	window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
	expect(options.open).toBe(false);
	expect(document.activeElement).toBe(button("publish changes"));
	options.open = true;
	button("unpublish").click();
	await tick();
	expect(options.open).toBe(false);
	expect(onunpublish).toHaveBeenCalledTimes(1);
	expect(onpublish).not.toHaveBeenCalled();
});

it("does not invent unpublish for a page without that capability or actions for archived content", async () => {
	const onpublish = vi.fn(async () => {});
	component = mount(PublicationControl, { target: document.body, props: { published: true, onpublish } });
	expect(button("publish changes").disabled).toBe(true);
	expect(document.querySelector("details")).toBeNull();
	await unmount(component);
	component = mount(PublicationControl, { target: document.body, props: { published: false, archived: true, onpublish } });
	expect(document.querySelectorAll("button")).toHaveLength(0);
	expect(document.querySelector(".publication-status")?.textContent).toBe("archived");
});
