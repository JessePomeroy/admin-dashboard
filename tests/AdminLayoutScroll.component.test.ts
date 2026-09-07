import { createRawSnippet, mount, tick, unmount } from "svelte";
import { writable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminLayout from "../src/lib/components/AdminLayout.svelte";

vi.hoisted(() => { window.localStorage.setItem("theme", "light"); });

const page = writable({ url: new URL("https://fixture.invalid/admin") });
vi.mock("$app/stores", () => ({ get page() { return page; } }));
vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({
		siteName: "Fixture admin",
		siteUrl: "https://fixture.invalid",
		api: { siteEditor: {} },
		editor: { siteSettings: true },
	}),
}));
vi.mock("../src/lib/adminClient", () => ({
	useAdminClient: () => ({ mutation: vi.fn() }),
}));
vi.mock("convex-svelte", () => ({ useQuery: vi.fn() }));

const children = createRawSnippet(() => ({ render: () => "<p>Admin content</p>" }));
let component: ReturnType<typeof mount> | undefined;

async function mountLayout(pathname: string) {
	page.set({ url: new URL(pathname, "https://fixture.invalid") });
	component = mount(AdminLayout, {
		target: document.body,
		props: { children, data: { adminSession: { status: "unauthenticated" } } },
	});
	await tick();
}

async function click(selector: string) {
	const element = document.querySelector<HTMLElement>(selector);
	expect(element).not.toBeNull();
	element!.click();
	await tick();
}

beforeEach(() => {
	document.body.style.overflow = "scroll";
});

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
	document.body.style.overflow = "";
});

for (const drawer of [
	{ name: "admin navigation", pathname: "/admin", toggle: 'button[aria-label="Toggle menu"]' },
	{ name: "editor sections", pathname: "/admin/editor", toggle: 'button[aria-label="toggle editor sections"]' },
]) {
	describe(drawer.name, () => {
		it("preserves existing overflow while closed and restores it after dismissal", async () => {
			await mountLayout(drawer.pathname);
			expect(document.body.style.overflow).toBe("scroll");

			await click(drawer.toggle);
			expect(document.body.style.overflow).toBe("hidden");
			await click('button[aria-label="Close menu"]');
			expect(document.body.style.overflow).toBe("scroll");

			document.body.style.overflow = "auto";
			await click(drawer.toggle);
			expect(document.body.style.overflow).toBe("hidden");
			await click(drawer.toggle);
			expect(document.body.style.overflow).toBe("auto");
		});

		it("restores existing overflow when unmounted with the drawer open", async () => {
			await mountLayout(drawer.pathname);
			await click(drawer.toggle);
			expect(document.body.style.overflow).toBe("hidden");

			await unmount(component!);
			component = undefined;
			expect(document.body.style.overflow).toBe("scroll");
		});
	});
}

it("releases the admin drawer lock when a navigation link dismisses it", async () => {
	await mountLayout("/admin");
	await click('button[aria-label="Toggle menu"]');
	expect(document.body.style.overflow).toBe("hidden");
	await click('.sidebar-nav a[href="#"]');
	expect(document.body.style.overflow).toBe("scroll");
});

it("releases the editor drawer lock when navigation leaves the editor", async () => {
	await mountLayout("/admin/editor");
	await click('button[aria-label="toggle editor sections"]');
	expect(document.body.style.overflow).toBe("hidden");
	page.set({ url: new URL("https://fixture.invalid/admin") });
	await tick();
	expect(document.body.style.overflow).toBe("scroll");
	expect(document.querySelector('button[aria-label="Close menu"]')).toBeNull();
});
