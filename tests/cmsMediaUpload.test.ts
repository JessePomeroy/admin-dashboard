import { describe, expect, it, vi } from "vitest";
import {
	CMS_MEDIA_UPLOAD_TOKEN_HEADER,
	uploadCmsMediaFile,
	validateCmsMediaFile,
} from "../src/lib/cmsMediaUpload";

function image(name = "portrait.jpg", options: { type?: string; size?: number } = {}) {
	const bytes = new Uint8Array(options.size ?? 5);
	return new File([bytes], name, { type: options.type ?? "image/jpeg" });
}

describe("CMS media browser upload", () => {
	it("rejects unsupported, oversized, and unsafe files before upload", () => {
		expect(validateCmsMediaFile(image("portrait.gif", { type: "image/gif" }))).toMatch(/JPEG/);
		expect(validateCmsMediaFile({ name: "portrait.jpg", type: "image/jpeg", size: 20_000_001 })).toMatch(/20 MB/);
		expect(validateCmsMediaFile(image("folder/portrait.jpg"))).toMatch(/Rename/);
	});

	it("issues a capability, uploads directly, then completes through the host", async () => {
		const asset = {
			_id: "media-1",
			assetId: "123e4567-e89b-42d3-a456-426614174000",
			originalFilename: "portrait.jpg",
			status: "ready" as const,
			source: { contentType: "image/jpeg", sizeBytes: 5, width: 10, height: 10 },
			derivatives: {
				thumb: { key: "thumb.webp", width: 10, height: 10 },
				card: { key: "card.webp", width: 10, height: 10 },
			},
			createdAt: 1,
		};
		const request = vi.fn()
			.mockResolvedValueOnce(Response.json({
				assetId: asset.assetId,
				privateObjectKey: "sites/tenant.example/web/id/source.jpg",
				uploadUrl: "https://cms-media.example/v1/uploads/source?key=source",
				uploadToken: "one-file-token",
				expiresAt: "2026-07-16T12:00:00.000Z",
			}))
			.mockResolvedValueOnce(Response.json({ success: true }))
			.mockResolvedValueOnce(Response.json({ asset }));
		const statuses: string[] = [];

		await expect(uploadCmsMediaFile(image(), {
			endpoint: "/api/admin/media/",
			fetch: request,
			onStatus: (status) => statuses.push(status),
		})).resolves.toEqual(asset);

		expect(request).toHaveBeenCalledTimes(3);
		expect(request.mock.calls[0][0]).toBe("/api/admin/media/capability");
		expect(request.mock.calls[1][1].headers).toMatchObject({
			"Content-Type": "image/jpeg",
			[CMS_MEDIA_UPLOAD_TOKEN_HEADER]: "one-file-token",
		});
		expect(request.mock.calls[2][0]).toBe("/api/admin/media/process");
		expect(statuses).toEqual(["authorizing", "uploading", "processing", "done"]);
	});

	it("surfaces Worker text without advancing to processing", async () => {
		const request = vi.fn()
			.mockResolvedValueOnce(Response.json({
				privateObjectKey: "sites/tenant.example/web/id/source.jpg",
				uploadUrl: "https://cms-media.example/v1/uploads/source?key=source",
				uploadToken: "one-file-token",
			}))
			.mockResolvedValueOnce(new Response("Upload key already exists", { status: 409 }));

		await expect(uploadCmsMediaFile(image(), {
			endpoint: "/api/admin/media",
			fetch: request,
		})).rejects.toThrow(/already exists/);
		expect(request).toHaveBeenCalledTimes(2);
	});
});
