import { createRawSnippet, mount, tick, unmount } from "svelte";
import { writable } from "svelte/store";
import { afterEach, expect, it, vi } from "vitest";
import AdminLayout from "../src/lib/components/AdminLayout.svelte";
import Harness from "./ModalLifecycleHarness.svelte";

vi.hoisted(() => { window.localStorage.setItem("theme", "light"); });
const page = writable({ url: new URL("https://fixture.invalid/admin") });
vi.mock("$app/stores", () => ({ get page() { return page; } }));
vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({ siteName: "Fixture admin", siteUrl: "https://fixture.invalid", api: { siteEditor: {} }, editor: { siteSettings: true } }),
}));
vi.mock("../src/lib/adminClient", () => ({ useAdminClient: () => ({ mutation: vi.fn() }) }));
vi.mock("convex-svelte", () => ({ useQuery: vi.fn() }));
let layout: ReturnType<typeof mount> | undefined;
let harness: ReturnType<typeof mount<typeof Harness>> | undefined;
afterEach(async () => {
	if (harness) await unmount(harness);
	if (layout) await unmount(layout);
	harness = undefined;
	layout = undefined;
	document.body.replaceChildren();
	document.body.style.overflow = "";
});

for (const editor of [false, true]) {
	it(`restores drawer overflow before a ${editor ? "editor" : "standard"} page opens a modal`, async () => {
		page.set({ url: new URL(editor ? "https://fixture.invalid/admin/editor" : "https://fixture.invalid/admin") });
		document.body.style.overflow = "scroll";
		const children = createRawSnippet(() => ({ render: () => '<div id="modal-page"></div>' }));
		layout = mount(AdminLayout, { target: document.body, props: { children, data: { adminSession: { status: "unauthenticated" } } } });
		await tick();
		harness = mount(Harness, { target: document.querySelector("#modal-page")! });
		await tick();
		document.querySelector<HTMLButtonElement>(editor ? '[aria-label="toggle editor sections"]' : '[aria-label="Toggle menu"]')!.click();
		await tick();
		expect(document.body.style.overflow).toBe("hidden");
		if (editor) page.set({ url: new URL("https://fixture.invalid/admin") });
		else document.querySelector<HTMLAnchorElement>('.sidebar-nav a[href="#"]')!.click();
		await tick();
		expect(document.body.style.overflow).toBe("scroll");
		const open = [...document.querySelectorAll("button")].find(button => button.textContent === "open admin")!;
		open.focus(); open.click();
		await tick();
		expect(document.body.style.overflow).toBe("hidden");
		document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
		await tick();
		expect(document.body.style.overflow).toBe("scroll");
		expect(document.activeElement).toBe(open);
	});
}
