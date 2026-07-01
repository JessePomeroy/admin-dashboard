import { error } from "@sveltejs/kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setServerConfig, type AdminServerConfig } from "../src/lib/config";
import {
	createGalleryDeleteHandler,
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

describe("createGalleryUploadSessionHandler", () => {
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
