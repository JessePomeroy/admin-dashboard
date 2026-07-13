import { afterEach, describe, expect, it, vi } from "vitest";
import { setServerConfig, type AdminServerConfig } from "../src/lib/config";
import {
	createGalleryBulkDeleteHandler,
	createGalleryDeleteHandler,
	createGalleryImageHandler,
	createGalleryPresignHandler,
	createGalleryProcessHandler,
	createGalleryUploadHandler,
	createGalleryUploadSessionHandler,
} from "../src/lib/server/handlers/galleryPresign";

function configureServer(
	siteUrl = "tenant.example",
) {
	const verifyAdmin = vi.fn(async () => true);
	setServerConfig({
		siteUrl,
		siteName: "tenant",
		fromEmail: "admin@example.com",
		isCreator: false,
		// biome-ignore lint/suspicious/noExplicitAny: tests only exercise server handler config.
		api: {} as any,
		convexUrl: "https://convex.example",
		resendApiKey: "resend-key",
		galleryWorkerUrl: "https://gallery.example",
		galleryAdminSecret: "gallery-secret",
		verifyAdmin,
	} satisfies AdminServerConfig);
	return verifyAdmin;
}

function jsonRequest(
	path: string,
	body: unknown,
	options: { method?: string; headers?: Record<string, string> } = {},
): Request {
	return new Request(`https://tenant.example${path}`, {
		method: options.method ?? "POST",
		body: JSON.stringify(body),
		headers: {
			"Content-Type": "application/json",
			cookie: "session=admin-token",
			...options.headers,
		},
	});
}

function uploadRequest(key: string, uploadSessionToken?: string): Request {
	return new Request(
		`https://tenant.example/api/admin/galleries/upload?key=${encodeURIComponent(key)}`,
		{
			method: "PUT",
			body: new Blob(["image"]),
			headers: {
				"Content-Type": "image/jpeg",
				cookie: "session=admin-token",
				...(uploadSessionToken
					? { "X-Gallery-Upload-Session": uploadSessionToken }
					: {}),
			},
		},
	);
}

