import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GalleriesPage from "../src/lib/pages/GalleriesPage.svelte";
import PlatformPage from "../src/lib/pages/PlatformPage.svelte";
import ClientDetailModal from "../src/lib/pages/platform/ClientDetailModal.svelte";

const mocks = vi.hoisted(() => ({
	mutation: vi.fn().mockResolvedValue("client-1"),
	client: {
		_id: "client-1", _creationTime: 1000,
		name: "Photographer", email: "artist@example.com", siteUrl: "example.com",
		tier: "basic", subscriptionStatus: "none", adminEmails: ["artist@example.com"],
		// Stale input must not restore a provider control or enter a mutation payload.
		sanityProjectId: "retired-project",
	},
}));

vi.mock("convex-svelte", () => ({ useQuery: () => ({ data: [mocks.client] }) }));
vi.mock("../src/lib/adminClient", () => ({ useAdminClient: () => ({ mutation: mocks.mutation }) }));
vi.mock("../src/lib/config", () => ({ getAdminConfig: () => ({
	api: { platform: { listAll: "listAll", createClient: "createClient", updateClient: "updateClient" } },
	// A JavaScript host may still pass a removed config field after upgrading.
	sanityStudioUrl: "https://retired.sanity.studio",
}) }));

const mounted: ReturnType<typeof mount>[] = [];
afterEach(async () => {
	for (const component of mounted.splice(0)) await unmount(component);
	document.body.innerHTML = "";
});
beforeEach(() => vi.clearAllMocks());

async function input(selector: string, value: string) {
	const field = document.querySelector<HTMLInputElement>(selector);
	if (!field) throw new Error(`Missing field: ${selector}`);
	field.value = value;
	field.dispatchEvent(new Event("input", { bubbles: true }));
	await tick();
}

async function submit() {
	const form = document.querySelector("form");
	if (!form) throw new Error("Missing client form");
	form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
	await tick();
}

async function edit() {
	const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === "edit");
	if (!button) throw new Error("Missing edit action");
	button.click();
	await tick();
}

describe("current platform and gallery controls", () => {
	it("edits supported fields without displaying or submitting historical provider metadata", async () => {
		const onsave = vi.fn();
		mounted.push(mount(ClientDetailModal, { target: document.body, props: {
			client: mocks.client, saving: false, onclose: vi.fn(), onsave,
			ontiertoggle: vi.fn(), onstatusupdate: vi.fn(),
		} }));
		await tick();
		expect(document.querySelector('a[href*="sanity"]')).toBeNull();
		await edit();
		expect(document.body.textContent).not.toMatch(/sanity/i);
		await input("#edit-name", "Updated photographer");
		await submit();
		expect(onsave).toHaveBeenCalledExactlyOnceWith({
			name: "Updated photographer", email: "artist@example.com", siteUrl: "example.com",
			tier: "basic", subscriptionStatus: "none", notes: undefined,
		});
	});

	it("keeps the platform table and edit mutation aligned with current client fields", async () => {
		mounted.push(mount(PlatformPage, { target: document.body, props: { data: {} } }));
		await tick();
		expect(document.querySelector(".modal-overlay")).toBeNull();
		expect([...document.querySelectorAll("button")].some(button => /add client/i.test(button.textContent ?? ""))).toBe(false);
		expect([...document.querySelectorAll("th")].map((cell) => cell.textContent)).toEqual([
			"name", "email", "site url", "tier", "subscription", "added",
		]);
		const row = document.querySelector<HTMLElement>("tbody tr");
		if (!row) throw new Error("Missing platform client");
		row.click();
		await tick();
		await edit();
		await input("#edit-name", "Updated photographer");
		await submit();
		expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith("updateClient", {
			clientId: "client-1", name: "Updated photographer", email: "artist@example.com",
			siteUrl: "example.com", tier: "basic", subscriptionStatus: "none", notes: undefined,
		});
	});

	it("keeps gallery viewing available without restoring a Studio link from old config", async () => {
		mounted.push(mount(GalleriesPage, { target: document.body, props: { data: {
			galleries: [{ _id: "gallery-1", title: "Selected work", slug: "selected-work", imageCount: 2 }],
			adminSession: { status: "authorized", email: "artist@example.com", tier: "full", isCreator: true },
		} } }));
		await tick();
		expect(document.querySelector('a[href="/gallery/selected-work"]')?.textContent?.trim()).toBe("view");
		expect(document.querySelector('a[href*="sanity"]')).toBeNull();
		expect(document.body.textContent).not.toContain("edit in studio");
	});
});
