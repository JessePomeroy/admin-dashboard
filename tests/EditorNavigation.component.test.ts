import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import EditorNavigation from "../src/lib/components/EditorNavigation.svelte";

afterEach(() => {
	document.body.innerHTML = "";
});

describe("EditorNavigation", () => {
	it("announces the workspace and marks Site settings as current", () => {
		const component = mount(EditorNavigation, {
			target: document.body,
			props: { pathname: "/admin/editor" },
		});

		expect(document.querySelector("aside")?.getAttribute("aria-label")).toBe(
			"Site editor navigation",
		);
		expect(document.querySelector('a[aria-current="page"]')?.textContent).toContain(
			"site settings",
		);
		unmount(component);
	});
});