async function issueUploadSessionToken(siteUrl = "tenant.example"): Promise<string> {
	const response = await createGalleryUploadSessionHandler()({
		request: jsonRequest("/api/admin/galleries/upload-session", {
			siteUrl,
			galleryId: "gallery-1",
		}),
	});
	return (await response.json()).uploadSessionToken;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("gallery tenant boundary", () => {
	it("rejects an authenticated foreign-site presign before contacting the Worker", async () => {
		const verifyAdmin = configureServer();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(createGalleryPresignHandler()({
			request: jsonRequest("/api/admin/galleries/presign", {
				siteUrl: "other.example",
				galleryId: "gallery-1",
				filename: "photo.jpg",
				contentType: "image/jpeg",
			}),
		})).rejects.toMatchObject({ status: 403 });
		expect(verifyAdmin).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects a foreign upload without a grant before forwarding its stream", async () => {
		configureServer();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(createGalleryUploadHandler()({
			request: uploadRequest("other.example/gallery-1/original/photo.jpg"),
		})).rejects.toMatchObject({ status: 403 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("does not let an invalid grant fall back into a foreign process request", async () => {
		configureServer();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(createGalleryProcessHandler()({
			request: jsonRequest("/api/admin/galleries/process", {
				r2Key: "other.example/gallery-1/original/photo.jpg",
				uploadSessionToken: "invalid-token",
			}),
		})).rejects.toMatchObject({ status: 403 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects a foreign delete without a grant before contacting the Worker", async () => {
		configureServer();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(createGalleryDeleteHandler()({
			request: jsonRequest("/api/admin/galleries/delete", {
				r2Key: "other.example/gallery-1/original/photo.jpg",
			}),
		})).rejects.toMatchObject({ status: 403 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects a valid tenant-A grant after the receiving host changes to tenant B", async () => {
		configureServer("tenant-a.example");
		const uploadSessionToken = await issueUploadSessionToken("tenant-a.example");
		configureServer("tenant-b.example");
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(createGalleryDeleteHandler()({
			request: jsonRequest("/api/admin/galleries/delete", {
				r2Key: "tenant-b.example/gallery-1/original/photo.jpg",
				uploadSessionToken,
			}),
		})).rejects.toMatchObject({ status: 403 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("preserves same-site deletion through the authenticated fallback", async () => {
		const verifyAdmin = configureServer();
		const fetchMock = vi.fn(async () => Response.json({ success: true }));
		vi.stubGlobal("fetch", fetchMock);

		const response = await createGalleryDeleteHandler()({
			request: jsonRequest("/api/admin/galleries/delete", {
				r2Key: "tenant.example/gallery-1/original/photo.jpg",
			}),
		});

		expect(response.status).toBe(200);
		expect(verifyAdmin).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://gallery.example/upload/delete",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("preserves all same-site grant operations without forwarding the grant", async () => {
		const verifyAdmin = configureServer();
		const uploadSessionToken = await issueUploadSessionToken();
		verifyAdmin.mockClear();
		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			if (String(input).endsWith("/upload/presign")) {
				return Response.json({
					r2Key: "tenant.example/gallery-1/original/photo.jpg",
					uploadUrl: "/upload/put",
				});
			}
			return Response.json({ success: true });
		});
		vi.stubGlobal("fetch", fetchMock);

		await createGalleryPresignHandler()({
			request: jsonRequest("/api/admin/galleries/presign", {
				siteUrl: "tenant.example",
				galleryId: "gallery-1",
				filename: "photo.jpg",
				contentType: "image/jpeg",
				uploadSessionToken,
			}),
		});
		await createGalleryUploadHandler()({
			request: uploadRequest(
				"tenant.example/gallery-1/original/photo.jpg",
				uploadSessionToken,
			),
		});
		await createGalleryProcessHandler()({
			request: jsonRequest("/api/admin/galleries/process", {
				r2Key: "tenant.example/gallery-1/original/photo.jpg",
				uploadSessionToken,
			}),
		});
		await createGalleryDeleteHandler()({
			request: jsonRequest("/api/admin/galleries/delete", {
				r2Key: "tenant.example/gallery-1/original/photo.jpg",
				uploadSessionToken,
			}),
		});

		expect(verifyAdmin).not.toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledTimes(4);
		const presignCall = fetchMock.mock.calls.find(([input]) =>
			String(input).endsWith("/upload/presign")
		);
		const processCall = fetchMock.mock.calls.find(([input]) =>
			String(input).endsWith("/upload/process")
		);
		expect(JSON.parse(String(presignCall?.[1]?.body))).toEqual({
			siteUrl: "tenant.example",
			galleryId: "gallery-1",
			filename: "photo.jpg",
			contentType: "image/jpeg",
		});
		expect(JSON.parse(String(processCall?.[1]?.body))).toEqual({
			r2Key: "tenant.example/gallery-1/original/photo.jpg",
		});
	});

	it.each(["gallery/child", "gallery\\child", ".", ".."])(
		"does not issue a grant for malformed gallery ID %s",
		async (galleryId) => {
			configureServer();
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);

			await expect(createGalleryUploadSessionHandler()({
				request: jsonRequest("/api/admin/galleries/upload-session", {
					siteUrl: "tenant.example",
					galleryId,
				}),
			})).rejects.toMatchObject({ status: 400 });
			expect(fetchMock).not.toHaveBeenCalled();
		},
	);

	it("canonicalizes trailing-slash host configuration before signing and presigning", async () => {
		configureServer("tenant.example/");
		const uploadSessionToken = await issueUploadSessionToken("tenant.example/");
		const fetchMock = vi.fn(async () => Response.json({
			r2Key: "tenant.example/gallery-1/original/photo.jpg",
		}));
		vi.stubGlobal("fetch", fetchMock);

		await createGalleryPresignHandler()({
			request: jsonRequest("/api/admin/galleries/presign", {
				siteUrl: "tenant.example/",
				galleryId: "gallery-1",
				filename: "photo.jpg",
				contentType: "image/jpeg",
				uploadSessionToken,
			}),
		});

		expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).siteUrl)
			.toBe("tenant.example");
	});

	it("rejects nested-prefix keys in bulk-delete and admin-image handlers", async () => {
		configureServer("https://tenant.example");
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const nestedKey = "https://tenant.example/sub/gallery-1/thumb/photo.jpg";

		await expect(createGalleryBulkDeleteHandler()({
			request: jsonRequest("/api/admin/galleries/bulk-delete", { keys: [nestedKey] }),
		})).rejects.toMatchObject({ status: 403 });
		const imageRequest = new Request(
			`https://tenant.example/api/admin/galleries/image?key=${encodeURIComponent(nestedKey)}`,
			{ headers: { cookie: "session=admin-token" } },
		);
		await expect(createGalleryImageHandler()({
			request: imageRequest,
			url: new URL(imageRequest.url),
		})).rejects.toMatchObject({ status: 403 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects non-original keys for process operations", async () => {
		configureServer();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(createGalleryProcessHandler()({
			request: jsonRequest("/api/admin/galleries/process", {
				r2Key: "tenant.example/gallery-1/thumb/photo.jpg",
			}),
		})).rejects.toMatchObject({ status: 400 });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
