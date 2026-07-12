// @vitest-environment jsdom
import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import GalleryImageGrid from "../src/lib/pages/gallery-delivery/GalleryImageGrid.svelte";

vi.mock("svelte-dnd-action", () => ({
	dndzone: vi.fn(),
}));

vi.mock("../src/lib/adminClient", () => ({
	useAdminClient: () => ({
		mutation: vi.fn(),
	}),
}));

vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({
		siteUrl: "site.example",
		galleryWorkerUrl: "https://gallery-worker.example",
		api: {
			galleryDelivery: {
				removeImage: { name: "galleryDelivery:removeImage" },
				reorderImages: { name: "galleryDelivery:reorderImages" },
				update: { name: "galleryDelivery:update" },
			},
		},
	}),
}));

vi.mock("../src/lib/logger", () => ({
	logger: {
		warn: vi.fn(),
	},
}));

function mountGrid(props: Partial<Parameters<typeof GalleryImageGrid>[0]["props"]> = {}) {
	return mount(GalleryImageGrid, {
		target: document.body,
		props: {
			images: [],
			galleryId: "gallery-1",
			onchange: vi.fn(),
			...props,
		},
	});
}

describe("GalleryImageGrid", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("shows the true empty state when the gallery has no known images", () => {
		const component = mountGrid();

		expect(document.body.textContent).toContain("no images uploaded yet");
		expect(document.body.textContent).not.toContain("loading");

		unmount(component);
	});

	it("shows a loading state when known gallery images have not hydrated yet", () => {
		const component = mountGrid({ knownImageCount: 593 });

		expect(document.body.textContent).toContain("loading 593 uploaded images...");
		expect(document.body.textContent).not.toContain("no images uploaded yet");

		unmount(component);
	});

	it("loads gallery thumbnails through the authenticated host proxy", async () => {
		const component = mountGrid({
			images: [{
				_id: "image-1",
				_creationTime: 1,
				siteUrl: "site.example",
				galleryId: "gallery-1",
				r2Key: "site.example/gallery-1/original/photo.jpg",
				filename: "photo.jpg",
				sizeBytes: 100,
				width: 100,
				height: 100,
				order: 0,
				isFavorite: false,
				downloadCount: 0,
			}],
		});
		await tick();

		expect(document.querySelector("img")?.getAttribute("src")).toBe(
			"/api/admin/galleries/image?key=site.example%2Fgallery-1%2Fthumb%2Fphoto.jpg",
		);
		unmount(component);
	});
});
