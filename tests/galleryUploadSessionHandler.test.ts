import { error } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";
import { setServerConfig, type AdminServerConfig } from "../src/lib/config";
import { createGalleryUploadSessionHandler } from "../src/lib/server/handlers/galleryPresign";

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
});
