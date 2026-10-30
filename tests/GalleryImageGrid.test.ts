// @vitest-environment jsdom
import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GalleryImageGrid from "../src/lib/pages/gallery-delivery/GalleryImageGrid.svelte";

const fixture = vi.hoisted(() => ({ mutation: vi.fn(), toast: vi.fn() }));

vi.mock("svelte-dnd-action", () => ({
	dndzone: vi.fn(),
}));

vi.mock("../src/lib/adminClient", () => ({
	useAdminClient: () => ({
		mutation: fixture.mutation,
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
vi.mock("../src/lib/toast", () => ({ addToast: fixture.toast }));

function image() {
	return {
		_id: "image-1", _creationTime: 1, siteUrl: "site.example", galleryId: "gallery-1",
		r2Key: "site.example/gallery-1/original/photo.jpg", filename: "photo.jpg",
		sizeBytes: 100, width: 100, height: 100, order: 0, isFavorite: false, downloadCount: 0,
	};
}

function deleteButton() {
	const button = document.querySelector<HTMLButtonElement>(".delete-btn");
	if (!button) throw new Error("Missing delete button");
	return button;
}

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
	beforeEach(() => { vi.clearAllMocks(); fixture.mutation.mockResolvedValue(undefined); });
	afterEach(() => {
		document.body.innerHTML = "";
		vi.unstubAllGlobals();
	});

	it("keeps the record until storage cleanup succeeds and prevents duplicate deletes", async () => {
		let resolveCleanup!: (response: Response) => void;
		const cleanup = new Promise<Response>((resolve) => { resolveCleanup = resolve; });
		const fetchMock = vi.fn(() => cleanup);
		vi.stubGlobal("fetch", fetchMock);
		const onchange = vi.fn();
		const component = mountGrid({ images: [image()], onchange });
		await tick();
		deleteButton().click(); deleteButton().click();
		await tick();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fixture.mutation).not.toHaveBeenCalled();
		expect(deleteButton().disabled).toBe(true);
		resolveCleanup(new Response("{}"));
		await vi.waitFor(() => expect(onchange).toHaveBeenCalledTimes(1));
		expect(fixture.mutation).toHaveBeenCalledWith({ name: "galleryDelivery:removeImage" }, { id: "image-1", siteUrl: "site.example" });
		await unmount(component);
	});

	it.each(["http", "network", "metadata"])("preserves retry after a %s deletion failure", async (failure) => {
		const fetchMock = vi.fn(async () => {
			if (failure === "network") throw new Error("Offline");
			return new Response("{}", { status: failure === "http" ? 503 : 200 });
		});
		vi.stubGlobal("fetch", fetchMock);
		if (failure === "metadata") fixture.mutation.mockRejectedValueOnce(new Error("Unavailable"));
		const onchange = vi.fn();
		const component = mountGrid({ images: [image()], onchange });
		await tick();
		deleteButton().click();
		await vi.waitFor(() => expect(fixture.toast).toHaveBeenCalledWith("Could not delete this file. Try again."));
		if (failure !== "metadata") expect(fixture.mutation).not.toHaveBeenCalled();
		expect(onchange).not.toHaveBeenCalled();
		expect(document.querySelector("img")).not.toBeNull();
		expect(deleteButton().disabled).toBe(false);
		fetchMock.mockResolvedValue(new Response("{}"));
		deleteButton().click();
		await vi.waitFor(() => expect(onchange).toHaveBeenCalledOnce());
		await unmount(component);
	});

	it("shows the true empty state when the gallery has no known images", () => {
		const component = mountGrid();

		expect(document.body.textContent).toContain("no files uploaded yet");
		expect(document.body.textContent).not.toContain("loading");

		unmount(component);
	});

	it("shows a loading state when known gallery images have not hydrated yet", () => {
		const component = mountGrid({ knownImageCount: 593 });

		expect(document.body.textContent).toContain("loading 593 uploaded files...");
		expect(document.body.textContent).not.toContain("no files uploaded yet");

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
