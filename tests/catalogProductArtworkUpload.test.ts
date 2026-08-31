import { describe, expect, it, vi } from "vitest";
import {
	catalogProductDisplayDimensions,
	createCatalogProductDisplayFile,
	uploadCatalogProductArtwork,
} from "../src/lib/catalogProductArtworkUpload";

const PRIVATE_ASSET = {
	kind: "print_source" as const,
	assetId: "private-asset",
	status: "verified" as const,
	originalFilename: "large.jpg",
	mimeType: "image/jpeg" as const,
	sizeBytes: 21_000_000,
	widthPixels: 8_000,
	heightPixels: 6_000,
	createdAt: 1,
};

const WRONG_KIND_ASSET = {
	kind: "paid_digital_file" as const,
	assetId: "private-download",
	status: "verified" as const,
	originalFilename: "download.zip",
	mimeType: "application/zip" as const,
	sizeBytes: 100,
	createdAt: 1,
};

const DISPLAY_ASSET = {
	_id: "media-asset",
	assetId: "11111111-1111-4111-8111-111111111111",
	originalFilename: "large-display.webp",
	status: "ready" as const,
	source: { contentType: "image/webp", sizeBytes: 100, width: 4_096, height: 3_072 },
	derivatives: {
		thumb: { key: "thumb.webp", width: 320, height: 240 },
		card: { key: "card.webp", width: 768, height: 576 },
	},
	createdAt: 1,
};

const DECLARATION = {
	uploadHandle: "11111111-1111-4111-8111-111111111111",
	productKind: "print" as const,
	originalFilename: "large.jpg",
	contentType: "image/jpeg" as const,
	sizeBytes: 21_000_000,
	sha256: "a".repeat(64),
	widthPixels: 8_000,
	heightPixels: 6_000,
};

