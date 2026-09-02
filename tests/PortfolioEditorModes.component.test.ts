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
		isVisible: true,
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
		placements: [] as Array<{
			key: string;
			assetId: string;
			altText?: string;
			caption?: string;
		}>,
		mediaAssets: [] as Array<{
			_id: string;
			assetId: string;
			originalFilename: string;
			status: "ready";
			source: { contentType: string; sizeBytes: number; width: number; height: number };
			derivatives: {
				thumb: { key: string; width: number; height: number };
				card: { key: string; width: number; height: number };
			};
			createdAt: number;
		}>,
	};
	const mutation = vi.fn(async (ref: { name?: string }, args?: { isVisible?: boolean }) => {
		if (ref.name === state.failMutationName) throw new Error("forced failure");
		if (ref.name === "portfolio:setVisibility") return { isVisible: args?.isVisible };
		return { revisionId: "saved-revision" };
	});
	const goto = vi.fn();
	return {
		mutation,
		goto,
		state,
		defaultGallery,
		publishingEnabled: true,
		publicLifecycleEnabled: true,
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
		setVisibilityRef: { name: "portfolio:setVisibility" },
		removeRef: { name: "portfolio:remove" },
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
				placements: mocks.state.placements,
			};
			return {
				data: {
					galleryId: "gallery-1",
					slug: "selected-work",
					isPublished: true,
					isVisible: true,
					draft: revision,
					published: revision,
				},
			};
		}
		if (ref.name === "portfolio:listMediaAssets") {
			return { data: { page: mocks.state.mediaAssets, isDone: true, continueCursor: null } };
		}
		if (ref.name === "portfolio:getPlacedMediaAssets") return { data: mocks.state.mediaAssets };
		return { data: undefined };
	},
	useConvexClient: () => ({ mutation: mocks.mutation }),
}));

vi.mock("$app/navigation", () => ({ goto: mocks.goto }));

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
				...(mocks.publicLifecycleEnabled
					? { setVisibility: mocks.setVisibilityRef, remove: mocks.removeRef }
					: {}),
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

function finalizeGalleryOrder(galleryIds: string[]) {
	const list = document.querySelector<HTMLOListElement>(".gallery-list");
	if (!list) throw new Error("gallery list missing");
	const items = galleryIds.map((galleryId) => {
		const gallery = mocks.state.galleries.find((candidate) => candidate.galleryId === galleryId);
		if (!gallery) throw new Error(`gallery ${galleryId} missing`);
		return { ...gallery, id: gallery.galleryId };
	});
	list.dispatchEvent(new CustomEvent("finalize", {
		bubbles: true,
		detail: {
			items,
			info: { source: "pointer", trigger: "droppedIntoZone", id: galleryIds[0] },
		},
	}));
}

function considerGalleryDrag(galleryId: string) {
	const list = document.querySelector<HTMLOListElement>(".gallery-list");
	if (!list) throw new Error("gallery list missing");
	const items = mocks.state.galleries.map((gallery) => gallery.galleryId === galleryId
		? {
			...gallery,
			id: "id:dnd-shadow-placeholder-0000",
			isDndShadowItem: true,
		}
		: { ...gallery, id: gallery.galleryId });
	list.dispatchEvent(new CustomEvent("consider", {
		bubbles: true,
		detail: {
			items,
			info: { source: "pointer", trigger: "dragStarted", id: galleryId },
		},
	}));
}

