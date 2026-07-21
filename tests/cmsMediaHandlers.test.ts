import { afterEach, describe, expect, it, vi } from "vitest";
import { setServerConfig, type AdminServerConfig } from "../src/lib/config";

const { mutation } = vi.hoisted(() => ({ mutation: vi.fn() }));
vi.mock("convex/browser", () => ({
	ConvexHttpClient: class {
		setAuth() {}
		mutation = mutation;
	},
}));

import {
	createCmsMediaCapabilityHandler,
	createCmsMediaProcessHandler,
} from "../src/lib/server/handlers/cmsMedia";

const SITE = "tenant.example";
const ASSET_ID = "123e4567-e89b-42d3-a456-426614174000";
const SOURCE_KEY = `sites/${SITE}/web/${ASSET_ID}/source.jpg`;

function configure(
	verifyAdmin = vi.fn(async () => true),
	registry: "generic" | "legacy" = "generic",
) {
	setServerConfig({
		siteUrl: SITE,
		siteName: "tenant",
		fromEmail: "admin@tenant.example",
		isCreator: false,
		api: {
			...(registry === "generic"
				? {
						mediaAssets: {
							getManyForEditor: "mediaAssets.getManyForEditor",
							registerReadyWebAsset: "mediaAssets.registerReadyWebAsset",
						},
						portfolioEditor: {
							registerReadyWebAsset: "portfolioEditor.registerReadyWebAsset",
						},
					}
				: {
						portfolioEditor: {
							registerReadyWebAsset: "portfolioEditor.registerReadyWebAsset",
						},
					}),
		} as never,
		convexUrl: "https://convex.example",
		resendApiKey: "",
		cmsMediaWorkerUrl: "https://cms-media.example/",
		cmsMediaTenantSecret: "tenant-secret",
		verifyAdmin,
		getConvexToken: async () => "convex-token",
	} satisfies AdminServerConfig);
	return verifyAdmin;
}

