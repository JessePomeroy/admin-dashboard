import { afterEach, describe, expect, it, vi } from "vitest";
import {
	completeCatalogPrivateEditorUpload,
	declareCatalogPrivateEditorUpload,
	isRootedQuerylessEndpoint,
	prepareCatalogPrivateEditorUpload,
	putCatalogPrivateEditorUpload,
	type CatalogPrivateEditorUploadPrepareRequest,
} from "../src/lib/catalogPrivateEditorUpload";

const HANDLE = "123e4567-e89b-42d3-a456-426614174000";
const SOURCE_URL = "https://cms-media-worker.thinkingofview.workers.dev/v1/catalog-assets/editor-uploads/source";

function png(width: number, height: number) {
	const bytes = new Uint8Array(24);
	bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
	new DataView(bytes.buffer).setUint32(16, width);
	new DataView(bytes.buffer).setUint32(20, height);
	return bytes;
}

function jpeg(width: number, height: number) {
	return new Uint8Array([
		0xff, 0xd8, 0xff, 0xc0, 0, 7, 8,
		height >> 8, height & 0xff, width >> 8, width & 0xff,
		0xff, 0xd9,
	]);
}

function declaration(): CatalogPrivateEditorUploadPrepareRequest {
	return {
		uploadHandle: HANDLE,
		productKind: "digital_download",
		originalFilename: "download.zip",
		contentType: "application/zip",
		sizeBytes: 3,
		sha256: "a".repeat(64),
	};
}

function verifiedAsset() {
	return {
		kind: "paid_digital_file",
		assetId: "asset-2",
		status: "verified",
		originalFilename: "download.zip",
		mimeType: "application/zip",
		sizeBytes: 3,
		version: "2.0.0",
		createdAt: 1_760_000_000_000,
		privateObjectKey: "must-not-survive",
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("catalog private editor browser upload protocol", () => {
	it.each([
		["PNG", new File([png(640, 480)], "source.png", { type: "image/png" }), "print", 640, 480],
		["JPEG", new File([jpeg(300, 200)], "source.JPG", { type: "image/jpeg" }), "print_set", 300, 200],
	] as const)("reads and hashes one encoded %s without raster decoding", async (
		_name,
		file,
		productKind,
		widthPixels,
		heightPixels,
	) => {
		const read = vi.spyOn(file, "arrayBuffer");
		const result = await declareCatalogPrivateEditorUpload(file, productKind, HANDLE);

		expect(read).toHaveBeenCalledOnce();
		expect(result).toEqual(expect.objectContaining({
			uploadHandle: HANDLE,
			productKind,
			originalFilename: file.name,
			contentType: file.type,
			sizeBytes: file.size,
			sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
			widthPixels,
			heightPixels,
		}));
	});

	it("bounds ZIP declarations and trims only the optional version", async () => {
		const file = new File(["zip"], "download.zip", { type: "application/zip" });
		expect(await declareCatalogPrivateEditorUpload(
			file,
			"digital_download",
			HANDLE,
			" 2.0.0 ",
		)).toEqual(expect.objectContaining({ version: "2.0.0", sizeBytes: 3 }));
		await expect(declareCatalogPrivateEditorUpload(
			new File([new Uint8Array(16_777_217)], "large.zip", { type: "application/zip" }),
			"digital_download",
			HANDLE,
		)).rejects.toThrow();
	});

	it("uses exact host requests, one opaque PUT, and handle-only manual reconciliation", async () => {
		const file = new File(["zip"], "download.zip", { type: "application/zip" });
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(Response.json({
				status: "upload_required",
				uploadHandle: HANDLE,
				uploadUrl: SOURCE_URL,
				uploadToken: "opaque-token",
				uploadExpiresAt: "2026-01-01T00:00:00.000Z",
				additivePrepareMetadata: { ignored: true },
			}))
			.mockResolvedValueOnce(new Response(null, { status: 204 }))
			.mockResolvedValueOnce(Response.json(
				{ status: "retry_later", additivePendingMetadata: "ignored" },
				{ status: 202, headers: { "Retry-After": "999999" } },
			))
			.mockResolvedValueOnce(Response.json({
				status: "verified",
				asset: verifiedAsset(),
				additiveCompletionMetadata: "ignored",
			}));
		vi.stubGlobal("fetch", fetchMock);

		const prepared = await prepareCatalogPrivateEditorUpload("/api/private/prepare", declaration());
		await putCatalogPrivateEditorUpload(prepared, file, "application/zip");
		expect(await completeCatalogPrivateEditorUpload("/api/private/complete", HANDLE)).toEqual({
			status: "pending",
			retryAfterMs: 300_000,
		});
		expect(await completeCatalogPrivateEditorUpload("/api/private/complete", HANDLE)).toEqual({
			status: "verified",
			asset: {
				kind: "paid_digital_file",
				assetId: "asset-2",
				status: "verified",
				originalFilename: "download.zip",
				mimeType: "application/zip",
				sizeBytes: 3,
				version: "2.0.0",
				createdAt: 1_760_000_000_000,
			},
		});

		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"/api/private/prepare",
			SOURCE_URL,
			"/api/private/complete",
			"/api/private/complete",
		]);
		const prepareInit = fetchMock.mock.calls[0][1] as RequestInit;
		expect(prepareInit).toMatchObject({ credentials: "same-origin", redirect: "error" });
		const putInit = fetchMock.mock.calls[1][1] as RequestInit;
		expect(putInit).toEqual({
			method: "PUT",
			headers: {
				"Content-Type": "application/zip",
				"X-CMS-Editor-Upload-Token": "opaque-token",
			},
			body: file,
			credentials: "omit",
			redirect: "error",
		});
		for (const call of fetchMock.mock.calls.slice(2)) {
			expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ uploadHandle: HANDLE });
		}
	});

	it("falls back to a five-second manual check after ambiguous completion", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => {
			throw new TypeError("lost response");
		}));
		expect(await completeCatalogPrivateEditorUpload("/api/private/complete", HANDLE)).toEqual({
			status: "pending",
			retryAfterMs: 5_000,
		});
	});

	it.each(["relative", "//other.example/path", "/path?query=1", "/path#fragment", "/a/../path"])(
		"rejects a non-rooted or normalized endpoint: %s",
		(endpoint) => expect(isRootedQuerylessEndpoint(endpoint)).toBe(false),
	);
});
