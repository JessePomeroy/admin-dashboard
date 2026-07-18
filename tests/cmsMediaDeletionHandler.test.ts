import { afterEach, describe, expect, it, vi } from "vitest";
import { setServerConfig, type AdminServerConfig } from "../src/lib/config";

const convex = vi.hoisted(() => ({
	mutation: vi.fn(),
	setAuth: vi.fn(),
}));
vi.mock("convex/browser", () => ({
	ConvexHttpClient: class {
		setAuth = convex.setAuth;
		mutation = convex.mutation;
	},
}));

import { createCmsMediaDeleteHandler } from "../src/lib/server/handlers/cmsMediaDeletion";

const SITE = "tenant.example";
const ASSET_ID = "123e4567-e89b-42d3-a456-426614174000";
const DOCUMENT_ID = "jh76abc123";
const WORKER_SECRET = "worker-tenant-secret";
const COMPLETION_SECRET = "convex-completion-secret";

function manifest(assetId = ASSET_ID) {
	const prefix = `sites/${SITE}/web/${assetId}/`;
	return {
		privateKeys: [`${prefix}master.webp`],
		publicKeys: [
			`${prefix}thumb.webp`,
			`${prefix}card.webp`,
			`${prefix}display-1280.webp`,
			`${prefix}display-2048.webp`,
			`${prefix}display-2560.webp`,
		],
	};
}

function deletionResult(overrides: Record<string, unknown> = {}) {
	return {
		status: "deleting",
		siteUrl: SITE,
		assetId: ASSET_ID,
		...manifest(),
		...overrides,
	};
}

function configure(overrides: Partial<AdminServerConfig> = {}) {
	const verifyAdmin = overrides.verifyAdmin ?? vi.fn(async () => true);
	const getConvexToken = overrides.getConvexToken ?? vi.fn(async () => "convex-token");
	setServerConfig({
		siteUrl: SITE,
		siteName: "tenant",
		fromEmail: "admin@tenant.example",
		isCreator: false,
		api: {
			portfolioEditor: { requestDeletion: "mediaAssets.requestDeletion" },
		} as never,
		convexUrl: "https://convex.example",
		resendApiKey: "",
		cmsMediaWorkerUrl: "https://cms-media.example/ignored-base-path",
		cmsMediaTenantSecret: WORKER_SECRET,
		cmsMediaConvexSiteUrl: "https://tenant.convex.site/ignored-base-path",
		cmsMediaDeletionCompletionSecret: COMPLETION_SECRET,
		verifyAdmin,
		getConvexToken,
		...overrides,
	} satisfies AdminServerConfig);
	return { verifyAdmin, getConvexToken };
}

