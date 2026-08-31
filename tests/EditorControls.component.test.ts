import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import EditorListbox from "../src/lib/pages/editor/EditorListbox.svelte";
import EditorSegmentedChoice from "../src/lib/pages/editor/EditorSegmentedChoice.svelte";

const components: ReturnType<typeof mount>[] = [];

afterEach(() => {
	for (const component of components.splice(0)) unmount(component);
	document.body.innerHTML = "";
});

describe("Editor product controls", () => {
	it("keeps a custom listbox anchored in the document and keyboard navigable", async () => {
		const onChange = vi.fn();
		components.push(mount(EditorListbox, {
			target: document.body,
			props: {
				id: "size-choice",
				label: "size",
				value: "8x10",
				options: [
					{ value: "4x6", label: "4×6" },
					{ value: "8x10", label: "8×10" },
					{ value: "11x14", label: "11×14" },
				],
				onChange,
			},
		}));

		const trigger = document.querySelector<HTMLButtonElement>("#size-choice-trigger")!;
		expect(trigger.getAttribute("role")).toBe("combobox");
		expect(trigger.getAttribute("aria-controls")).toBe("size-choice-options");
		trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		await tick();
		await Promise.resolve();
		const menu = document.querySelector<HTMLElement>("#size-choice-options")!;
		expect(menu.closest(".listbox-field")).not.toBeNull();
		expect(document.activeElement?.getAttribute("data-value")).toBe("8x10");
		expect(Array.from(menu.querySelectorAll("[role=option]"), (option) => option.getAttribute("tabindex")))
			.toEqual(["-1", "-1", "-1"]);

		document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
		expect(document.activeElement?.getAttribute("data-value")).toBe("11x14");
		(document.activeElement as HTMLButtonElement).click();
		await tick();
		await Promise.resolve();
		expect(onChange).toHaveBeenCalledWith("11x14");
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		expect(document.activeElement).toBe(trigger);

		trigger.click();
		await tick();
		await Promise.resolve();
		document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await tick();
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
	});

	it("uses one checked native radio for each segmented choice", async () => {
		const onChange = vi.fn();
		components.push(mount(EditorSegmentedChoice, {
			target: document.body,
			props: {
				id: "sale-choice",
				label: "sale availability",
				value: "available",
				options: [
					{ value: "available", label: "available" },
					{ value: "unavailable", label: "not for sale" },
				],
				onChange,
			},
		}));

		const radios = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
		expect(radios).toHaveLength(2);
		expect(radios.filter(({ checked }) => checked)).toHaveLength(1);
		radios[1]?.click();
		await tick();
		expect(onChange).toHaveBeenCalledWith("unavailable");
	});
});
