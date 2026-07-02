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
		for (const method of Object.values(mocks.storage)) {
			method.mockClear();
		}

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
});
