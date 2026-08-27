// @vitest-environment jsdom
import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GalleryUploader from "../src/lib/pages/gallery-delivery/GalleryUploader.svelte";

const mocks = vi.hoisted(() => {
	const mutation = vi.fn(async () => "image-id");
	return { mutation };
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

let presignFailuresRemaining = 0;
let holdDirectUploads = false;

const controlledFetch = vi.fn(async (
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> => {
	const url = String(input);

	if (url === "/api/admin/galleries/upload-session") {
		return Response.json({
			uploadSessionToken: "session-token",
			expiresAt: Date.now() + 600_000,
		});
	}

	if (url === "/api/admin/galleries/presign") {
		if (presignFailuresRemaining > 0) {
			presignFailuresRemaining -= 1;
			throw new TypeError("temporary presign failure");
		}
		const { filename } = JSON.parse(String(init?.body));
		return Response.json({
			r2Key: `site/gallery/original/${filename}`,
			uploadUrl: `/upload/${filename}`,
			uploadToken: "worker-upload-token",
		});
	}

	if (url.startsWith("https://gallery-worker.example/upload/")) {
		if (!holdDirectUploads) return Response.json({ success: true });
		return new Promise<Response>((_resolve, reject) => {
			const signal = init?.signal;
			const rejectCanceled = () => reject(new DOMException("Request canceled", "AbortError"));
			if (signal?.aborted) rejectCanceled();
			else signal?.addEventListener("abort", rejectCanceled, { once: true });
		});
	}

	if (url === "/api/admin/galleries/process" || url === "/api/admin/galleries/delete") {
		return Response.json({ success: true });
	}

	throw new Error(`Unexpected gallery request: ${url}`);
});

function callsTo(path: string) {
	return controlledFetch.mock.calls.filter(([input]) => String(input) === path);
}

function requestBodies(path: string): unknown[] {
	return callsTo(path).map(([, init]) => JSON.parse(String(init?.body)));
}

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
		controlledFetch.mockClear();
		presignFailuresRemaining = 0;
		holdDirectUploads = false;
		vi.stubGlobal("fetch", controlledFetch);

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
			sourceFileCount: number;
			sourceSizeBytes: number;
			acceptedFileCount: number;
			acceptedSizeBytes: number;
			rejectedFileCount: number;
			rejectedSizeBytes: number;
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
			sourceFileCount: 2,
			sourceSizeBytes: 3,
			acceptedFileCount: 2,
			acceptedSizeBytes: 3,
			rejectedFileCount: 0,
			rejectedSizeBytes: 0,
		});
		expect(document.body.textContent).toContain("selected 2 files — 3 b");
		expect(document.body.textContent).toContain("uploadable 2 — 3 b");

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
			sourceFileCount: 2,
			sourceSizeBytes: 3,
			acceptedFileCount: 2,
			acceptedSizeBytes: 3,
			rejectedFileCount: 0,
			rejectedSizeBytes: 0,
		});

		unmount(component);
	});

	it("shows selected, uploadable, and skipped batch diagnostics", async () => {
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
			new File(["bb"], "notes.txt", { type: "text/plain" }),
		]);

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("selected 2 files — 3 b");
			expect(document.body.textContent).toContain("uploadable 1 — 1 b");
			expect(document.body.textContent).toContain("skipped 1 — 2 b");
		});

		unmount(component);
	});

	it("traverses dropped browser folder entries before queueing uploads", async () => {
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

		const photo = new File(["a"], "folder-photo.jpg", { type: "image/jpeg" });
		const raw = new File(["bb"], "folder-raw.raf", { type: "image/x-fuji-raf" });
		const fileEntry = (file: File) => ({
			isFile: true,
			isDirectory: false,
			file: (success: (value: File) => void) => success(file),
		});
		let readCount = 0;
		const directoryEntry = {
			isFile: false,
			isDirectory: true,
			createReader: () => ({
				readEntries: (success: (entries: unknown[]) => void) => {
					readCount += 1;
					success(readCount === 1 ? [fileEntry(photo), fileEntry(raw)] : []);
				},
			}),
		};
		const drop = new Event("drop", { bubbles: true, cancelable: true });
		Object.defineProperty(drop, "dataTransfer", {
			value: {
				files: [],
				items: [{ webkitGetAsEntry: () => directoryEntry }],
			},
		});

		document.querySelector(".uploader")?.dispatchEvent(drop);

		await vi.waitFor(() => {
			expect(callsTo("/api/admin/galleries/presign")).toHaveLength(2);
			expect(document.body.textContent).toContain("selected 2 files — 3 b");
			expect(document.body.textContent).toContain("folder-photo.jpg");
			expect(document.body.textContent).toContain("folder-raw.raf");
		});

		unmount(component);
	});

	it("wires retry all through to retryable upload failures only", async () => {
		presignFailuresRemaining = 1;

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
		expect(callsTo("/api/admin/galleries/presign")).toHaveLength(2);
		expect(document.body.textContent).toContain("File type not allowed");
		expect(document.body.textContent).not.toContain("retry all (1)");

		unmount(component);
	});

	it("wires select all and delete selected through to in-flight storage cleanup", async () => {
		holdDirectUploads = true;

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
			expect(controlledFetch.mock.calls.filter(([input]) =>
				String(input).startsWith("https://gallery-worker.example/upload/")
			)).toHaveLength(2);
			expect(document.querySelectorAll(".delete-checkbox")).toHaveLength(2);
		});

		(document.querySelector(".select-all-control input") as HTMLInputElement).click();
		await tick();
		expect(document.body.textContent).toContain("delete selected (2)");

		getButton("delete selected (2)").click();

		await vi.waitFor(() => {
			expect(callsTo("/api/admin/galleries/delete")).toHaveLength(2);
		});
		expect(requestBodies("/api/admin/galleries/delete")).toEqual([
			{
				r2Key: "site/gallery/original/one.jpg",
				uploadSessionToken: "session-token",
			},
			{
				r2Key: "site/gallery/original/two.jpg",
				uploadSessionToken: "session-token",
			},
		]);
		expect(document.body.textContent).not.toContain("one.jpg");
		expect(document.body.textContent).not.toContain("two.jpg");

		unmount(component);
	});
});
