import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SiteSettingsPage from "../src/lib/pages/editor/SiteSettingsPage.svelte";

const mocks = vi.hoisted(() => {
	const refs = {
		getSiteSettingsEditorState: { name: "siteEditor:getSiteSettingsEditorState" },
		saveSiteSettingsDraft: { name: "siteEditor:saveSiteSettingsDraft" },
		publishSiteSettings: { name: "siteEditor:publishSiteSettings" },
		discardSiteSettingsDraft: { name: "siteEditor:discardSiteSettingsDraft" },
	};
	return {
		mutation: vi.fn(async (ref: unknown) =>
			ref === refs.saveSiteSettingsDraft ? { revisionId: "saved-revision" } : null,
		),
		publishingEnabled: true,
		refs,
	};
});

vi.mock("convex-svelte", () => ({
	useQuery: () => ({
		data: {
			documentId: "site-settings",
			draft: {
				revisionId: "draft-revision",
				schemaVersion: 1,
				payload: {
					artistName: "Maggie",
					siteTitle: "Reflecting Pool",
					tagline: "Photography in motion",
					socialLinks: [],
					seoDescription: "Photography by Maggie.",
				},
				source: "admin",
				createdAt: 1,
			},
			published: null,
			updatedAt: 1,
			publishedAt: null,
		},
	}),
}));

vi.mock("../src/lib/adminClient", () => ({
	useAdminClient: () => ({ mutation: mocks.mutation }),
}));

vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({
		siteUrl: "https://site.example",
		siteName: "test site",
		api: {
			siteEditor: {
				getSiteSettingsEditorState: mocks.refs.getSiteSettingsEditorState,
				saveSiteSettingsDraft: mocks.refs.saveSiteSettingsDraft,
				...(mocks.publishingEnabled
					? { publishSiteSettings: mocks.refs.publishSiteSettings }
					: {}),
				discardSiteSettingsDraft: mocks.refs.discardSiteSettingsDraft,
			},
		},
		editor: {
			siteSettings: { previewHref: "/preview/site-settings" },
		},
	}),
}));

let component: ReturnType<typeof mount> | undefined;

async function renderPage() {
	component = mount(SiteSettingsPage, { target: document.body });
	await tick();
	await tick();
}

function buttonLabels() {
	return Array.from(document.querySelectorAll("button"), (button) =>
		button.textContent?.trim(),
	);
}

async function changeArtistNameAndSubmit() {
	const artistName = document.querySelector<HTMLInputElement>(
		'label:has(input) input[maxlength="120"]',
	);
	if (!artistName) throw new Error("Artist name input did not render");
	artistName.value = "Margaret Helena";
	artistName.dispatchEvent(new Event("input", { bubbles: true }));
	await tick();
	document.querySelector<HTMLFormElement>("form")?.requestSubmit();
}

describe("Site settings editor capability modes", () => {
	beforeEach(() => {
		mocks.mutation.mockClear();
		mocks.publishingEnabled = true;
		localStorage.clear();
	});

	afterEach(() => {
		if (component) unmount(component);
		component = undefined;
		document.body.innerHTML = "";
		vi.restoreAllMocks();
	});

	it("retains preview, validation, save, and publish behavior for publish-capable hosts", async () => {
		await renderPage();

		expect(document.querySelector<HTMLAnchorElement>('a[href="/preview/site-settings"]'))
			.not.toBeNull();
		expect(buttonLabels()).toContain("publish");

		await changeArtistNameAndSubmit();
		await vi.waitFor(() => {
			expect(mocks.mutation).toHaveBeenCalledWith(
				mocks.refs.publishSiteSettings,
				expect.objectContaining({
					siteUrl: "https://site.example",
					draftRevisionId: "saved-revision",
				}),
			);
		});
		expect(mocks.mutation.mock.calls[0]?.[0]).toBe(
			mocks.refs.saveSiteSettingsDraft,
		);
	});

	it("keeps private draft saving while removing preview and publication controls", async () => {
		mocks.publishingEnabled = false;
		await renderPage();
		const confirmDiscard = vi.spyOn(window, "confirm").mockReturnValue(false);

		expect(document.body.textContent).toContain(
			"The name and short description prepared for a future public rollout.",
		);
		expect(document.body.textContent).not.toContain(
			"The public name and short description of this site.",
		);
		expect(document.querySelector('a[href="/preview/site-settings"]')).toBeNull();
		expect(buttonLabels()).not.toContain("publish");
		document.querySelector<HTMLButtonElement>("button.secondary")?.click();
		expect(confirmDiscard).toHaveBeenCalledWith(
			"Discard this private draft and reset the form?",
		);

		await changeArtistNameAndSubmit();
		await vi.waitFor(() => {
			expect(mocks.mutation).toHaveBeenCalledTimes(1);
		});
		expect(mocks.mutation).toHaveBeenCalledWith(
			mocks.refs.saveSiteSettingsDraft,
			expect.objectContaining({ siteUrl: "https://site.example" }),
		);
		expect(mocks.mutation).not.toHaveBeenCalledWith(
			mocks.refs.publishSiteSettings,
			expect.anything(),
		);
	});

	it("uses neutral conflict guidance when a private local draft is restored", async () => {
		mocks.publishingEnabled = false;
		localStorage.setItem(
			"admin:site-editor:site-settings:https://site.example",
			JSON.stringify({
				schemaVersion: 1,
				baseRevisionId: "older-revision",
				payload: {
					artistName: "Offline edit",
					siteTitle: "Reflecting Pool",
					tagline: "Photography in motion",
					socialLinks: [],
					seoDescription: "Photography by Maggie.",
				},
			}),
		);

		await renderPage();

		expect(document.querySelector('[role="alert"]')?.textContent).toContain(
			"Review or discard this draft before continuing.",
		);
		expect(document.body.textContent).not.toContain(
			"Review or discard this draft before publishing.",
		);
	});
});
