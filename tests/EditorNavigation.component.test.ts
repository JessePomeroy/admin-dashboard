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
				pagesEnabled: true,
				portfolioEnabled: true,
				productsEnabled: true,
				blogEnabled: true,
			},
		});

		expect(Array.from(document.querySelectorAll("a"), (item) => item.textContent?.trim())).toEqual([
			"portfolio",
			"products",
			"blog",
			"pages",
			"site settings",
		]);
		expect(document.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
		expect(document.querySelector('a[aria-current="page"]')?.textContent).toContain(
			"pages",
		);
		unmount(component);
	});

	it("marks nested Product routes as current and honors a host route", () => {
		const component = mount(EditorNavigation, {
			target: document.body,
			props: {
				pathname: "/admin/editor/catalog/item-1",
				productsEnabled: true,
				productsHref: "/admin/editor/catalog",
			},
		});

		const link = document.querySelector<HTMLAnchorElement>('a[aria-current="page"]');
		expect(link?.textContent).toContain("products");
		expect(link?.getAttribute("href")).toBe("/admin/editor/catalog");
		unmount(component);
	});

	it("does not show Products when the host capability is disabled", () => {
		const component = mount(EditorNavigation, {
			target: document.body,
			props: {
				pathname: "/admin/editor/products",
				portfolioEnabled: true,
			},
		});

		expect(Array.from(document.querySelectorAll("a"), (item) => item.textContent?.trim())).toEqual([
			"portfolio",
		]);
		unmount(component);
	});

	it("marks nested Blog routes as current", () => {
		const component = mount(EditorNavigation, {
			target: document.body,
			props: {
				pathname: "/admin/editor/blog/posts/doc-1",
				blogEnabled: true,
			},
		});

		expect(document.querySelector('a[aria-current="page"]')?.textContent).toContain(
			"blog",
		);
		unmount(component);
	});

	it("renders phone navigation as a separate closable Editor sheet", async () => {
		let dismissals = 0;
		const component = mount(EditorNavigation, {
			target: document.body,
			props: {
				pathname: "/admin/editor/pages/about",
				pagesEnabled: true,
				mobile: true,
				open: true,
				onDismiss: () => {
					dismissals += 1;
				},
			},
		});

		const sheet = document.querySelector("aside");
		expect(sheet?.id).toBe("editor-mobile-navigation");
		expect(sheet?.classList.contains("mobile")).toBe(true);
		expect(sheet?.classList.contains("open")).toBe(true);
		expect(sheet?.getAttribute("aria-hidden")).toBeNull();
		expect(document.querySelector("strong")?.textContent).toContain("editor");

		const close = document.querySelector<HTMLButtonElement>(
			'button[aria-label="close editor sections"]',
		);
		close?.click();
		await Promise.resolve();
		expect(dismissals).toBe(1);
		unmount(component);
	});

	it("keeps a closed phone sheet out of the accessibility tree", () => {
		const component = mount(EditorNavigation, {
			target: document.body,
			props: {
				pathname: "/admin/editor",
				siteSettingsEnabled: true,
				mobile: true,
			},
		});

		expect(document.querySelector("aside")?.getAttribute("aria-hidden")).toBe("true");
		unmount(component);
	});
});
