import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	upload: vi.fn(),
}));

vi.mock("../src/lib/cmsMediaUpload", () => ({
	uploadCmsMediaFile: mocks.upload,
}));

import PortfolioMediaUploader from "../src/lib/pages/editor/PortfolioMediaUploader.svelte";
import PortfolioMediaUploaderHarness from "./PortfolioMediaUploaderHarness.svelte";

const components: ReturnType<typeof mount>[] = [];

function asset(id: string) {
	return {
		_id: id,
		assetId: "11111111-1111-4111-8111-111111111111",
		originalFilename: `${id}.jpg`,
		status: "ready" as const,
		source: {
			contentType: "image/jpeg",
			sizeBytes: 100,
			width: 1200,
			height: 800,
		},
		derivatives: {
			thumb: { key: `${id}/thumb.webp`, width: 320, height: 213 },
			card: { key: `${id}/card.webp`, width: 768, height: 512 },
		},
		createdAt: 1,
	};
}

function choose(input: HTMLInputElement, file: File) {
	Object.defineProperty(input, "files", {
		configurable: true,
		value: Object.assign([file], { item: (index: number) => index === 0 ? file : null }),
	});
	input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("portfolio media uploader capacity", () => {
	beforeEach(() => {
		mocks.upload.mockReset();
	});

	afterEach(() => {
		for (const component of components.splice(0)) unmount(component);
		document.body.innerHTML = "";
	});

	it("reserves an in-flight single slot against overlapping selections", async () => {
		let complete: ((value: ReturnType<typeof asset>) => void) | undefined;
		mocks.upload.mockImplementation(() => new Promise((resolve) => {
			complete = resolve;
		}));
		const onReady = vi.fn(() => true);
		components.push(mount(PortfolioMediaUploader, {
			target: document.body,
			props: {
				endpoint: "/api/admin/media",
				onReady,
				contextLabel: "product",
				multiple: false,
				maxFiles: 1,
			},
		}));
		await tick();
		const input = document.querySelector('input[type="file"]') as HTMLInputElement;
		expect(input.multiple).toBe(false);
		choose(input, new File(["one"], "one.jpg", { type: "image/jpeg" }));
		await tick();
		choose(input, new File(["two"], "two.jpg", { type: "image/jpeg" }));
		await tick();
		expect(mocks.upload).toHaveBeenCalledOnce();
		expect(document.body.textContent).toContain("Only 0 images fit in this section");

		complete?.(asset("one"));
		await tick();
		await Promise.resolve();
		await tick();
		expect(onReady).toHaveBeenCalledOnce();
		expect(document.body.textContent).not.toContain("one.jpg");
		expect(document.body.textContent).toContain("drop an image here or click to upload");
	});

	it("reports a registered upload honestly when the parent cannot attach it", async () => {
		mocks.upload.mockResolvedValue(asset("library-only"));
		const onReady = vi.fn(() => false);
		components.push(mount(PortfolioMediaUploader, {
			target: document.body,
			props: {
				endpoint: "/api/admin/media",
				onReady,
				contextLabel: "product",
				maxFiles: 1,
			},
		}));
		await tick();
		choose(
			document.querySelector('input[type="file"]') as HTMLInputElement,
			new File(["one"], "one.jpg", { type: "image/jpeg" }),
		);
		await tick();
		await Promise.resolve();
		await tick();
		expect(onReady).toHaveBeenCalledOnce();
		expect(document.body.textContent).toContain(
			"saved in the media library; not attached here",
		);
		expect(document.body.textContent).not.toContain("added to this product");
	});

	it("does not attach an upload after its product-scoped uploader is destroyed", async () => {
		let complete: ((value: ReturnType<typeof asset>) => void) | undefined;
		mocks.upload.mockImplementation(() => new Promise((resolve) => {
			complete = resolve;
		}));
		const onReady = vi.fn(() => true);
		const component = mount(PortfolioMediaUploader, {
			target: document.body,
			props: {
				endpoint: "/api/admin/media",
				onReady,
				contextLabel: "product",
			},
		});
		components.push(component);
		await tick();
		choose(
			document.querySelector('input[type="file"]') as HTMLInputElement,
			new File(["one"], "one.jpg", { type: "image/jpeg" }),
		);
		await tick();
		unmount(components.pop()!);
		complete?.(asset("one"));
		await Promise.resolve();
		await tick();
		expect(onReady).not.toHaveBeenCalled();
	});

	it("keeps an in-flight failure visible while saving disables new selection", async () => {
		let fail: ((reason: Error) => void) | undefined;
		mocks.upload.mockImplementation(() => new Promise((_resolve, reject) => {
			fail = reject;
		}));
		const onReady = vi.fn(() => true);
		const harness = mount(PortfolioMediaUploaderHarness, {
			target: document.body,
			props: { onReady },
		});
		components.push(harness);
		await tick();
		choose(
			document.querySelector('input[type="file"]') as HTMLInputElement,
			new File(["one"], "one.jpg", { type: "image/jpeg" }),
		);
		await tick();
		harness.setDisabled(true);
		await tick();
		expect(document.querySelector<HTMLInputElement>('input[type="file"]')?.disabled).toBe(true);
		fail?.(new Error("Image processing failed."));
		await Promise.resolve();
		await tick();
		expect(document.querySelector('[role="alert"]')?.textContent).toBe("Image processing failed.");
		expect(document.body.textContent).toContain("one.jpg");
		expect(Array.from(document.querySelectorAll("button")).find((item) => item.textContent === "retry")?.disabled).toBe(true);
	});
});
