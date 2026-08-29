import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PortfolioGalleriesPage from "../src/lib/pages/editor/PortfolioGalleriesPage.svelte";
import PortfolioGalleryPage from "../src/lib/pages/editor/PortfolioGalleryPage.svelte";

const mocks = vi.hoisted(() => {
	const mutation = vi.fn(async () => ({ revisionId: "saved-revision" }));
	return {
		mutation,
		publishingEnabled: true,
		previewEnabled: true,
		refs: {
			listForEditor: { name: "portfolio:listForEditor" },
			getEditorState: { name: "portfolio:getEditorState" },
			saveDraft: { name: "portfolio:saveDraft" },
			reorder: { name: "portfolio:reorder" },
			listMediaAssets: { name: "portfolio:listMediaAssets" },
			getPlacedMediaAssets: { name: "portfolio:getPlacedMediaAssets" },
			registerReadyWebAsset: { name: "portfolio:registerReadyWebAsset" },
		},
		publishRef: { name: "portfolio:publish" },
	};
});

vi.mock("convex-svelte", () => ({
	useQuery: (ref: { name?: string }) => {
		if (ref.name === "portfolio:listForEditor") {
			return {
				data: [{
					galleryId: "gallery-1",
					slug: "selected-work",
					portfolioOrder: 0,
					isPublished: true,
					draft: {
						revisionId: "published-revision",
						title: "Selected work",
						description: null,
						slug: "selected-work",
						placementCount: 1,
						checksum: "same",
						createdAt: 1,
					},
					published: {
						revisionId: "published-revision",
						title: "Selected work",
						description: null,
						slug: "selected-work",
						placementCount: 1,
						checksum: "same",
						createdAt: 1,
					},
					updatedAt: 1,
				}],
			};
		}
		if (ref.name === "portfolio:getEditorState") {
			const revision = {
				revisionId: "published-revision",
				title: "Selected work",
				description: "Portraits",
				slug: "selected-work",
				placements: [],
			};
			return {
				data: {
					galleryId: "gallery-1",
					slug: "selected-work",
					isPublished: true,
					draft: revision,
					published: revision,
				},
			};
		}
		if (ref.name === "portfolio:listMediaAssets") {
			return { data: { page: [], isDone: true, continueCursor: null } };
		}
		if (ref.name === "portfolio:getPlacedMediaAssets") return { data: [] };
		return { data: undefined };
	},
	useConvexClient: () => ({ mutation: mocks.mutation }),
}));

vi.mock("../src/lib/adminClient", () => ({
	useAdminClient: () => ({ mutation: mocks.mutation }),
}));

vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({
		siteUrl: "https://site.example",
		siteName: "test site",
		fromEmail: "test@example.com",
		isCreator: true,
		api: {
			portfolioEditor: {
				...mocks.refs,
				...(mocks.publishingEnabled ? { publish: mocks.publishRef } : {}),
			},
		},
		editor: {
			portfolio: {
				mediaBaseUrl: "https://media.example",
				...(mocks.previewEnabled ? { previewEndpoint: "/api/admin/portfolio/preview" } : {}),
			},
		},
	}),
}));

const components: ReturnType<typeof mount>[] = [];

async function mountList() {
	components.push(mount(PortfolioGalleriesPage, { target: document.body }));
	await tick();
}

async function mountDetail() {
	components.push(mount(PortfolioGalleryPage, {
		target: document.body,
		props: { galleryId: "gallery-1" },
	}));
	await tick();
	await tick();
}

function buttonLabels() {
	return Array.from(document.querySelectorAll("button"), (button) => button.textContent?.trim());
}

describe("Portfolio editor capability modes", () => {
	beforeEach(() => {
		mocks.mutation.mockClear();
		mocks.publishingEnabled = true;
		mocks.previewEnabled = true;
		localStorage.clear();
	});

	afterEach(() => {
		for (const component of components.splice(0)) unmount(component);
		document.body.innerHTML = "";
	});

	it("retains the public collection language and statuses for publish-capable hosts", async () => {
		await mountList();

		expect(document.body.textContent).toContain(
			"Public galleries, their order, and whether each one is ready for visitors.",
		);
		expect(document.querySelector(".status")?.textContent).toContain("published");
		(document.querySelector(".new-gallery") as HTMLButtonElement).click();
		await tick();
		expect(buttonLabels()).toContain("create unpublished gallery");
		expect(document.body.textContent).toContain("The public site follows this deliberate order.");
	});

	it("presents every collection record as a private draft when publish is absent", async () => {
		mocks.publishingEnabled = false;
		await mountList();

		expect(document.body.textContent).toContain(
			"Gallery drafts, their saved order, and the images prepared for a future public rollout.",
		);
		expect(document.querySelector(".status")?.textContent).toContain("draft");
		(document.querySelector(".new-gallery") as HTMLButtonElement).click();
		await tick();
		expect(buttonLabels()).toContain("create gallery draft");
		expect(document.body.textContent).toContain("This deliberate order is saved with the private drafts.");
		expect(document.body.textContent).not.toContain("The public site follows this deliberate order.");
	});

	it("keeps publish behavior unchanged when the capability is present", async () => {
		mocks.previewEnabled = false;
		await mountDetail();

		expect(document.body.textContent).toContain(
			"Publishing makes the current saved revision available to the public site immediately.",
		);
		expect(buttonLabels()).toContain("publish");
		expect(buttonLabels()).not.toContain("preview");
		expect(document.querySelector("#publish-review-heading")?.textContent).toBe("publishing review");
		expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe("published");
	});

	it("keeps preview and draft editing while removing publication semantics in staging mode", async () => {
		mocks.publishingEnabled = false;
		await mountDetail();

		expect(document.body.textContent).toContain(
			"Saved work remains in this editor until publishing is connected.",
		);
		expect(buttonLabels()).toContain("preview");
		expect(buttonLabels()).not.toContain("publish");
		expect(document.querySelector("#publish-review-heading")).toBeNull();
		expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe("draft saved");
		expect(document.body.textContent).toContain("Use the arrow controls to set their saved order.");
		expect(document.body.textContent).not.toContain("available to the public site immediately");
	});

	it("keeps collection context beside the selected gallery and marks the current record", async () => {
		await mountDetail();

		expect(document.querySelector(".portfolio-workbench.has-selection")).not.toBeNull();
		expect(document.querySelector('.gallery-list a[aria-current="page"]')?.textContent)
			.toContain("Selected work");
		expect(document.querySelector('.document-pane[aria-label="Portfolio gallery"]')).not.toBeNull();
	});

	it("filters the collection and opens the bounded new-gallery dialog", async () => {
		await mountList();
		const search = document.querySelector('input[type="search"]') as HTMLInputElement;
		search.value = "missing gallery";
		search.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(document.body.textContent).toContain("No galleries match this view.");

		(document.querySelector(".new-gallery") as HTMLButtonElement).click();
		await tick();
		expect(document.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
		expect(document.querySelector("#create-gallery-heading")?.textContent).toBe("new gallery");
	});
});
