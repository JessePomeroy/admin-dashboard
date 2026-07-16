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
			props: { pathname: "/admin/editor", siteSettingsEnabled: true },
		});

		expect(document.querySelector("aside")?.getAttribute("aria-label")).toBe(
			"Site editor navigation",
		);
		expect(document.querySelector('a[aria-current="page"]')?.textContent).toContain(
			"site settings",
		);
		unmount(component);
	});

	it("shows only configured modules and marks nested Pages routes as current", () => {
		const component = mount(EditorNavigation, {
			target: document.body,
			props: {
				pathname: "/admin/editor/pages/homepage-quote",
				siteSettingsEnabled: true,
				homepageQuoteEnabled: true,
				portfolioEnabled: true,
			},
		});

		expect(Array.from(document.querySelectorAll("a"), (item) => item.textContent?.trim())).toEqual([
			"site settings",
			"pages",
			"portfolio",
		]);
		expect(document.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
		expect(document.querySelector('a[aria-current="page"]')?.textContent).toContain(
			"pages",
		);
		unmount(component);
	});
});
