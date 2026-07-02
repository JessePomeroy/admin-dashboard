// @vitest-environment jsdom
import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GalleryDetailModal from "../src/lib/pages/gallery-delivery/GalleryDetailModal.svelte";
import type { Gallery, GalleryImage } from "../src/lib/types";

const mocks = vi.hoisted(() => {
	const mutation = vi.fn(async () => undefined);
	const query = vi.fn(async () => ({
		keys: [
			"site.example/gallery-1/original/one.jpg",
			"site.example/gallery-1/original/two.jpg",
			"site.example/gallery-1/original/hidden.jpg",
		],
		isDone: true,
		continueCursor: null,
	}));
	const gallery = {
		_id: "gallery-1",
		_creationTime: 1,
		siteUrl: "site.example",
		clientId: "client-1",
		clientName: "client name",
		name: "wedding gallery",
		slug: "wedding-gallery",
		status: "draft",
		imageCount: 2,
		totalSizeBytes: 300,
		downloadEnabled: true,
		favoritesEnabled: true,
	};
	const images = [
		{
			_id: "image-1",
			_creationTime: 2,
			siteUrl: "site.example",
			galleryId: "gallery-1",
			r2Key: "site.example/gallery-1/original/one.jpg",
			filename: "one.jpg",
			sizeBytes: 100,
			width: 120,
			height: 80,
			order: 0,
			isFavorite: false,
			downloadCount: 0,
		},
		{
			_id: "image-2",
			_creationTime: 3,
			siteUrl: "site.example",
			galleryId: "gallery-1",
			r2Key: "site.example/gallery-1/original/two.jpg",
			filename: "two.jpg",
			sizeBytes: 200,
			width: 120,
			height: 80,
			order: 1,
			isFavorite: false,
			downloadCount: 0,
		},
	];
	return { mutation, query, gallery, images };
});

vi.mock("convex-svelte", () => ({
	useQuery: (ref: { name?: string }) => {
		if (ref.name === "galleryDelivery:getImages") return { data: mocks.images };
		if (ref.name === "galleryDelivery:get") return { data: mocks.gallery };
		return { data: undefined };
	},
	useConvexClient: () => ({ mutation: mocks.mutation, query: mocks.query }),
}));

vi.mock("../src/lib/adminClient", () => ({
	useAdminClient: () => ({ mutation: mocks.mutation, query: mocks.query }),
}));

vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({
		siteUrl: "site.example",
		siteName: "test site",
		fromEmail: "test@example.com",
		isCreator: true,
		galleryWorkerUrl: "https://gallery-worker.example",
		api: {
			galleryDelivery: {
				get: { name: "galleryDelivery:get" },
				getImages: { name: "galleryDelivery:getImages" },
				remove: { name: "galleryDelivery:remove" },
				update: { name: "galleryDelivery:update" },
				removeImage: { name: "galleryDelivery:removeImage" },
				reorderImages: { name: "galleryDelivery:reorderImages" },
				addImage: { name: "galleryDelivery:addImage" },
				listImageStorageKeys: { name: "galleryDelivery:listImageStorageKeys" },
			},
			portal: {
				createToken: { name: "portal:createToken" },
			},
		},
	}),
}));

vi.mock("../src/lib/logger", () => ({
	logger: {
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}));

function mountModal(props: {
	gallery?: Gallery & { clientName: string };
	onclose?: () => void;
} = {}) {
	return mount(GalleryDetailModal, {
		target: document.body,
		props: {
			gallery: props.gallery ?? (mocks.gallery as Gallery & { clientName: string }),
			adminSession: {
				status: "authorized",
				email: "admin@example.com",
				tier: "full",
				isCreator: true,
			},
			onclose: props.onclose ?? vi.fn(),
		},
	});
}

function getButton(label: string): HTMLButtonElement {
	const button = Array.from(document.querySelectorAll("button")).find(
		(candidate) => candidate.textContent?.trim() === label,
	);
	if (!button) throw new Error(`Button not found: ${label}`);
	return button as HTMLButtonElement;
}

async function openSettingsTab() {
	getButton("settings").click();
	await tick();
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});
	return { promise, resolve, reject };
}