function request(body: unknown = { id: DOCUMENT_ID }, contentType = "application/json") {
	return new Request(`https://${SITE}/api/admin/media/delete`, {
		method: "POST",
		headers: { "Content-Type": contentType, cookie: "session=valid" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

function workerSuccess() {
	return Response.json({ deleted: true, siteUrl: SITE, assetId: ASSET_ID });
}

function completionSuccess() {
	return Response.json({ deleted: true, id: DOCUMENT_ID });
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("CMS media deletion host handler", () => {
	it("rejects an unauthenticated request before Convex or the Worker", async () => {
		const { getConvexToken } = configure({ verifyAdmin: vi.fn(async () => false) });
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(createCmsMediaDeleteHandler()({ request: request() }))
			.rejects.toMatchObject({ status: 401 });
		expect(getConvexToken).not.toHaveBeenCalled();
		expect(convex.mutation).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		["invalid JSON", "{"],
		["missing id", {}],
		["non-string id", { id: 42 }],
		["browser-supplied tenant", { id: DOCUMENT_ID, siteUrl: "other.example" }],
	])("rejects a malformed body: %s", async (_label, body) => {
		configure();
		vi.stubGlobal("fetch", vi.fn());

		await expect(createCmsMediaDeleteHandler()({ request: request(body) }))
			.rejects.toMatchObject({ status: 400 });
		expect(convex.mutation).not.toHaveBeenCalled();
	});

	it("rejects a non-JSON content type before Convex or the Worker", async () => {
		configure();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(createCmsMediaDeleteHandler()({
			request: request({ id: DOCUMENT_ID }, "text/plain"),
		})).rejects.toMatchObject({ status: 400 });
		expect(convex.mutation).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("uses only the fixed host tenant and an authenticated Convex mutation", async () => {
		const { getConvexToken } = configure();
		convex.mutation.mockResolvedValue(deletionResult());
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(workerSuccess())
			.mockResolvedValueOnce(completionSuccess());
		vi.stubGlobal("fetch", fetchMock);

		await createCmsMediaDeleteHandler()({ request: request() });

		expect(getConvexToken).toHaveBeenCalledOnce();
		expect(convex.setAuth).toHaveBeenCalledWith("convex-token");
		expect(convex.mutation).toHaveBeenCalledWith("mediaAssets.requestDeletion", {
			siteUrl: SITE,
			id: DOCUMENT_ID,
		});
	});

	it.each([
		["invalid UUID", deletionResult({ assetId: "not-an-asset-id" })],
		["foreign tenant", deletionResult({ siteUrl: "other.example" })],
		["missing private key", deletionResult({ privateKeys: [] })],
		["duplicate public key", deletionResult({
			publicKeys: [...manifest().publicKeys.slice(0, 4), manifest().publicKeys[0]],
		})],
		["unexpected public key", deletionResult({
			publicKeys: manifest().publicKeys.map((key, index) =>
				index === 0 ? key.replace("thumb.webp", "original.jpg") : key),
		})],
	])("rejects an invalid Convex deletion result: %s", async (_label, result) => {
		configure();
		convex.mutation.mockResolvedValue(result);
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(createCmsMediaDeleteHandler()({ request: request() }))
			.rejects.toMatchObject({ status: 502 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("does not complete Convex when the Worker fails", async () => {
		configure();
		convex.mutation.mockResolvedValue(deletionResult());
		const fetchMock = vi.fn().mockResolvedValue(new Response("R2 unavailable", { status: 502 }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(createCmsMediaDeleteHandler()({ request: request() }))
			.rejects.toMatchObject({ status: 502 });
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(fetchMock.mock.calls[0]?.[0]).toBe("https://cms-media.example/v1/assets/delete");
	});

	it("can retry the idempotent Worker cleanup after completion fails", async () => {
		configure();
		convex.mutation.mockResolvedValue(deletionResult());
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(workerSuccess())
			.mockResolvedValueOnce(new Response("completion rejected", { status: 409 }))
			.mockResolvedValueOnce(workerSuccess())
			.mockResolvedValueOnce(completionSuccess());
		vi.stubGlobal("fetch", fetchMock);

		await expect(createCmsMediaDeleteHandler()({ request: request() }))
			.rejects.toMatchObject({ status: 409 });
		const retry = await createCmsMediaDeleteHandler()({ request: request() });
		expect(await retry.json()).toEqual({ deleted: true, id: DOCUMENT_ID });
		expect(convex.mutation).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"https://cms-media.example/v1/assets/delete",
			"https://tenant.convex.site/cms-media/complete-deletion",
			"https://cms-media.example/v1/assets/delete",
			"https://tenant.convex.site/cms-media/complete-deletion",
		]);
	});

	it("returns success for an already-completed Convex tombstone without replaying side effects", async () => {
		configure();
		convex.mutation.mockResolvedValue(deletionResult({ status: "deleted" }));
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const response = await createCmsMediaDeleteHandler()({ request: request() });

		expect(await response.json()).toEqual({ deleted: true, id: DOCUMENT_ID });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("deletes the exact fixed manifest and exposes no keys or server secrets", async () => {
		configure();
		convex.mutation.mockResolvedValue(deletionResult({
			// Exact sets may arrive in a different order; the host derives the
			// canonical order rather than forwarding backend-controlled arrays.
			publicKeys: [...manifest().publicKeys].reverse(),
		}));
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(workerSuccess())
			.mockResolvedValueOnce(completionSuccess());
		vi.stubGlobal("fetch", fetchMock);

		const response = await createCmsMediaDeleteHandler()({ request: request() });
		const browserBody = await response.text();
		const workerCall = fetchMock.mock.calls[0] as [string, RequestInit];
		const completionCall = fetchMock.mock.calls[1] as [string, RequestInit];

		expect(JSON.parse(workerCall[1].body as string)).toEqual({
			siteUrl: SITE,
			assetId: ASSET_ID,
			...manifest(),
		});
		expect(new Headers(workerCall[1].headers).get("Authorization"))
			.toBe(`Bearer ${WORKER_SECRET}`);
		expect(JSON.parse(completionCall[1].body as string)).toEqual({
			siteUrl: SITE,
			id: DOCUMENT_ID,
			assetId: ASSET_ID,
		});
		expect(new Headers(completionCall[1].headers).get("Authorization"))
			.toBe(`Bearer ${COMPLETION_SECRET}`);
		expect(browserBody).toBe(JSON.stringify({ deleted: true, id: DOCUMENT_ID }));
		expect(browserBody).not.toContain("sites/");
		expect(browserBody).not.toContain(WORKER_SECRET);
		expect(browserBody).not.toContain(COMPLETION_SECRET);
	});
});
