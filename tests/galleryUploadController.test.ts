import { describe, expect, it, vi } from "vitest";
import {
	createGalleryUploadController,
	type GalleryUploadSnapshot,
} from "../src/lib/pages/gallery-delivery/galleryUploadController";
import type { GalleryStoragePort } from "../src/lib/pages/gallery-delivery/galleryStoragePort";

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function file(name: string, size = 4, type = "image/jpeg"): File {
	return new File(["x".repeat(size)], name, { type });
}

function createStorage(overrides: Partial<GalleryStoragePort> = {}): GalleryStoragePort {
	return {
		startUploadSession: vi.fn(async () => ({ token: "session-token", expiresAt: Date.now() + 600_000 })),
		presign: vi.fn(async (input) => ({
			r2Key: `site/gallery/original/${input.filename}`,
			uploadUrl: `/upload/${input.filename}`,
		})),
		uploadFile: vi.fn(async () => {}),
		process: vi.fn(async () => {}),
		delete: vi.fn(async () => {}),
		...overrides,
	};
}

function createController(options: {
	storage?: GalleryStoragePort;
	maxConcurrent?: number;
	randomId?: () => string;
	addImage?: ReturnType<typeof vi.fn>;
	removeImage?: ReturnType<typeof vi.fn>;
	getImageDimensions?: ReturnType<typeof vi.fn>;
	onupload?: ReturnType<typeof vi.fn>;
	onchange?: (snapshot: GalleryUploadSnapshot) => void;
} = {}) {
	const storage = options.storage ?? createStorage();
	const addImage = options.addImage ?? vi.fn(async ({ filename }: { filename: string }) => `image-${filename}`);
	const removeImage = options.removeImage ?? vi.fn(async () => {});
	const getImageDimensions = options.getImageDimensions ?? vi.fn(async () => ({ width: 100, height: 80 }));
	const onupload = options.onupload ?? vi.fn();
	const controller = createGalleryUploadController({
		storage,
		siteUrl: "site",
		galleryId: "gallery",
		addImage,
		removeImage,
		getImageDimensions,
		onupload,
		onchange: options.onchange,
		maxConcurrent: options.maxConcurrent,
		randomId: options.randomId,
		logger: { warn: vi.fn() },
	});
	return { controller, storage, addImage, removeImage, getImageDimensions, onupload };
}

