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
let resizeNavigation: (matches: boolean) => void;

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
	element!.focus();
	element!.click();
	await tick();
}

beforeEach(() => {
 let narrow = true;
 const changes = new EventTarget();
 vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
  get matches() { return query.includes("max-width") && narrow; },
  addEventListener: changes.addEventListener.bind(changes),
  removeEventListener: changes.removeEventListener.bind(changes),
 })));
 resizeNavigation = (matches) => { narrow = matches; changes.dispatchEvent(new Event("change")); };
 document.body.style.overflow = "scroll";
});

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
	document.body.style.overflow = "";
	vi.unstubAllGlobals();
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

for (const drawer of [
 { name: "admin", pathname: "/admin", toggle: 'button[aria-label="Toggle menu"]', panel: '.sidebar' },
 { name: "editor", pathname: "/admin/editor", toggle: 'button[aria-label="toggle editor sections"]', panel: '#editor-mobile-navigation' },
]) {
 it(`${drawer.name} drawer enters focus, traps Tab, closes on Escape and restores its opener`, async () => {
  await mountLayout(drawer.pathname);
  const opener = document.querySelector<HTMLElement>(drawer.toggle)!;
  await click(drawer.toggle);
  const panel = document.querySelector<HTMLElement>(drawer.panel)!;
  expect(panel.contains(document.activeElement)).toBe(true);
  const first = panel.querySelector<HTMLElement>('a[href],button')!;
  first.focus();
  first.dispatchEvent(new KeyboardEvent("keydown", {key:"Tab", shiftKey:true, bubbles:true, cancelable:true}));
  expect(panel.contains(document.activeElement)).toBe(true);
  expect(document.activeElement).not.toBe(first);
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape", bubbles:true, cancelable:true}));
  await tick();
  expect(opener.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(opener);
  expect(document.body.style.overflow).toBe("scroll");
 });
 it(`${drawer.name} drawer releases ownership when its mobile breakpoint is left`, async () => {
  await mountLayout(drawer.pathname);
  await click(drawer.toggle);
  resizeNavigation(false);
  await tick();
  expect(document.body.style.overflow).toBe("scroll");
  expect(document.querySelector('button[aria-label="Close menu"]')).toBeNull();
  resizeNavigation(true);
  await tick();
  expect(document.querySelector(drawer.toggle)?.getAttribute("aria-expanded")).toBe("false");
 });
}
it("closed mobile sidebar is inert, while the desktop sidebar remains available", async () => {
 await mountLayout("/admin");
 expect(document.querySelector<HTMLElement>('.sidebar')?.inert).toBe(true);
 resizeNavigation(false);
 await tick();
 expect(document.querySelector<HTMLElement>('.sidebar')?.inert).toBe(false);
});