describe("GalleryDetailModal", () => {
	beforeEach(() => {
		mocks.mutation.mockClear();
		mocks.query.mockClear();
		mocks.query.mockResolvedValue({
			keys: [
				"site.example/gallery-1/original/one.jpg",
				"site.example/gallery-1/original/two.jpg",
				"site.example/gallery-1/original/hidden.jpg",
			],
			isDone: true,
			continueCursor: null,
		});
		vi.stubGlobal("confirm", vi.fn(() => true));
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		document.body.innerHTML = "";
	});

	it("bulk deletes gallery files before deleting Convex metadata", async () => {
		const onclose = vi.fn();
		const cleanup = deferred<Response>();
		const fetchMock = vi.fn(() => cleanup.promise);
		vi.stubGlobal("fetch", fetchMock);

		const component = mountModal({ onclose });
		await openSettingsTab();

		getButton("delete gallery").click();

		await vi.waitFor(() => {
			expect(mocks.query).toHaveBeenCalledWith(
				{ name: "galleryDelivery:listImageStorageKeys" },
				{
					galleryId: "gallery-1",
					paginationOpts: { numItems: 500, cursor: null },
				},
			);
			expect(fetchMock).toHaveBeenCalledWith("/api/admin/galleries/bulk-delete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					keys: [
						...(mocks.images as GalleryImage[]).map((image) => image.r2Key),
						"site.example/gallery-1/original/hidden.jpg",
					],
				}),
			});
		});
		expect(mocks.mutation).not.toHaveBeenCalledWith(
			{ name: "galleryDelivery:remove" },
			expect.anything(),
		);

		cleanup.resolve(new Response(null, { status: 204 }));

		await vi.waitFor(() => {
			expect(mocks.mutation).toHaveBeenCalledWith(
				{ name: "galleryDelivery:remove" },
				{ id: "gallery-1" },
			);
		});
		expect(onclose).toHaveBeenCalledTimes(1);

		unmount(component);
	});

	it("falls back to per-file cleanup before deleting Convex metadata", async () => {
		const onclose = vi.fn();
		const finalCleanup = deferred<Response>();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("not found", { status: 404 }))
			.mockResolvedValueOnce(new Response(null, { status: 204 }))
			.mockResolvedValueOnce(new Response(null, { status: 204 }))
			.mockReturnValueOnce(finalCleanup.promise);
		vi.stubGlobal("fetch", fetchMock);

		const component = mountModal({ onclose });
		await openSettingsTab();

		getButton("delete gallery").click();

		await vi.waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(4);
		});
		expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/galleries/delete", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ r2Key: "site.example/gallery-1/original/one.jpg" }),
		});
		expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/admin/galleries/delete", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ r2Key: "site.example/gallery-1/original/two.jpg" }),
		});
		expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/admin/galleries/delete", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ r2Key: "site.example/gallery-1/original/hidden.jpg" }),
		});
		expect(mocks.mutation).not.toHaveBeenCalledWith(
			{ name: "galleryDelivery:remove" },
			expect.anything(),
		);

		finalCleanup.resolve(new Response(null, { status: 204 }));

		await vi.waitFor(() => {
			expect(mocks.mutation).toHaveBeenCalledWith(
				{ name: "galleryDelivery:remove" },
				{ id: "gallery-1" },
			);
		});
		expect(onclose).toHaveBeenCalledTimes(1);

		unmount(component);
	});

	it("keeps metadata when gallery file cleanup fails", async () => {
		const onclose = vi.fn();
		const cleanup = deferred<Response>();
		const fetchMock = vi.fn(() => cleanup.promise);
		vi.stubGlobal("fetch", fetchMock);

		const component = mountModal({ onclose });
		await openSettingsTab();

		getButton("delete gallery").click();

		await vi.waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});
		cleanup.resolve(new Response("worker unavailable", { status: 503 }));
		await vi.waitFor(() => {
			expect(getButton("delete gallery")).toBeTruthy();
		});

		expect(mocks.mutation).not.toHaveBeenCalledWith(
			{ name: "galleryDelivery:remove" },
			expect.anything(),
		);
		expect(onclose).not.toHaveBeenCalled();

		unmount(component);
	});
});