function request(path: string, body: unknown) {
	return new Request(`https://${SITE}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", cookie: "session=valid" },
		body: JSON.stringify(body),
	});
}

function readyWorkerAsset() {
	const derivative = (preset: string, filename: string, width: number) => ({
		preset,
		key: `sites/${SITE}/web/${ASSET_ID}/${filename}`,
		url: `https://media.angelsrest.online/sites/${SITE}/web/${ASSET_ID}/${filename}`,
		contentType: "image/webp",
		width,
		height: Math.round(width * 2 / 3),
	});
	return {
		assetId: ASSET_ID,
		status: "ready",
		ready: true,
		privateMasterKey: `sites/${SITE}/web/${ASSET_ID}/master.webp`,
		source: {
			contentType: "image/jpeg",
			sizeBytes: 1_000_000,
			width: 3000,
			height: 2000,
			originalFilename: "portrait.jpg",
		},
		master: { contentType: "image/webp", sizeBytes: 700_000, width: 3000, height: 2000 },
		derivatives: [
			derivative("thumb", "thumb.webp", 320),
			derivative("card", "card.webp", 768),
			derivative("display-1280", "display-1280.webp", 1280),
			derivative("display-2048", "display-2048.webp", 2048),
			derivative("display-2560", "display-2560.webp", 2560),
		],
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("CMS media host handlers", () => {
	it("authenticates before issuing an exact host-scoped capability", async () => {
		const verifyAdmin = configure();
		const fetchMock = vi.fn(async () => Response.json({
			assetId: ASSET_ID,
			privateObjectKey: SOURCE_KEY,
			uploadUrl: `/v1/uploads/source?key=${encodeURIComponent(SOURCE_KEY)}`,
			uploadToken: "one-file-token",
			expiresAt: "2026-07-16T12:00:00.000Z",
		}));
		vi.stubGlobal("fetch", fetchMock);

		const response = await createCmsMediaCapabilityHandler()({
			request: request("/api/admin/media/capability", {
				filename: "portrait.jpg",
				contentType: "image/jpeg",
				sizeBytes: 1_000_000,
			}),
		});

		expect(verifyAdmin).toHaveBeenCalledOnce();
		expect(fetchMock).toHaveBeenCalledWith("https://cms-media.example/v1/uploads/capabilities", expect.objectContaining({
			headers: expect.objectContaining({ Authorization: "Bearer tenant-secret" }),
		}));
		expect(await response.json()).toMatchObject({
			privateObjectKey: SOURCE_KEY,
			uploadUrl: expect.stringMatching(/^https:\/\/cms-media\.example\/v1\/uploads\/source\?/),
		});
	});

	it("rejects an unsafe Worker upload URL", async () => {
		configure();
		vi.stubGlobal("fetch", vi.fn(async () => Response.json({
			assetId: ASSET_ID,
			privateObjectKey: SOURCE_KEY,
			uploadUrl: "https://attacker.example/collect",
			uploadToken: "one-file-token",
			expiresAt: "2026-07-16T12:00:00.000Z",
		})));

		await expect(createCmsMediaCapabilityHandler()({
			request: request("/api/admin/media/capability", {
				filename: "portrait.jpg",
				contentType: "image/jpeg",
				sizeBytes: 10,
			}),
		})).rejects.toMatchObject({ status: 502 });
	});

	it("finalizes, processes, and registers one ready tenant asset", async () => {
		configure();
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(Response.json({ status: "uploaded", ready: false }))
			.mockResolvedValueOnce(Response.json(readyWorkerAsset()));
		vi.stubGlobal("fetch", fetchMock);
		mutation.mockResolvedValue({ id: "media-1", status: "ready" });

		const response = await createCmsMediaProcessHandler()({
			request: request("/api/admin/media/process", { privateObjectKey: SOURCE_KEY }),
		});

		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"https://cms-media.example/v1/uploads/finalize",
			"https://cms-media.example/v1/uploads/process",
		]);
		expect(mutation).toHaveBeenCalledWith("mediaAssets.registerReadyWebAsset", expect.objectContaining({
			siteUrl: SITE,
			asset: expect.objectContaining({ assetId: ASSET_ID, originalFilename: "portrait.jpg" }),
		}));
		expect(await response.json()).toMatchObject({
			asset: { _id: "media-1", status: "ready", assetId: ASSET_ID },
		});
	});

	it("recovers an ambiguous completed process using the same private identity", async () => {
		configure();
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response("Uploaded object not found", { status: 404 }))
			.mockResolvedValueOnce(Response.json(readyWorkerAsset()));
		vi.stubGlobal("fetch", fetchMock);
		mutation.mockResolvedValue({ id: "media-1", status: "ready" });

		const response = await createCmsMediaProcessHandler()({
			request: request("/api/admin/media/process", { privateObjectKey: SOURCE_KEY }),
		});

		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"https://cms-media.example/v1/uploads/finalize",
			"https://cms-media.example/v1/uploads/process",
		]);
		expect(await response.json()).toMatchObject({
			asset: { _id: "media-1", status: "ready", assetId: ASSET_ID },
		});
	});

	it("keeps the legacy portfolio media registry as a compatibility fallback", async () => {
		configure(vi.fn(async () => true), "legacy");
		vi.stubGlobal("fetch", vi.fn()
			.mockResolvedValueOnce(Response.json({ status: "uploaded", ready: false }))
			.mockResolvedValueOnce(Response.json(readyWorkerAsset())));
		mutation.mockResolvedValue({ id: "media-1", status: "ready" });

		await createCmsMediaProcessHandler()({
			request: request("/api/admin/media/process", { privateObjectKey: SOURCE_KEY }),
		});

		expect(mutation).toHaveBeenCalledWith(
			"portfolioEditor.registerReadyWebAsset",
			expect.objectContaining({ siteUrl: SITE }),
		);
	});

	it("rejects a different missing-source response instead of bypassing finalization", async () => {
		configure();
		const fetchMock = vi.fn(async () => new Response("Different object missing", { status: 404 }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(createCmsMediaProcessHandler()({
			request: request("/api/admin/media/process", { privateObjectKey: SOURCE_KEY }),
		})).rejects.toMatchObject({ status: 404 });

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(mutation).not.toHaveBeenCalled();
	});

	it("rejects a foreign private key before Worker or Convex access", async () => {
		configure();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(createCmsMediaProcessHandler()({
			request: request("/api/admin/media/process", {
				privateObjectKey: SOURCE_KEY.replace(SITE, "other.example"),
			}),
		})).rejects.toMatchObject({ status: 400 });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(mutation).not.toHaveBeenCalled();
	});
});
