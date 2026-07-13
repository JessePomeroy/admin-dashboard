import { error } from "@sveltejs/kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setServerConfig, type AdminServerConfig } from "../src/lib/config";
import {
	createGalleryBulkDeleteHandler,
	createGalleryDeleteHandler,
	createGalleryImageHandler,
	createGalleryProcessHandler,
	createGalleryUploadSessionHandler,
} from "../src/lib/server/handlers/galleryPresign";

function configureServerConfig(
	overrides: Partial<AdminServerConfig> = {},
): void {
	setServerConfig({
		siteUrl: "https://tenant.example",
		siteName: "tenant",
		fromEmail: "admin@example.com",
		isCreator: false,
		// biome-ignore lint/suspicious/noExplicitAny: tests only exercise server handler config, not Convex API references.
		api: {} as any,
		convexUrl: "https://convex.example",
		resendApiKey: "resend-key",
		galleryWorkerUrl: "https://gallery.example",
		galleryAdminSecret: "gallery-secret",
		verifyAdmin: vi.fn(async () => true),
		...overrides,
	});
}

function makeRequest(body: unknown): Request {
	return new Request("https://tenant.example/api/admin/galleries/upload-session", {
		method: "POST",
		body: JSON.stringify(body),
		headers: {
			"Content-Type": "application/json",
			cookie: "session=admin-token",
		},
	});
}

function makeJsonRequest(path: string, body: unknown): Request {
	return new Request(`https://tenant.example${path}`, {
		method: "POST",
		body: JSON.stringify(body),
		headers: {
			"Content-Type": "application/json",
			cookie: "session=admin-token",
		},
	});
}

function makeRawRequest(path: string, body: string): Request {
	return new Request(`https://tenant.example${path}`, {
		method: "POST",
		body,
		headers: {
			"Content-Type": "application/json",
			cookie: "session=admin-token",
		},
	});
}

async function issueUploadSessionToken(): Promise<string> {
	const handler = createGalleryUploadSessionHandler();
	const response = await handler({
		request: makeRequest({
			siteUrl: "https://tenant.example",
			galleryId: "gallery-1",
		}),
	});
	const body = await response.json();
	return body.uploadSessionToken;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("createGalleryImageHandler", () => {
	it("streams a tenant-scoped image through the Worker admin route", async () => {
		configureServerConfig({ siteUrl: "tenant.example" });
		const fetchMock = vi.fn(async () => new Response("image-bytes", {
			headers: { "Content-Type": "image/jpeg", ETag: "test-etag" },
		}));
		vi.stubGlobal("fetch", fetchMock);
		const request = new Request(
			"https://tenant.example/api/admin/galleries/image?key=tenant.example%2Fgallery-1%2Fthumb%2Fphoto.jpg",
			{ headers: { cookie: "session=admin-token" } },
		);

		const response = await createGalleryImageHandler()({
			request,
			url: new URL(request.url),
		});

		expect(await response.text()).toBe("image-bytes");
		expect(response.headers.get("Content-Type")).toBe("image/jpeg");
		expect(fetchMock).toHaveBeenCalledWith(
			"https://gallery.example/admin/image/tenant.example%2Fgallery-1%2Fthumb%2Fphoto.jpg",
			{ headers: { Authorization: "Bearer gallery-secret" } },
		);
	});
});

describe("createGalleryUploadSessionHandler", () => {
	it("does not issue an upload-session grant without authorization configuration", async () => {
		configureServerConfig({ verifyAdmin: undefined });
		const handler = createGalleryUploadSessionHandler();

		await expect(
			handler({
				request: makeRequest({
					siteUrl: "https://tenant.example",
					galleryId: "gallery-1",
				}),
			}),
		).rejects.toMatchObject({ status: 500 });
	});

	it("rejects unauthenticated requests before issuing upload sessions", async () => {
		configureServerConfig({
			verifyAdmin: vi.fn(async () => {
				throw error(401, "Unauthorized");
			}),
		});
		const handler = createGalleryUploadSessionHandler();

		await expect(
			handler({
				request: makeRequest({
					siteUrl: "https://tenant.example",
					galleryId: "gallery-1",
				}),
			}),
		).rejects.toMatchObject({ status: 401 });
	});

	it("issues an upload-session token for authenticated matching-site requests", async () => {
		configureServerConfig();
		const handler = createGalleryUploadSessionHandler();

		const response = await handler({
			request: makeRequest({
				siteUrl: "https://tenant.example",
				galleryId: "gallery-1",
			}),
		});
		const body = await response.json();

		expect(body.uploadSessionToken).toEqual(expect.any(String));
		expect(body.uploadSessionToken.split(".")).toHaveLength(2);
		expect(body.expiresAt).toBeGreaterThan(Date.now());
	});

	it("rejects authenticated requests for a different site", async () => {
		configureServerConfig();
		const handler = createGalleryUploadSessionHandler();

		await expect(
			handler({
				request: makeRequest({
					siteUrl: "https://other.example",
					galleryId: "gallery-1",
				}),
			}),
		).rejects.toMatchObject({ status: 403 });
	});

	it("rejects upload-session access to keys from another gallery", async () => {
		configureServerConfig();
		const uploadSessionToken = await issueUploadSessionToken();
		const handler = createGalleryProcessHandler();

		await expect(
			handler({
				request: makeJsonRequest("/api/admin/galleries/process", {
					r2Key: "https://tenant.example/gallery-2/original/photo.jpg",
					uploadSessionToken,
				}),
			}),
		).rejects.toMatchObject({ status: 403 });
	});

	it("does not accept a valid upload grant after verifier configuration is removed", async () => {
		configureServerConfig();
		const uploadSessionToken = await issueUploadSessionToken();
		configureServerConfig({ verifyAdmin: undefined });
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createGalleryDeleteHandler()({
				request: makeJsonRequest("/api/admin/galleries/delete", {
					r2Key: "https://tenant.example/gallery-1/original/photo.jpg",
					uploadSessionToken,
				}),
			}),
		).rejects.toMatchObject({ status: 500 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects upload-session access to prefix matches that are not gallery object keys", async () => {
		configureServerConfig();
		const uploadSessionToken = await issueUploadSessionToken();
		const handler = createGalleryProcessHandler();

		await expect(
			handler({
				request: makeJsonRequest("/api/admin/galleries/process", {
					r2Key: "https://tenant.example/gallery-1/not-original/photo.jpg",
					uploadSessionToken,
				}),
			}),
		).rejects.toMatchObject({ status: 403 });
	});

	it("allows upload sessions to delete owned original keys", async () => {
		configureServerConfig();
		const uploadSessionToken = await issueUploadSessionToken();
		const fetchMock = vi.fn(async () => Response.json({ success: true }));
		vi.stubGlobal("fetch", fetchMock);
		const handler = createGalleryDeleteHandler();

		const response = await handler({
			request: makeJsonRequest("/api/admin/galleries/delete", {
				r2Key: "https://tenant.example/gallery-1/original/photo.jpg",
				uploadSessionToken,
			}),
		});

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://gallery.example/upload/delete",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					r2Key: "https://tenant.example/gallery-1/original/photo.jpg",
				}),
			}),
		);
	});
});

