import { describe, expect, it, vi } from "vitest";
import { createGalleryStoragePort } from "../src/lib/pages/gallery-delivery/galleryStoragePort";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
	return Response.json(body, init);
}

function textResponse(body: string, init?: ResponseInit): Response {
	return new Response(body, init);
}

function createFetchMock(
	implementation: (
		input: RequestInfo | URL,
		init?: RequestInit,
	) => Promise<Response> = async () => new Response(),
) {
	return vi.fn(implementation);
}

describe("createGalleryStoragePort", () => {
	it("starts upload sessions through the host endpoint", async () => {
		const fetcher = createFetchMock(async () =>
			jsonResponse({ uploadSessionToken: "session-token", expiresAt: 1234 })
		);
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

	it("presigns with the exact size and retains a separate v2 upload capability", async () => {
		const fetcher = createFetchMock(async () => jsonResponse({
			r2Key: "angelsrest.online/gallery-1/original/photo.jpg",
			uploadUrl: "/upload/put?key=angelsrest.online%2Fgallery-1%2Foriginal%2Fphoto.jpg",
			uploadToken: "worker-upload-token",
		}));
		const port = createGalleryStoragePort({ fetch: fetcher });

		await expect(port.presign({
			siteUrl: "angelsrest.online",
			galleryId: "gallery-1",
			filename: "photo.jpg",
			contentType: "image/jpeg",
			sizeBytes: 5,
			uploadSessionToken: "session-token",
		})).resolves.toMatchObject({
			uploadToken: "worker-upload-token",
		});

		expect(JSON.parse(String(vi.mocked(fetcher).mock.calls[0]?.[1]?.body)))
			.toMatchObject({ sizeBytes: 5 });
	});

	it.each([
		["a missing upload URL", {
			r2Key: "angelsrest.online/gallery-1/original/photo.jpg",
			uploadToken: "worker-upload-token",
		}],
		["a missing token", {
			r2Key: "angelsrest.online/gallery-1/original/photo.jpg",
			uploadUrl: "/upload/put?key=abc",
		}],
		["a legacy query token", {
			r2Key: "angelsrest.online/gallery-1/original/photo.jpg",
			uploadUrl: "/upload/put?key=abc&token=legacy",
			uploadToken: "legacy",
		}],
	])("rejects a presign response with %s", async (_label, body) => {
		const fetcher = createFetchMock(async () => jsonResponse(body));
		const port = createGalleryStoragePort({ fetch: fetcher });

		await expect(port.presign({
			siteUrl: "angelsrest.online",
			galleryId: "gallery-1",
			filename: "photo.jpg",
			contentType: "image/jpeg",
			sizeBytes: 5,
			uploadSessionToken: "session-token",
		})).rejects.toThrow("Presign response was invalid");
	});

	it("rejects a missing presign size before contacting the host", async () => {
		const fetcher = createFetchMock();
		const port = createGalleryStoragePort({ fetch: fetcher });

		await expect(port.presign({
			siteUrl: "angelsrest.online",
			galleryId: "gallery-1",
			filename: "photo.jpg",
			contentType: "image/jpeg",
			uploadSessionToken: "session-token",
		})).rejects.toThrow("A positive upload size is required");
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("uploads directly to the Worker when the direct PUT succeeds", async () => {
		const fetcher = createFetchMock(async () => jsonResponse({ success: true }));
		const port = createGalleryStoragePort({
			fetch: fetcher,
			galleryWorkerUrl: "https://gallery-worker.example",
		});

		await port.uploadFile({
			file: new Blob(["image"]),
			r2Key: "angelsrest.online/gallery-1/original/photo.jpg",
			uploadUrl: "/upload/put?key=abc",
			uploadToken: "worker-upload-token",
			contentType: "image/jpeg",
			uploadSessionToken: "session-token",
		});

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher).toHaveBeenCalledWith(
			"https://gallery-worker.example/upload/put?key=abc",
			expect.objectContaining({
				method: "PUT",
				headers: {
					"Content-Type": "image/jpeg",
					"X-Gallery-Upload-Token": "worker-upload-token",
				},
			}),
		);
	});

	it("uses R2 multipart upload for files larger than one multipart part", async () => {
		let part = 0;
		const fetcher = createFetchMock(async (input) => {
			const action = new URL(String(input)).searchParams.get("action");
			if (action === "create") return jsonResponse({ uploadId: "upload-1" });
			if (action === "part") return jsonResponse({ partNumber: ++part, etag: `etag-${part}` });
			return jsonResponse({ success: true });
		});
		const port = createGalleryStoragePort({
			fetch: fetcher,
			galleryWorkerUrl: "https://gallery-worker.example",
		});
		const file = {
			size: 20 * 1024 * 1024 + 1,
			slice: vi.fn(() => new Blob(["part"])),
		} as unknown as Blob;

		await port.uploadFile({
			file,
			r2Key: "angelsrest.online/gallery-1/original/video.mov",
			uploadUrl: "/upload/put?key=video",
			uploadToken: "worker-upload-token",
			contentType: "video/quicktime",
			uploadSessionToken: "session-token",
		});

		expect(fetcher).toHaveBeenCalledTimes(4);
		expect(vi.mocked(fetcher).mock.calls.map(([url]) => new URL(String(url)).searchParams.get("action")))
			.toEqual(["create", "part", "part", "complete"]);
		expect(JSON.parse(String(vi.mocked(fetcher).mock.calls[3]?.[1]?.body))).toEqual({
			parts: [
				{ partNumber: 1, etag: "etag-1" },
				{ partNumber: 2, etag: "etag-2" },
			],
		});
	});

	it("retries transient multipart part failures", async () => {
		let partAttempts = 0;
		const fetcher = createFetchMock(async (input) => {
			const url = new URL(String(input));
			const action = url.searchParams.get("action");
			if (action === "create") return jsonResponse({ uploadId: "upload-1" });
			if (action === "part" && partAttempts++ === 0) {
				return textResponse("network connection lost", { status: 500 });
			}
			if (action === "part") return jsonResponse({
				partNumber: Number(url.searchParams.get("partNumber")),
				etag: `etag-${partAttempts}`,
			});
			return jsonResponse({ success: true });
		});
		const port = createGalleryStoragePort({
			fetch: fetcher,
			galleryWorkerUrl: "https://gallery-worker.example",
		});

		await port.uploadFile({
			file: {
				size: 20 * 1024 * 1024 + 1,
				slice: () => new Blob(["part"]),
			} as unknown as Blob,
			r2Key: "angelsrest.online/gallery-1/original/photo.jpg",
			uploadUrl: "/upload/put?key=photo",
			uploadToken: "worker-upload-token",
			contentType: "image/jpeg",
			uploadSessionToken: "session-token",
		});

		expect(partAttempts).toBe(3);
	});

	it.each([401, 403, 404])(
		"does not proxy the file when direct upload returns %i",
		async (status) => {
			const fetcher = createFetchMock(async () => textResponse("nope", { status }));
			const port = createGalleryStoragePort({
				fetch: fetcher,
				galleryWorkerUrl: "https://gallery-worker.example",
			});

			await expect(port.uploadFile({
				file: new Blob(["image"]),
				r2Key: "angelsrest.online/gallery-1/original/photo.jpg",
				uploadUrl: "/upload/put?key=abc",
				uploadToken: "worker-upload-token",
				contentType: "image/jpeg",
				uploadSessionToken: "session-token",
			})).rejects.toThrow(`Upload failed: ${status} nope`);

			expect(fetcher).toHaveBeenCalledTimes(1);
		},
	);

	it("does not fall back when direct upload returns a non-auth failure", async () => {
		const fetcher = createFetchMock(async () =>
			textResponse("worker exploded", { status: 500 })
		);
		const port = createGalleryStoragePort({
			fetch: fetcher,
			galleryWorkerUrl: "https://gallery-worker.example",
		});

		await expect(port.uploadFile({
			file: new Blob(["image"]),
			r2Key: "angelsrest.online/gallery-1/original/photo.jpg",
			uploadUrl: "/upload/put?key=abc",
			uploadToken: "worker-upload-token",
			contentType: "image/jpeg",
			uploadSessionToken: "session-token",
		})).rejects.toThrow("Upload failed: 500 worker exploded");

		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it("does not proxy the file after a direct network failure", async () => {
		const fetcher = createFetchMock(async () => {
			throw new TypeError("Failed to fetch");
		});
		const port = createGalleryStoragePort({
			fetch: fetcher,
			galleryWorkerUrl: "https://gallery-worker.example",
		});

		await expect(port.uploadFile({
			file: new Blob(["image"]),
			r2Key: "angelsrest.online/gallery-1/original/photo.jpg",
			uploadUrl: "/upload/put?key=abc",
			uploadToken: "worker-upload-token",
			contentType: "image/jpeg",
			uploadSessionToken: "session-token",
		})).rejects.toThrow("Failed to fetch");

		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it("does not fall back after an atomic Worker collision", async () => {
		const fetcher = createFetchMock(async () =>
			textResponse("Upload key already exists", { status: 409 })
		);
		const port = createGalleryStoragePort({
			fetch: fetcher,
			galleryWorkerUrl: "https://gallery-worker.example",
		});

		await expect(port.uploadFile({
			file: new Blob(["image"]),
			r2Key: "angelsrest.online/gallery-1/original/photo.jpg",
			uploadUrl: "/upload/put?key=abc",
			uploadToken: "worker-upload-token",
			contentType: "image/jpeg",
			uploadSessionToken: "session-token",
		})).rejects.toThrow("File already exists");

		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it("requires an upload capability before direct or proxy upload", async () => {
		const fetcher = createFetchMock();
		const port = createGalleryStoragePort({
			fetch: fetcher,
			galleryWorkerUrl: "https://gallery-worker.example",
		});

		await expect(port.uploadFile({
			file: new Blob(["image"]),
			r2Key: "angelsrest.online/gallery-1/original/photo.jpg",
			uploadUrl: "/upload/put?key=abc",
			contentType: "image/jpeg",
			uploadSessionToken: "session-token",
		})).rejects.toThrow("Upload capability is required");
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("throws clear errors for failed process responses", async () => {
		const fetcher = createFetchMock(async () =>
			textResponse("missing", { status: 404 })
		);
		const port = createGalleryStoragePort({ fetch: fetcher });

		await expect(port.process({
			r2Key: "angelsrest.online/gallery-1/original/photo.jpg",
			uploadSessionToken: "session-token",
		})).rejects.toThrow("Processing failed: 404 missing");
	});
});
