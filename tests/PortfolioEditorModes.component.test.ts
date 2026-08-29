import { readFileSync } from "node:fs";
import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PortfolioGalleriesPage from "../src/lib/pages/editor/PortfolioGalleriesPage.svelte";
import PortfolioGalleryPage from "../src/lib/pages/editor/PortfolioGalleryPage.svelte";

const portfolioWorkbenchSource = readFileSync(
	"src/lib/pages/editor/PortfolioWorkbench.svelte",
	"utf8",
);

const mocks = vi.hoisted(() => {
	const defaultGallery = {
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
	};
	const state = {
		failMutationName: "",
		queryFailures: new Set<string>(),
		galleries: [defaultGallery],
	};
	const mutation = vi.fn(async (ref: { name?: string }) => {
		if (ref.name === state.failMutationName) throw new Error("forced failure");
		return { revisionId: "saved-revision" };
	});
	return {
		mutation,
		state,
		defaultGallery,
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
		if (ref.name && mocks.state.queryFailures.has(ref.name)) {
			return { data: undefined, error: new Error("forced query failure"), isLoading: false };
		}
		if (ref.name === "portfolio:listForEditor") {
			return { data: mocks.state.galleries, error: undefined, isLoading: false };
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

async function settle() {
	await Promise.resolve();
	await tick();
	await Promise.resolve();
	await tick();
}

describe("Portfolio editor capability modes", () => {
	beforeEach(() => {
		mocks.mutation.mockClear();
		mocks.state.failMutationName = "";
		mocks.state.queryFailures.clear();
		mocks.state.galleries = [mocks.defaultGallery];
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
		expect(buttonLabels()).not.toContain("published");
		expect(buttonLabels()).not.toContain("changed");
		expect(document.body.textContent).toContain("This deliberate order is saved with the private drafts.");
		expect(document.body.textContent).not.toContain("The public site follows this deliberate order.");
		(document.querySelector('[aria-label="Close new gallery form"]') as HTMLButtonElement).click();
		await tick();
		const draftFilter = Array.from(document.querySelectorAll<HTMLButtonElement>(".filters button"))
			.find((item) => item.textContent === "draft");
		draftFilter?.click();
		await tick();
		expect(document.body.textContent).toContain("Clear search and choose all to change saved order.");
		expect(document.body.textContent).not.toContain("change public order");
	});

	it("retains 44px touch targets through the tablet and phone range", () => {
		expect(portfolioWorkbenchSource).toContain("@media (max-width: 768px)");
		expect(portfolioWorkbenchSource).toContain(
			".new-gallery, .filters button, .primary { min-height: 44px; }",
		);
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
		await tick();
		const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
		expect(dialog).not.toBeNull();
		expect((document.querySelector(".portfolio-workbench") as HTMLElement & { inert: boolean }).inert).toBe(true);
		expect(document.querySelector("#create-gallery-heading")?.textContent).toBe("new gallery");
		expect(document.activeElement).toBe(document.querySelector('input[aria-invalid="false"]'));
		const close = document.querySelector<HTMLButtonElement>('[aria-label="Close new gallery form"]');
		const submit = document.querySelector<HTMLButtonElement>(".create-panel .primary");
		close?.focus();
		dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
		expect(document.activeElement).toBe(submit);
		submit?.focus();
		dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
		expect(document.activeElement).toBe(close);
		document.querySelector('[role="dialog"]')?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		await tick();
		await tick();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(document.querySelector(".new-gallery"));
	});

	it("keeps focus inside the dialog while creation is pending", async () => {
		let resolveCreate: ((value: { productId?: string; revisionId: string }) => void) | undefined;
		mocks.mutation.mockImplementationOnce(() => new Promise((resolve) => {
			resolveCreate = resolve;
		}));
		await mountList();
		(document.querySelector(".new-gallery") as HTMLButtonElement).click();
		await settle();
		const title = document.querySelector('.create-panel input[maxlength="120"]') as HTMLInputElement;
		title.value = "Pending gallery";
		title.dispatchEvent(new Event("input", { bubbles: true }));
		const submit = document.querySelector<HTMLButtonElement>(".create-panel .primary");
		submit?.focus();
		submit?.click();
		await tick();
		expect(submit?.disabled).toBe(true);
		expect(document.activeElement).toBe(document.querySelector('[aria-label="Close new gallery form"]'));
		resolveCreate?.({ revisionId: "created" });
		await settle();
	});

	it("disables global ordering whenever search or status filters hide context", async () => {
		mocks.state.galleries = [
			mocks.defaultGallery,
			{ ...mocks.defaultGallery, galleryId: "gallery-2", slug: "draft-work", isPublished: false, published: null },
		];
		await mountList();
		const publishedFilter = Array.from(document.querySelectorAll<HTMLButtonElement>(".filters button"))
			.find((button) => button.textContent === "published");
		publishedFilter?.click();
		await tick();
		expect(Array.from(document.querySelectorAll<HTMLButtonElement>(".order-actions button"))
			.every((button) => button.disabled)).toBe(true);
		expect(document.body.textContent).toContain("Clear search and choose all to change public order.");
	});

	it("surfaces collection, selected-gallery, and media query failures", async () => {
		mocks.state.queryFailures.add("portfolio:listForEditor");
		await mountList();
		expect(document.body.textContent).toContain("Could not load galleries.");
		for (const component of components.splice(0)) unmount(component);
		document.body.innerHTML = "";

		mocks.state.queryFailures.clear();
		mocks.state.queryFailures.add("portfolio:getEditorState");
		await mountDetail();
		expect(document.body.textContent).toContain("Could not load this gallery draft.");
		for (const component of components.splice(0)) unmount(component);
		document.body.innerHTML = "";

		mocks.state.queryFailures.clear();
		mocks.state.queryFailures.add("portfolio:listMediaAssets");
		await mountDetail();
		expect(document.body.textContent).toContain("Could not load gallery media.");
	});

	it("creates through the existing mutation and contains destination failures", async () => {
		await mountList();
		(document.querySelector(".new-gallery") as HTMLButtonElement).click();
		await settle();
		const title = document.querySelector('.create-panel input[maxlength="120"]') as HTMLInputElement;
		title.value = "New work";
		title.dispatchEvent(new Event("input", { bubbles: true }));
		(document.querySelector(".create-panel form") as HTMLFormElement)
			.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
		await settle();
		expect(mocks.mutation).toHaveBeenCalledWith(mocks.refs.saveDraft, expect.objectContaining({
			draft: expect.objectContaining({ title: "New work", slug: "new-work" }),
		}));
		expect(document.body.textContent).toContain("Unpublished gallery created.");

		mocks.state.failMutationName = "portfolio:saveDraft";
		title.value = "Another gallery";
		title.dispatchEvent(new Event("input", { bubbles: true }));
		(document.querySelector(".create-panel form") as HTMLFormElement)
			.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
		await settle();
		expect(document.body.textContent).toContain("forced failure");
	});

	it("persists exact full ordering and rolls the optimistic list back on failure", async () => {
		mocks.state.galleries = [
			mocks.defaultGallery,
			{
				...mocks.defaultGallery,
				galleryId: "gallery-2",
				slug: "second-work",
				portfolioOrder: 1,
				draft: { ...mocks.defaultGallery.draft, title: "Second work", slug: "second-work" },
				published: { ...mocks.defaultGallery.published, title: "Second work", slug: "second-work" },
			},
		];
		await mountList();
		const moveLater = document.querySelector<HTMLButtonElement>('[aria-label="Move gallery later"]');
		moveLater?.click();
		await settle();
		expect(mocks.mutation).toHaveBeenCalledWith(mocks.refs.reorder, {
			siteUrl: "https://site.example",
			galleryIds: ["gallery-2", "gallery-1"],
		});

		mocks.state.failMutationName = "portfolio:reorder";
		const firstVisibleTitle = () => document.querySelector(".gallery-list strong")?.textContent;
		expect(firstVisibleTitle()).toBe("Second work");
		document.querySelector<HTMLButtonElement>('[aria-label="Move gallery later"]')?.click();
		await settle();
		expect(document.body.textContent).toContain("forced failure");
		expect(firstVisibleTitle()).toBe("Second work");
	});
});