describe("createGalleryBulkDeleteHandler", () => {
	it("rejects missing authorization configuration before contacting the worker", async () => {
		configureServerConfig({ verifyAdmin: undefined });
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createGalleryBulkDeleteHandler()({
				request: makeJsonRequest("/api/admin/galleries/bulk-delete", {
					keys: ["https://tenant.example/gallery-1/original/photo.jpg"],
				}),
			}),
		).rejects.toMatchObject({ status: 500 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("forwards admin bulk-delete requests to the gallery worker", async () => {
		configureServerConfig();
		const fetchMock = vi.fn(async () => Response.json({ success: true, deleted: 3 }));
		vi.stubGlobal("fetch", fetchMock);
		const handler = createGalleryBulkDeleteHandler();

		const response = await handler({
			request: makeJsonRequest("/api/admin/galleries/bulk-delete", {
				keys: [
					"https://tenant.example/gallery-1/original/photo-1.jpg",
					"https://tenant.example/gallery-1/original/photo-2.jpg",
				],
			}),
		});

		await expect(response.json()).resolves.toEqual({ success: true, deleted: 3, chunks: 1 });
		expect(fetchMock).toHaveBeenCalledWith(
			"https://gallery.example/admin/bulk-delete",
			expect.objectContaining({
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer gallery-secret",
				},
				body: JSON.stringify({
					keys: [
						"https://tenant.example/gallery-1/original/photo-1.jpg",
						"https://tenant.example/gallery-1/original/photo-2.jpg",
					],
				}),
			}),
		);
	});

	it("chunks large bulk-delete requests below the worker expanded-target limit", async () => {
		configureServerConfig();
		const fetchMock = vi.fn(async () => Response.json({ success: true, deleted: 450 }));
		vi.stubGlobal("fetch", fetchMock);
		const handler = createGalleryBulkDeleteHandler();
		const keys = Array.from(
			{ length: 301 },
			(_, index) => `https://tenant.example/gallery-1/original/photo-${index}.jpg`,
		);

		const response = await handler({
			request: makeJsonRequest("/api/admin/galleries/bulk-delete", { keys }),
		});

		await expect(response.json()).resolves.toEqual({
			success: true,
			deleted: 1350,
			chunks: 3,
		});
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).keys).toHaveLength(150);
		expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string).keys).toHaveLength(150);
		expect(JSON.parse(fetchMock.mock.calls[2][1]?.body as string).keys).toHaveLength(1);
	});

	it("rejects malformed JSON before contacting the worker", async () => {
		configureServerConfig();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const handler = createGalleryBulkDeleteHandler();

		await expect(
			handler({
				request: makeRawRequest("/api/admin/galleries/bulk-delete", "{"),
			}),
		).rejects.toMatchObject({ status: 400 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects missing or empty keys before contacting the worker", async () => {
		configureServerConfig();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const handler = createGalleryBulkDeleteHandler();

		await expect(
			handler({
				request: makeJsonRequest("/api/admin/galleries/bulk-delete", null),
			}),
		).rejects.toMatchObject({ status: 400 });
		await expect(
			handler({
				request: makeJsonRequest("/api/admin/galleries/bulk-delete", { keys: [] }),
			}),
		).rejects.toMatchObject({ status: 400 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects non-string keys before contacting the worker", async () => {
		configureServerConfig();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const handler = createGalleryBulkDeleteHandler();

		await expect(
			handler({
				request: makeJsonRequest("/api/admin/galleries/bulk-delete", {
					keys: ["https://tenant.example/gallery-1/original/photo.jpg", 42],
				}),
			}),
		).rejects.toMatchObject({ status: 400 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects bulk-delete keys for another site before contacting the worker", async () => {
		configureServerConfig();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const handler = createGalleryBulkDeleteHandler();

		await expect(
			handler({
				request: makeJsonRequest("/api/admin/galleries/bulk-delete", {
					keys: ["https://other.example/gallery-1/original/photo.jpg"],
				}),
			}),
		).rejects.toMatchObject({ status: 403 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects bulk-delete keys that only prefix-match the configured site", async () => {
		configureServerConfig();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const handler = createGalleryBulkDeleteHandler();

		await expect(
			handler({
				request: makeJsonRequest("/api/admin/galleries/bulk-delete", {
					keys: ["https://tenant.example.evil/gallery-1/original/photo.jpg"],
				}),
			}),
		).rejects.toMatchObject({ status: 403 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("accepts bare-domain configured site keys", async () => {
		configureServerConfig({ siteUrl: "tenant.example" });
		const fetchMock = vi.fn(async () => Response.json({ success: true, deleted: 3 }));
		vi.stubGlobal("fetch", fetchMock);
		const handler = createGalleryBulkDeleteHandler();

		const response = await handler({
			request: makeJsonRequest("/api/admin/galleries/bulk-delete", {
				keys: ["tenant.example/gallery-1/original/photo.jpg"],
			}),
		});

		await expect(response.json()).resolves.toEqual({ success: true, deleted: 3, chunks: 1 });
		expect(fetchMock).toHaveBeenCalledWith(
			"https://gallery.example/admin/bulk-delete",
			expect.objectContaining({
				body: JSON.stringify({ keys: ["tenant.example/gallery-1/original/photo.jpg"] }),
			}),
		);
	});

	it("accepts configured site keys when the config has a trailing slash", async () => {
		configureServerConfig({ siteUrl: "tenant.example/" });
		const fetchMock = vi.fn(async () => Response.json({ success: true, deleted: 3 }));
		vi.stubGlobal("fetch", fetchMock);
		const handler = createGalleryBulkDeleteHandler();

		const response = await handler({
			request: makeJsonRequest("/api/admin/galleries/bulk-delete", {
				keys: ["tenant.example/gallery-1/original/photo.jpg"],
			}),
		});

		await expect(response.json()).resolves.toEqual({ success: true, deleted: 3, chunks: 1 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("surfaces worker failures without masking the worker status", async () => {
		configureServerConfig();
		const fetchMock = vi.fn(async () => new Response("worker failed", { status: 502 }));
		vi.stubGlobal("fetch", fetchMock);
		const handler = createGalleryBulkDeleteHandler();

		await expect(
			handler({
				request: makeJsonRequest("/api/admin/galleries/bulk-delete", {
					keys: ["https://tenant.example/gallery-1/original/photo.jpg"],
				}),
			}),
		).rejects.toMatchObject({ status: 502 });
	});
});