describe("Portfolio editor capability modes", () => {
	beforeEach(() => {
		mocks.mutation.mockClear();
		mocks.goto.mockClear();
		mocks.state.failMutationName = "";
		mocks.state.queryFailures.clear();
		mocks.state.galleries = [mocks.defaultGallery];
		mocks.state.placements = [];
		mocks.state.mediaAssets = [];
		mocks.publishingEnabled = true;
		mocks.publicLifecycleEnabled = true;
		mocks.previewEnabled = true;
		localStorage.clear();
	});

	afterEach(() => {
		for (const component of components.splice(0)) unmount(component);
		document.body.innerHTML = "";
	});

	it("retains the public collection language and statuses for publish-capable hosts", async () => {
		await mountList();

		expect(document.body.textContent).toContain("Choose one from the list, or create a new gallery.");
		expect(document.querySelector(".status")?.textContent).toContain("published");
		(document.querySelector(".new-gallery") as HTMLButtonElement).click();
		await tick();
		expect(buttonLabels()).toContain("create unpublished gallery");
		expect(document.body.textContent).toContain("The public site follows this deliberate order.");
	});

	it("presents every collection record as a private draft when publish is absent", async () => {
		mocks.publishingEnabled = false;
		mocks.publicLifecycleEnabled = false;
		await mountList();

		expect(document.body.textContent).toContain("Choose one from the list, or create a new gallery.");
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
		expect(portfolioWorkbenchSource).toContain(":global(#dnd-action-dragged-el > a)");
		expect(portfolioWorkbenchSource).toContain("pointer-events: none");
		expect(portfolioWorkbenchSource).toContain(
			".new-gallery, .filters button, .primary { min-height: 44px; }",
		);
	});

	it("keeps publish behavior unchanged when the capability is present", async () => {
		mocks.previewEnabled = false;
		await mountDetail();

		expect(document.querySelector(".gallery-page > header p")).toBeNull();
		expect(buttonLabels()).toContain("publish");
		expect(buttonLabels()).not.toContain("preview");
		expect(document.querySelector("#publish-review-heading")?.textContent).toBe("publishing review");
		expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe("published");
	});

	it("keeps preview and draft editing while removing publication semantics in staging mode", async () => {
		mocks.publishingEnabled = false;
		mocks.publicLifecycleEnabled = false;
		await mountDetail();

		expect(document.querySelector(".gallery-page > header p")).toBeNull();
		expect(buttonLabels()).toContain("preview");
		expect(buttonLabels()).not.toContain("publish");
		expect(document.querySelector("#publish-review-heading")).toBeNull();
		expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe("draft saved");
		expect(document.body.textContent).toContain("Drag images to set their saved order.");
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
		expect(Array.from(document.querySelectorAll<HTMLButtonElement>(".drag-handle"))
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

	it("regenerates manually edited gallery URLs from the current gallery name", async () => {
		await mountList();
		(document.querySelector(".new-gallery") as HTMLButtonElement).click();
		await settle();
		const title = document.querySelector<HTMLInputElement>('.create-panel input[maxlength="120"]')!;
		const slug = document.querySelector<HTMLInputElement>("#new-gallery-slug")!;
		title.value = "Winter Light";
		title.dispatchEvent(new Event("input", { bubbles: true }));
		slug.value = "custom-url";
		slug.dispatchEvent(new Event("input", { bubbles: true }));
		title.value = "Winter Blue";
		title.dispatchEvent(new Event("input", { bubbles: true }));
		expect(slug.value).toBe("custom-url");
		await tick();
		(document.querySelector(".create-panel .generate-url") as HTMLButtonElement).click();
		await tick();
		expect(slug.value).toBe("winter-blue");

		for (const component of components.splice(0)) unmount(component);
		document.body.innerHTML = "";
		await mountDetail();
		const detailTitle = document.querySelector<HTMLInputElement>("#gallery-title")!;
		const detailSlug = document.querySelector<HTMLInputElement>("#gallery-slug")!;
		detailTitle.value = "Quiet Portraits";
		detailTitle.dispatchEvent(new Event("input", { bubbles: true }));
		detailSlug.value = "keep-this-until-asked";
		detailSlug.dispatchEvent(new Event("input", { bubbles: true }));
		(document.querySelector(".gallery-page .generate-url") as HTMLButtonElement).click();
		await tick();
		expect(detailSlug.value).toBe("quiet-portraits");
	});

	it("reorders gallery images by drag handle without arrow controls", async () => {
		mocks.state.placements = [
			{ key: "image-a", assetId: "asset-a", altText: "First" },
			{ key: "image-b", assetId: "asset-b", altText: "Second" },
		];
		mocks.state.mediaAssets = ["a", "b"].map((suffix, index) => ({
			_id: `asset-${suffix}`,
			assetId: `source-${suffix}`,
			originalFilename: `${index + 1}.jpg`,
			status: "ready" as const,
			source: { contentType: "image/jpeg", sizeBytes: 10, width: 100, height: 80 },
			derivatives: {
				thumb: { key: `thumb-${suffix}`, width: 100, height: 80 },
				card: { key: `card-${suffix}`, width: 100, height: 80 },
			},
			createdAt: index,
		}));
		await mountDetail();
		expect(document.querySelector('[aria-label="Move image earlier"]')).toBeNull();
		expect(Array.from(document.querySelectorAll<HTMLButtonElement>(".image-list .drag-handle"), (handle) => handle.ariaLabel))
			.toEqual(["Drag 1.jpg to reorder", "Drag 2.jpg to reorder"]);
		const list = document.querySelector<HTMLOListElement>(".image-list")!;
		list.dispatchEvent(new CustomEvent("finalize", {
			bubbles: true,
			detail: {
				items: [mocks.state.placements[1], mocks.state.placements[0]].map((placement) => ({
					...placement,
					id: placement.key,
				})),
				info: { source: "pointer", trigger: "droppedIntoZone", id: "image-b" },
			},
		}));
		await tick();
		expect(Array.from(document.querySelectorAll(".image-summary strong"), (item) => item.textContent))
			.toEqual(["2.jpg", "1.jpg"]);
		const saveNow = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
			.find((button) => button.textContent === "save now");
		saveNow?.click();
		await settle();
		expect(mocks.mutation).toHaveBeenCalledWith(mocks.refs.saveDraft, expect.objectContaining({
			draft: expect.objectContaining({
				placements: [
					expect.objectContaining({ key: "image-b" }),
					expect.objectContaining({ key: "image-a" }),
				],
			}),
		}));
	});

	it("hides a published gallery and confirms permanent deletion without deleting shared media", async () => {
		await mountDetail();
		const hide = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
			.find((button) => button.textContent === "hide from site");
		expect(hide?.classList.contains("visibility-toggle")).toBe(true);
		expect(hide?.getAttribute("aria-pressed")).toBe("false");
		hide?.click();
		await settle();
		expect(mocks.mutation).toHaveBeenCalledWith(mocks.setVisibilityRef, {
			galleryId: "gallery-1",
			isVisible: false,
		});
		const show = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
			.find((button) => button.textContent === "show on site");
		expect(show?.getAttribute("aria-pressed")).toBe("true");
		expect(show?.classList.contains("hidden")).toBe(false);
		expect(document.querySelector('label[for="gallery-title"]')?.parentElement?.classList.contains("field-heading")).toBe(true);

		const remove = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
			.find((button) => button.textContent === "delete gallery");
		remove?.click();
		await tick();
		expect(document.querySelector('[role="alertdialog"]')?.textContent)
			.toContain("The image files stay in the shared media library.");
		const confirm = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
			.find((button) => button.textContent === "delete permanently");
		confirm?.click();
		await settle();
		expect(mocks.mutation).toHaveBeenCalledWith(mocks.removeRef, { galleryId: "gallery-1" });
		expect(mocks.goto).toHaveBeenCalledWith("/admin/editor/portfolio");
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
		expect(document.querySelector('[aria-label="Move gallery later"]')).toBeNull();
		expect(Array.from(document.querySelectorAll<HTMLButtonElement>(".drag-handle"), (handle) => handle.ariaLabel)).toEqual([
			"Drag Selected work to reorder",
			"Drag Second work to reorder",
		]);
		considerGalleryDrag("gallery-1");
		await tick();
		expect(Array.from(document.querySelectorAll(".gallery-list li"))).toHaveLength(2);
		expect(Array.from(document.querySelectorAll(".gallery-list strong"), (title) => title.textContent)).toEqual([
			"Selected work",
			"Second work",
		]);
		finalizeGalleryOrder(["gallery-2", "gallery-1"]);
		await settle();
		expect(mocks.mutation).toHaveBeenCalledWith(mocks.refs.reorder, {
			siteUrl: "https://site.example",
			galleryIds: ["gallery-2", "gallery-1"],
		});

		mocks.state.failMutationName = "portfolio:reorder";
		const firstVisibleTitle = () => document.querySelector(".gallery-list strong")?.textContent;
		expect(firstVisibleTitle()).toBe("Second work");
		finalizeGalleryOrder(["gallery-1", "gallery-2"]);
		await settle();
		expect(document.body.textContent).toContain("forced failure");
		expect(firstVisibleTitle()).toBe("Second work");
	});
});