describe("catalog product artwork upload", () => {
	it("bounds both display edges without enlarging small artwork", () => {
		expect(catalogProductDisplayDimensions({ widthPixels: 8_000, heightPixels: 6_000 }))
			.toEqual({ width: 4_096, height: 3_072 });
		expect(catalogProductDisplayDimensions({ widthPixels: 2_000, heightPixels: 6_000 }))
			.toEqual({ width: 1_365, height: 4_096 });
		expect(catalogProductDisplayDimensions({ widthPixels: 800, heightPixels: 600 }))
			.toEqual({ width: 800, height: 600 });
	});

	it("keeps a source already accepted by the web pipeline", async () => {
		const file = new File([new Uint8Array(1_000)], "small.jpg", { type: "image/jpeg" });
		expect(await createCatalogProductDisplayFile(file, {
			widthPixels: 1_200,
			heightPixels: 800,
		})).toBe(file);
	});

	it("uses the injected renderer for a large source and enforces the web limit", async () => {
		const file = { name: "large.jpg", type: "image/jpeg", size: 21_000_000 } as File;
		const rendered = new File(["display"], "large-display.webp", { type: "image/webp" });
		const render = vi.fn(async () => rendered);
		expect(await createCatalogProductDisplayFile(file, {
			widthPixels: 8_000,
			heightPixels: 6_000,
		}, { render })).toBe(rendered);
		expect(render).toHaveBeenCalledWith(file, { width: 4_096, height: 3_072 }, undefined);
	});

	it("resumes at public processing from a verified private checkpoint", async () => {
		const file = { name: "large.jpg", type: "image/jpeg", size: 21_000_000 } as File;
		const displayFile = new File(["display"], "large-display.webp", { type: "image/webp" });
		const uploadMedia = vi.fn(async () => DISPLAY_ASSET);
		const statuses: string[] = [];
		const result = await uploadCatalogProductArtwork(file, {
			productKind: "print",
			privatePrepareEndpoint: "/prepare",
			privateCompleteEndpoint: "/complete",
			mediaEndpoint: "/media",
			checkpoint: {
				declaration: DECLARATION,
				displayFile,
				putIssued: true,
				privateAsset: PRIVATE_ASSET,
			},
			uploadMedia,
			onStatus: (status) => statuses.push(status),
		});
		expect(result).toEqual({ displayAsset: DISPLAY_ASSET, privateAsset: PRIVATE_ASSET });
		expect(uploadMedia).toHaveBeenCalledWith(displayFile, expect.objectContaining({
			endpoint: "/media",
		}));
		expect(statuses).toEqual(["processing", "ready"]);
	});

	it("reuses a ready display asset instead of uploading it twice", async () => {
		const file = { name: "large.jpg", type: "image/jpeg", size: 21_000_000 } as File;
		const uploadMedia = vi.fn(async () => DISPLAY_ASSET);
		await expect(uploadCatalogProductArtwork(file, {
			productKind: "print",
			privatePrepareEndpoint: "/prepare",
			privateCompleteEndpoint: "/complete",
			mediaEndpoint: "/media",
			checkpoint: {
				declaration: DECLARATION,
				displayFile: new File(["display"], "large-display.webp", { type: "image/webp" }),
				putIssued: true,
				privateAsset: PRIVATE_ASSET,
				displayAsset: DISPLAY_ASSET,
			},
			uploadMedia,
		})).resolves.toEqual({ displayAsset: DISPLAY_ASSET, privateAsset: PRIVATE_ASSET });
		expect(uploadMedia).not.toHaveBeenCalled();
	});

	it("rejects a checkpoint from a different file or product kind", async () => {
		const checkpoint = {
			declaration: DECLARATION,
			displayFile: new File(["display"], "large-display.webp", { type: "image/webp" }),
			putIssued: true,
			privateAsset: PRIVATE_ASSET,
			displayAsset: DISPLAY_ASSET,
		};
		await expect(uploadCatalogProductArtwork(
			{ name: "other.jpg", type: "image/jpeg", size: 21_000_000 } as File,
			{
				productKind: "print",
				privatePrepareEndpoint: "/prepare",
				privateCompleteEndpoint: "/complete",
				mediaEndpoint: "/media",
				checkpoint,
			},
		)).rejects.toThrow(/does not match/i);
		await expect(uploadCatalogProductArtwork(
			{ name: "large.jpg", type: "image/jpeg", size: 21_000_000 } as File,
			{
				productKind: "print_set",
				privatePrepareEndpoint: "/prepare",
				privateCompleteEndpoint: "/complete",
				mediaEndpoint: "/media",
				checkpoint,
			},
		)).rejects.toThrow(/does not match/i);
	});

	it("reuses the exact declaration and display rendition after a pre-verification retry", async () => {
		const file = { name: "large.jpg", type: "image/jpeg", size: 21_000_000 } as File;
		const displayFile = new File(["display"], "large-display.webp", { type: "image/webp" });
		const declare = vi.fn(async () => DECLARATION);
		const render = vi.fn(async () => displayFile);
		const prepare = vi.fn(async () => ({ uploadUrl: "/source", uploadToken: "token" }));
		const put = vi.fn(async () => {});
		const complete = vi.fn()
			.mockResolvedValueOnce({ status: "pending", retryAfterMs: 1 })
			.mockResolvedValueOnce({ status: "verified", asset: PRIVATE_ASSET });
		let checkpoint: Parameters<typeof uploadCatalogProductArtwork>[1]["checkpoint"];
		const common = {
			productKind: "print" as const,
			privatePrepareEndpoint: "/prepare",
			privateCompleteEndpoint: "/complete",
			mediaEndpoint: "/media",
			createDisplayFile: (source: File, dimensions: { widthPixels: number; heightPixels: number }) =>
				createCatalogProductDisplayFile(source, dimensions, { render }),
			uploadMedia: vi.fn(async () => DISPLAY_ASSET),
			privateClient: {
				newHandle: () => DECLARATION.uploadHandle,
				declare,
				prepare,
				put,
				complete,
			},
			onCheckpoint: (value: NonNullable<typeof checkpoint>) => { checkpoint = value; },
		};
		await expect(uploadCatalogProductArtwork(file, {
			...common,
			wait: async () => { throw new Error("pause retry"); },
		})).rejects.toThrow("pause retry");
		expect(checkpoint?.declaration.uploadHandle).toBe(DECLARATION.uploadHandle);

		await expect(uploadCatalogProductArtwork(file, {
			...common,
			checkpoint,
		})).resolves.toEqual({ displayAsset: DISPLAY_ASSET, privateAsset: PRIVATE_ASSET });
		expect(declare).toHaveBeenCalledOnce();
		expect(render).toHaveBeenCalledOnce();
		expect(prepare).toHaveBeenCalledOnce();
		expect(prepare.mock.calls[0]?.[1].uploadHandle).toBe(DECLARATION.uploadHandle);
		expect(put).toHaveBeenCalledOnce();
		expect(complete.mock.calls.map((call) => call[1]))
			.toEqual([DECLARATION.uploadHandle, DECLARATION.uploadHandle]);
	});

	it("bounds a pending verification and resumes the same upload on retry", async () => {
		const file = { name: "large.jpg", type: "image/jpeg", size: 21_000_000 } as File;
		const displayFile = new File(["display"], "large-display.webp", { type: "image/webp" });
		const complete = vi.fn()
			.mockResolvedValueOnce({ status: "pending", retryAfterMs: 1 })
			.mockResolvedValueOnce({ status: "pending", retryAfterMs: 1 })
			.mockResolvedValueOnce({ status: "verified", asset: PRIVATE_ASSET });
		const prepare = vi.fn(async () => ({ uploadUrl: "/source", uploadToken: "token" }));
		const put = vi.fn(async () => {});
		let checkpoint: Parameters<typeof uploadCatalogProductArtwork>[1]["checkpoint"];
		const common = {
			productKind: "print" as const,
			privatePrepareEndpoint: "/prepare",
			privateCompleteEndpoint: "/complete",
			mediaEndpoint: "/media",
			verificationCheckLimit: 2,
			wait: async () => {},
			createDisplayFile: vi.fn(async () => displayFile),
			uploadMedia: vi.fn(async () => DISPLAY_ASSET),
			privateClient: {
				newHandle: () => DECLARATION.uploadHandle,
				declare: vi.fn(async () => DECLARATION),
				prepare,
				put,
				complete,
			},
			onCheckpoint: (value: NonNullable<typeof checkpoint>) => { checkpoint = value; },
		};
		await expect(uploadCatalogProductArtwork(file, common))
			.rejects.toThrow(/still processing/i);
		await expect(uploadCatalogProductArtwork(file, { ...common, checkpoint }))
			.resolves.toEqual({ displayAsset: DISPLAY_ASSET, privateAsset: PRIVATE_ASSET });
		expect(prepare).toHaveBeenCalledOnce();
		expect(put).toHaveBeenCalledOnce();
		expect(complete.mock.calls.map((call) => call[1]))
			.toEqual([DECLARATION.uploadHandle, DECLARATION.uploadHandle, DECLARATION.uploadHandle]);
	});

	it.each([
		["failed", { status: "failed" as const }],
		["wrong-kind", { status: "verified" as const, asset: WRONG_KIND_ASSET }],
	])("starts a fresh declaration and PUT when Retry follows %s verification", async (
		_status,
		terminalCompletion,
	) => {
		const file = { name: "large.jpg", type: "image/jpeg", size: 21_000_000 } as File;
		const displayFile = new File(["display"], "large-display.webp", { type: "image/webp" });
		const handles = [
			DECLARATION.uploadHandle,
			"22222222-2222-4222-8222-222222222222",
		];
		const newHandle = vi.fn(() => handles.shift()!);
		const declare = vi.fn(async (
			_source: File,
			_productKind: "print" | "print_set",
			uploadHandle: string,
		) => ({ ...DECLARATION, uploadHandle }));
		const prepare = vi.fn(async () => ({ uploadUrl: "/source", uploadToken: "token" }));
		const put = vi.fn(async () => {});
		const complete = vi.fn()
			.mockResolvedValueOnce(terminalCompletion)
			.mockResolvedValueOnce({ status: "verified", asset: PRIVATE_ASSET });
		let checkpoint: Parameters<typeof uploadCatalogProductArtwork>[1]["checkpoint"];
		const onCheckpointInvalidated = vi.fn((invalidated) => {
			if (checkpoint === invalidated) checkpoint = undefined;
		});
		const common = {
			productKind: "print" as const,
			privatePrepareEndpoint: "/prepare",
			privateCompleteEndpoint: "/complete",
			mediaEndpoint: "/media",
			createDisplayFile: vi.fn(async () => displayFile),
			uploadMedia: vi.fn(async () => DISPLAY_ASSET),
			privateClient: { newHandle, declare, prepare, put, complete },
			onCheckpoint: (value: NonNullable<typeof checkpoint>) => { checkpoint = value; },
			onCheckpointInvalidated,
		};

		await expect(uploadCatalogProductArtwork(file, common)).rejects.toThrow();
		expect(onCheckpointInvalidated).toHaveBeenCalledOnce();
		expect(checkpoint).toBeUndefined();
		await expect(uploadCatalogProductArtwork(file, { ...common, checkpoint }))
			.resolves.toEqual({ displayAsset: DISPLAY_ASSET, privateAsset: PRIVATE_ASSET });

		expect(newHandle).toHaveBeenCalledTimes(2);
		expect(declare.mock.calls.map((call) => call[2])).toEqual([
			DECLARATION.uploadHandle,
			"22222222-2222-4222-8222-222222222222",
		]);
		expect(prepare.mock.calls.map((call) => call[1].uploadHandle)).toEqual([
			DECLARATION.uploadHandle,
			"22222222-2222-4222-8222-222222222222",
		]);
		expect(put).toHaveBeenCalledTimes(2);
		expect(complete.mock.calls.map((call) => call[1])).toEqual([
			DECLARATION.uploadHandle,
			"22222222-2222-4222-8222-222222222222",
		]);
	});
});
