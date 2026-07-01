import { describe, expect, it, vi } from "vitest";
import { createGalleryStoragePort } from "../src/lib/pages/gallery-delivery/galleryStoragePort";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
	return Response.json(body, init);
}

function textResponse(body: string, init?: ResponseInit): Response {
	return new Response(body, init);
}

describe("createGalleryStoragePort", () => {
	it("starts upload sessions through the host endpoint", async () => {
		const fetcher = vi.fn(async () =>
			jsonResponse({ uploadSessionToken: "session-token", expiresAt: 1234 })
		) as unknown as typeof fetch;
		const port = createGalleryStoragePort({ fetch: fetcher });

		await expect(port.startUploadSession({
			siteUrl: "angelsrest.online",
			galleryId: "gallery-1",
		})).resolves.toEqual({ token: "session-token", expiresAt: 1234 });

		expect(fetcher).toHaveBeenCalledWith(
			"/api/admin/galleries/upload-session",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ siteUrl: "angelsrest.online", galleryId: "gallery-1" }),
			}),
		);
	});

	it("uploads directly to the Worker when the direct PUT succeeds", async () => {
		const fetcher = vi.fn(async () => jsonResponse({ success: true })) as unknown as typeof fetch;
		const port = createGalleryStoragePort({
			fetch: fetcher,
			galleryWorkerUrl: "https://gallery-worker.example",
		});

		await port.uploadFile({
			file: new Blob(["image"]),
			r2Key: "angelsrest.online/gallery-1/original/photo.jpg",
			uploadUrl: "/upload/put?key=abc&token=upload-token",
			contentType: "image/jpeg",
			uploadSessionToken: "session-token",
		});

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher).toHaveBeenCalledWith(
			"https://gallery-worker.example/upload/put?key=abc&token=upload-token",
			expect.objectContaining({
				method: "PUT",
				headers: { "Content-Type": "image/jpeg" },
			}),
		);
	});

	it.each([401, 403, 404])(
		"falls back to the host proxy when direct upload returns %i",
		async (status) => {
			const fetcher = vi.fn()
				.mockResolvedValueOnce(textResponse("nope", { status }))
				.mockResolvedValueOnce(jsonResponse({ success: true })) as unknown as typeof fetch;
			const port = createGalleryStoragePort({
				fetch: fetcher,
				galleryWorkerUrl: "https://gallery-worker.example",
			});

			await port.uploadFile({
				file: new Blob(["image"]),
				r2Key: "angelsrest.online/gallery-1/original/photo.jpg",
				uploadUrl: "/upload/put?key=abc&token=upload-token",
				contentType: "image/jpeg",
				uploadSessionToken: "session-token",
			});

			expect(fetcher).toHaveBeenCalledTimes(2);
			expect(fetcher).toHaveBeenLastCalledWith(
				"/api/admin/galleries/upload?key=angelsrest.online%2Fgallery-1%2Foriginal%2Fphoto.jpg",
				expect.objectContaining({
					method: "PUT",
					headers: {
						"Content-Type": "image/jpeg",
						"X-Gallery-Upload-Session": "session-token",
					},
				}),
			);
		},
	);

	it("does not fall back when direct upload returns a non-auth failure", async () => {
		const fetcher = vi.fn(async () =>
			textResponse("worker exploded", { status: 500 })
		) as unknown as typeof fetch;
		const port = createGalleryStoragePort({
			fetch: fetcher,
			galleryWorkerUrl: "https://gallery-worker.example",
		});

		await expect(port.uploadFile({
			file: new Blob(["image"]),
			r2Key: "angelsrest.online/gallery-1/original/photo.jpg",
			uploadUrl: "/upload/put?key=abc&token=upload-token",
			contentType: "image/jpeg",
			uploadSessionToken: "session-token",
		})).rejects.toThrow("Upload failed: 500 worker exploded");

		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it("falls back to the host proxy when the direct upload has a network-style failure", async () => {
		const fetcher = vi.fn()
			.mockRejectedValueOnce(new TypeError("Failed to fetch"))
			.mockResolvedValueOnce(jsonResponse({ success: true })) as unknown as typeof fetch;
		const port = createGalleryStoragePort({
			fetch: fetcher,
			galleryWorkerUrl: "https://gallery-worker.example",
		});

		await port.uploadFile({
			file: new Blob(["image"]),
			r2Key: "angelsrest.online/gallery-1/original/photo.jpg",
			uploadUrl: "/upload/put?key=abc&token=upload-token",
			contentType: "image/jpeg",
			uploadSessionToken: "session-token",
		});

		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("throws clear errors for failed process responses", async () => {
		const fetcher = vi.fn(async () =>
			textResponse("missing", { status: 404 })
		) as unknown as typeof fetch;
		const port = createGalleryStoragePort({ fetch: fetcher });

		await expect(port.process({
			r2Key: "angelsrest.online/gallery-1/original/photo.jpg",
			uploadSessionToken: "session-token",
		})).rejects.toThrow("Processing failed: 404 missing");
	});
});
