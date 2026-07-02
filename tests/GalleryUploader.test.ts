// @vitest-environment jsdom
import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GalleryUploader from "../src/lib/pages/gallery-delivery/GalleryUploader.svelte";

const mocks = vi.hoisted(() => {
	const mutation = vi.fn(async () => "image-id");
	const storage = {
		startUploadSession: vi.fn(async () => ({
			token: "session-token",
			expiresAt: Date.now() + 600_000,
		})),
		presign: vi.fn(async ({ filename }: { filename: string }) => ({
			r2Key: `site/gallery/original/${filename}`,
			uploadUrl: `/upload/${filename}`,
		})),
		uploadFile: vi.fn(async () => {}),
		process: vi.fn(async () => {}),
		delete: vi.fn(async () => {}),
	};
	return { mutation, storage };
});

vi.mock("../src/lib/adminClient", () => ({
	useAdminClient: () => ({ mutation: mocks.mutation }),
}));

vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({
		siteUrl: "site",
		siteName: "test site",
		fromEmail: "test@example.com",
		isCreator: true,
		galleryWorkerUrl: "https://gallery-worker.example",
		api: {
			galleryDelivery: {
				addImage: { name: "galleryDelivery:addImage" },
				removeImage: { name: "galleryDelivery:removeImage" },
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

vi.mock("../src/lib/pages/gallery-delivery/galleryStoragePort", () => ({
	createGalleryStoragePort: () => mocks.storage,
}));

function getButton(label: string): HTMLButtonElement {
	const button = Array.from(document.querySelectorAll("button"))
		.find((candidate) => candidate.textContent?.trim() === label);
	if (!button) throw new Error(`Button not found: ${label}`);
	return button as HTMLButtonElement;
}

function setInputFiles(input: HTMLInputElement, files: File[]): void {
	Object.defineProperty(input, "files", {
		value: files,
		configurable: true,
	});
	input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("GalleryUploader", () => {
	beforeEach(() => {
		mocks.mutation.mockClear();
		mocks.storage.startUploadSession.mockReset().mockResolvedValue({
			token: "session-token",
			expiresAt: Date.now() + 600_000,
		});
		mocks.storage.presign.mockReset().mockImplementation(async ({ filename }: { filename: string }) => ({
			r2Key: `site/gallery/original/${filename}`,
			uploadUrl: `/upload/${filename}`,
		}));
		mocks.storage.uploadFile.mockReset().mockResolvedValue(undefined);
		mocks.storage.process.mockReset().mockResolvedValue(undefined);
		mocks.storage.delete.mockReset().mockResolvedValue(undefined);

		Object.defineProperty(URL, "createObjectURL", {
			value: vi.fn(() => "blob:test"),
			configurable: true,
		});
		Object.defineProperty(URL, "revokeObjectURL", {
			value: vi.fn(),
			configurable: true,
		});
		vi.stubGlobal("Image", class {
			naturalWidth = 120;
			naturalHeight = 80;
			onload: (() => void) | null = null;
			onerror: (() => void) | null = null;
			set src(_value: string) {
				queueMicrotask(() => this.onload?.());
			}
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		document.body.innerHTML = "";
	});

	it("keeps header, selection, and cleared batch summary in sync with controller state", async () => {
		const summaries: Array<{
			totalCount: number;
			completedCount: number;
			totalSizeBytes: number;
			hasErrors: boolean;
		}> = [];
		const onupload = vi.fn();
		const component = mount(GalleryUploader, {
			target: document.body,
			props: {
				galleryId: "gallery",
				adminSession: {
					status: "authorized",
					email: "admin@example.com",
					tier: "full",
					isCreator: true,
				},
				onupload,
				onbatchchange: (summary) => summaries.push(summary),
			},
		});

		const input = document.querySelector("input[type='file']") as HTMLInputElement;
		setInputFiles(input, [
			new File(["a"], "one.jpg", { type: "image/jpeg" }),
			new File(["bb"], "two.jpg", { type: "image/jpeg" }),
		]);

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("2/2 uploaded");
		});
		expect(onupload).toHaveBeenCalledTimes(2);
		expect(summaries.at(-1)).toMatchObject({
			totalCount: 2,
			completedCount: 2,
			totalSizeBytes: 3,
			hasErrors: false,
		});

		const firstCheckbox = document.querySelector(".delete-checkbox") as HTMLInputElement;
		firstCheckbox.click();
		await tick();
		expect(document.body.textContent).toContain("delete selected (1)");

		getButton("clear done").click();
		await tick();

		expect(document.body.textContent).toContain("drag photos here");
		expect(document.body.textContent).not.toContain("one.jpg");
		expect(document.body.textContent).not.toContain("two.jpg");
		expect(summaries.at(-1)).toMatchObject({
			totalCount: 2,
			completedCount: 2,
			totalSizeBytes: 3,
			hasErrors: false,
		});

		unmount(component);
	});

	it("wires retry all through to retryable upload failures only", async () => {
		mocks.storage.presign
			.mockRejectedValueOnce(new Error("temporary presign failure"))
			.mockResolvedValueOnce({
				r2Key: "site/gallery/original/photo.jpg",
				uploadUrl: "/upload/photo.jpg",
			});

		const component = mount(GalleryUploader, {
			target: document.body,
			props: {
				galleryId: "gallery",
				adminSession: {
					status: "authorized",
					email: "admin@example.com",
					tier: "full",
					isCreator: true,
				},
				onupload: vi.fn(),
			},
		});

		const input = document.querySelector("input[type='file']") as HTMLInputElement;
		setInputFiles(input, [
			new File(["a"], "photo.jpg", { type: "image/jpeg" }),
			new File(["b"], "notes.txt", { type: "text/plain" }),
		]);

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("retry all (1)");
		});

		getButton("retry all (1)").click();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("1/2 uploaded");
		});
		expect(mocks.storage.presign).toHaveBeenCalledTimes(2);
		expect(document.body.textContent).toContain("File type not allowed");
		expect(document.body.textContent).not.toContain("retry all (1)");

		unmount(component);
	});

	it("wires select all and delete selected through to in-flight storage cleanup", async () => {
		mocks.storage.uploadFile
			.mockImplementationOnce(async () => new Promise(() => {}))
			.mockImplementationOnce(async () => new Promise(() => {}));

		const component = mount(GalleryUploader, {
			target: document.body,
			props: {
				galleryId: "gallery",
				adminSession: {
					status: "authorized",
					email: "admin@example.com",
					tier: "full",
					isCreator: true,
				},
				onupload: vi.fn(),
			},
		});

		const input = document.querySelector("input[type='file']") as HTMLInputElement;
		setInputFiles(input, [
			new File(["a"], "one.jpg", { type: "image/jpeg" }),
			new File(["b"], "two.jpg", { type: "image/jpeg" }),
		]);

		await vi.waitFor(() => {
			expect(mocks.storage.uploadFile).toHaveBeenCalledTimes(2);
			expect(document.querySelectorAll(".delete-checkbox")).toHaveLength(2);
		});

		(document.querySelector(".select-all-control input") as HTMLInputElement).click();
		await tick();
		expect(document.body.textContent).toContain("delete selected (2)");

		getButton("delete selected (2)").click();

		await vi.waitFor(() => {
			expect(mocks.storage.delete).toHaveBeenCalledTimes(2);
		});
		expect(mocks.storage.delete).toHaveBeenCalledWith({
			r2Key: "site/gallery/original/one.jpg",
			uploadSessionToken: "session-token",
		});
		expect(mocks.storage.delete).toHaveBeenCalledWith({
			r2Key: "site/gallery/original/two.jpg",
			uploadSessionToken: "session-token",
		});
		expect(document.body.textContent).not.toContain("one.jpg");
		expect(document.body.textContent).not.toContain("two.jpg");

		unmount(component);
	});
});
