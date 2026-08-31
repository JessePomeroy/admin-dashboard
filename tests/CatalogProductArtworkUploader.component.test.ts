import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import CatalogProductArtworkUploader from "../src/lib/pages/editor/CatalogProductArtworkUploader.svelte";

const components: ReturnType<typeof mount>[] = [];

function choose(input: HTMLInputElement, files: File[]) {
	Object.defineProperty(input, "files", {
		configurable: true,
		value: Object.assign(files, { item: (index: number) => files[index] ?? null }),
	});
	input.dispatchEvent(new Event("change", { bubbles: true }));
}

afterEach(() => {
	for (const component of components.splice(0)) unmount(component);
	document.body.innerHTML = "";
});

describe("catalog product artwork uploader", () => {
	it("processes a print-set selection exactly one at a time and in file order", async () => {
		const releases: Array<() => void> = [];
		const onUpload = vi.fn((_file: File, onStatus: (status: "uploading") => void) => {
			onStatus("uploading");
			return new Promise<void>((resolve) => releases.push(resolve));
		});
		components.push(mount(CatalogProductArtworkUploader, {
			target: document.body,
			props: { multiple: true, maxFiles: 3, onUpload },
		}));
		await tick();
		const files = [
			new File(["a"], "a.jpg", { type: "image/jpeg" }),
			new File(["b"], "b.jpg", { type: "image/jpeg" }),
			new File(["c"], "c.jpg", { type: "image/jpeg" }),
		];
		choose(document.querySelector('input[type="file"]') as HTMLInputElement, files);
		await tick();
		expect(onUpload).toHaveBeenCalledTimes(1);
		expect(onUpload.mock.calls[0]?.[0].name).toBe("a.jpg");
		releases.shift()?.();
		await Promise.resolve();
		await tick();
		expect(onUpload).toHaveBeenCalledTimes(2);
		expect(onUpload.mock.calls[1]?.[0].name).toBe("b.jpg");
		releases.shift()?.();
		await Promise.resolve();
		await tick();
		expect(onUpload).toHaveBeenCalledTimes(3);
		expect(onUpload.mock.calls[2]?.[0].name).toBe("c.jpg");
	});

	it("accepts only one selected file for a single print", async () => {
		const onUpload = vi.fn(async () => {});
		components.push(mount(CatalogProductArtworkUploader, {
			target: document.body,
			props: { multiple: false, maxFiles: 1, onUpload },
		}));
		await tick();
		choose(document.querySelector('input[type="file"]') as HTMLInputElement, [
			new File(["a"], "a.jpg", { type: "image/jpeg" }),
			new File(["b"], "b.jpg", { type: "image/jpeg" }),
		]);
		await tick();
		expect(onUpload).toHaveBeenCalledOnce();
		expect(onUpload.mock.calls[0]?.[0].name).toBe("a.jpg");
		expect(document.body.textContent).toContain("Only 1 image fits");
	});

	it("holds later set images behind a failed earlier image until it succeeds", async () => {
		let firstAttempt = true;
		const order: string[] = [];
		const onUpload = vi.fn(async (file: File) => {
			order.push(file.name);
			if (file.name === "a.jpg" && firstAttempt) {
				firstAttempt = false;
				throw new Error("try a again");
			}
		});
		components.push(mount(CatalogProductArtworkUploader, {
			target: document.body,
			props: { multiple: true, maxFiles: 2, onUpload },
		}));
		await tick();
		choose(document.querySelector('input[type="file"]') as HTMLInputElement, [
			new File(["a"], "a.jpg", { type: "image/jpeg" }),
			new File(["b"], "b.jpg", { type: "image/jpeg" }),
		]);
		await Promise.resolve();
		await tick();
		expect(order).toEqual(["a.jpg"]);
		const retry = Array.from(document.querySelectorAll("button"))
			.find((button) => button.textContent === "retry") as HTMLButtonElement;
		retry.click();
		await Promise.resolve();
		await tick();
		await Promise.resolve();
		await tick();
		expect(order).toEqual(["a.jpg", "a.jpg", "b.jpg"]);
	});
});