describe("createGalleryUploadController", () => {
	it("admits valid files and marks invalid files as non-retryable without blocking valid uploads", async () => {
		const ids = ["valid-id", "invalid-id"];
		const { controller, addImage } = createController({
			randomId: () => ids.shift() ?? "extra-id",
		});

		controller.addFiles([file("photo.jpg"), file("notes.txt", 4, "text/plain")]);

		await vi.waitFor(() => {
			expect(addImage).toHaveBeenCalledTimes(1);
		});

		const snapshot = controller.getSnapshot();
		expect(snapshot.totalCount).toBe(2);
		expect(snapshot.completedCount).toBe(1);
		expect(snapshot.sourceFileCount).toBe(2);
		expect(snapshot.sourceSizeBytes).toBe(8);
		expect(snapshot.acceptedFileCount).toBe(1);
		expect(snapshot.acceptedSizeBytes).toBe(4);
		expect(snapshot.rejectedFileCount).toBe(1);
		expect(snapshot.rejectedSizeBytes).toBe(4);
		expect(snapshot.hasErrors).toBe(true);
		expect(snapshot.retryableErrorCount).toBe(0);
		expect(snapshot.files.map((upload) => [upload.id, upload.status, upload.retryable])).toEqual([
			["valid-id", "done", undefined],
			["invalid-id", "error", false],
		]);
	});

	it("rejects empty files locally instead of requesting a legacy presign", async () => {
		const { controller, storage } = createController();

		controller.addFiles([file("empty.jpg", 0)]);

		const snapshot = controller.getSnapshot();
		expect(snapshot.files).toHaveLength(1);
		expect(snapshot.files[0]).toMatchObject({
			status: "error",
			error: "File is empty",
			retryable: false,
		});
		expect(storage.startUploadSession).not.toHaveBeenCalled();
		expect(storage.presign).not.toHaveBeenCalled();
	});

	it("threads exact File.size and the returned Worker capability through upload", async () => {
		const storage = createStorage({
			presign: vi.fn(async () => ({
				r2Key: "site/gallery/original/photo.jpg",
				uploadUrl: "/upload/put?key=photo",
				uploadToken: "worker-upload-token",
			})),
		});
		const { controller } = createController({ storage });

		controller.addFiles([file("photo.jpg", 7)]);

		await vi.waitFor(() => {
			expect(storage.uploadFile).toHaveBeenCalledTimes(1);
		});
		expect(storage.presign).toHaveBeenCalledWith(expect.objectContaining({
			sizeBytes: 7,
		}));
		expect(storage.uploadFile).toHaveBeenCalledWith(expect.objectContaining({
			uploadToken: "worker-upload-token",
		}));
	});

	it("runs no more than the configured number of uploads at once", async () => {
		const firstPresign = deferred<{ r2Key: string; uploadUrl: string }>();
		const secondPresign = deferred<{ r2Key: string; uploadUrl: string }>();
		const presigns = [firstPresign, secondPresign];
		const storage = createStorage({
			presign: vi.fn(async (input) => {
				const pending = presigns.shift();
				if (pending) return pending.promise;
				return { r2Key: `site/gallery/original/${input.filename}`, uploadUrl: `/upload/${input.filename}` };
			}),
		});
		const { controller } = createController({ storage, maxConcurrent: 2 });

		controller.addFiles([
			file("one.jpg"),
			file("two.jpg"),
			file("three.jpg"),
			file("four.jpg"),
		]);

		await vi.waitFor(() => {
			expect(storage.presign).toHaveBeenCalledTimes(2);
		});
		expect(controller.getSnapshot().files.filter((upload) => upload.status === "uploading")).toHaveLength(2);

		firstPresign.resolve({ r2Key: "site/gallery/original/one.jpg", uploadUrl: "/upload/one.jpg" });

		await vi.waitFor(() => {
			expect(vi.mocked(storage.presign).mock.calls.length).toBeGreaterThan(2);
		});
	});

	it("retries all retryable failures without retrying validation failures", async () => {
		const storage = createStorage({
			presign: vi.fn()
				.mockRejectedValueOnce(new Error("temporary presign failure"))
				.mockResolvedValueOnce({ r2Key: "site/gallery/original/photo.jpg", uploadUrl: "/upload/photo.jpg" }),
		});
		const { controller, addImage } = createController({ storage });

		controller.addFiles([file("photo.jpg"), file("notes.txt", 4, "text/plain")]);

		await vi.waitFor(() => {
			expect(controller.getSnapshot().retryableErrorCount).toBe(1);
		});

		controller.retryAllUploads();

		await vi.waitFor(() => {
			expect(addImage).toHaveBeenCalledTimes(1);
		});

		const snapshot = controller.getSnapshot();
		expect(storage.presign).toHaveBeenCalledTimes(2);
		expect(snapshot.completedCount).toBe(1);
		expect(snapshot.files.find((upload) => upload.file.name === "notes.txt")?.retryable).toBe(false);
	});

	it("clears completed rows while preserving the original batch totals", async () => {
		const { controller, addImage } = createController();

		controller.addFiles([file("one.jpg", 3), file("two.jpg", 5)]);

		await vi.waitFor(() => {
			expect(addImage).toHaveBeenCalledTimes(2);
		});
		controller.clearCompleted();

		const snapshot = controller.getSnapshot();
		expect(snapshot.files).toHaveLength(0);
		expect(snapshot.completedCount).toBe(2);
		expect(snapshot.totalCount).toBe(2);
		expect(snapshot.totalSizeBytes).toBe(8);
		expect(snapshot.sourceFileCount).toBe(2);
		expect(snapshot.acceptedFileCount).toBe(2);
		expect(snapshot.rejectedFileCount).toBe(0);
	});

	it("deletes selected uploaded files from Convex and storage", async () => {
		const { controller, storage, removeImage, addImage } = createController();

		controller.addFiles([file("photo.jpg")]);

		await vi.waitFor(() => {
			expect(addImage).toHaveBeenCalledTimes(1);
		});
		const id = controller.getSnapshot().files[0].id;
		controller.toggleSelected(id);
		await controller.deleteSelectedFiles();

		expect(removeImage).toHaveBeenCalledWith("image-photo.jpg");
		expect(storage.delete).toHaveBeenCalledWith({
			r2Key: "site/gallery/original/photo.jpg",
			uploadSessionToken: "session-token",
		});
		expect(controller.getSnapshot().files).toHaveLength(0);
		expect(controller.getSnapshot().totalCount).toBe(0);
		expect(controller.getSnapshot().sourceFileCount).toBe(0);
		expect(controller.getSnapshot().acceptedFileCount).toBe(0);
		expect(controller.getSnapshot().acceptedSizeBytes).toBe(0);
		expect(controller.getSnapshot().rejectedFileCount).toBe(0);
	});

	it("removes rejected selected files from batch diagnostics", async () => {
		const { controller } = createController();

		controller.addFiles([file("photo.jpg", 4), file("notes.txt", 6, "text/plain")]);

		await vi.waitFor(() => {
			expect(controller.getSnapshot().files.some((upload) => upload.status === "done")).toBe(true);
		});
		const rejected = controller.getSnapshot().files.find((upload) => upload.retryable === false);
		expect(rejected).toBeTruthy();
		controller.toggleSelected(rejected!.id);
		await controller.deleteSelectedFiles();

		const snapshot = controller.getSnapshot();
		expect(snapshot.sourceFileCount).toBe(1);
		expect(snapshot.sourceSizeBytes).toBe(4);
		expect(snapshot.acceptedFileCount).toBe(1);
		expect(snapshot.rejectedFileCount).toBe(0);
		expect(snapshot.rejectedSizeBytes).toBe(0);
	});

	it("aborts and deletes storage when deleting during a direct upload", async () => {
		let uploadSignal: AbortSignal | undefined;
		const uploadGate = deferred<void>();
		const storage = createStorage({
			uploadFile: vi.fn(async ({ signal }) => {
				uploadSignal = signal;
				return uploadGate.promise;
			}),
		});
		const { controller, removeImage } = createController({ storage });

		controller.addFiles([file("photo.jpg")]);

		await vi.waitFor(() => {
			expect(storage.uploadFile).toHaveBeenCalledTimes(1);
		});
		const id = controller.getSnapshot().files[0].id;
		controller.toggleSelected(id);
		await controller.deleteSelectedFiles();

		expect(uploadSignal?.aborted).toBe(true);
		expect(removeImage).not.toHaveBeenCalled();
		expect(storage.delete).toHaveBeenCalledWith({
			r2Key: "site/gallery/original/photo.jpg",
			uploadSessionToken: "session-token",
		});
		const snapshot = controller.getSnapshot();
		expect(snapshot.files).toHaveLength(0);
		expect(snapshot.acceptedFileCount).toBe(0);
		expect(snapshot.acceptedSizeBytes).toBe(0);
		expect(snapshot.rejectedFileCount).toBe(0);
		uploadGate.resolve();
	});

	it("aborts and deletes storage when deleting during processing", async () => {
		let processSignal: AbortSignal | undefined;
		const processGate = deferred<void>();
		const storage = createStorage({
			process: vi.fn(async ({ signal }) => {
				processSignal = signal;
				return processGate.promise;
			}),
		});
		const { controller, removeImage } = createController({ storage });

		controller.addFiles([file("photo.jpg")]);

		await vi.waitFor(() => {
			expect(storage.process).toHaveBeenCalledTimes(1);
		});
		const id = controller.getSnapshot().files[0].id;
		controller.toggleSelected(id);
		await controller.deleteSelectedFiles();

		expect(processSignal?.aborted).toBe(true);
		expect(removeImage).not.toHaveBeenCalled();
		expect(storage.delete).toHaveBeenCalledWith({
			r2Key: "site/gallery/original/photo.jpg",
			uploadSessionToken: "session-token",
		});
		expect(controller.getSnapshot().files).toHaveLength(0);
		processGate.resolve();
	});

	it("removes a Convex image record when a delete abort lands after addImage resolves", async () => {
		const addImageGate = deferred<string>();
		const addImage = vi.fn(async () => addImageGate.promise);
		const removeImage = vi.fn(async () => {});
		const { controller } = createController({ addImage, removeImage });

		controller.addFiles([file("photo.jpg")]);

		await vi.waitFor(() => {
			expect(addImage).toHaveBeenCalledTimes(1);
		});
		const id = controller.getSnapshot().files[0].id;
		controller.toggleSelected(id);
		const deletePromise = controller.deleteSelectedFiles();
		addImageGate.resolve("late-image-id");
		await deletePromise;

		await vi.waitFor(() => {
			expect(removeImage).toHaveBeenCalledWith("late-image-id");
		});
		expect(controller.getSnapshot().files).toHaveLength(0);
	});
});
