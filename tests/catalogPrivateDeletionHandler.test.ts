import { afterEach, describe, expect, it, vi } from "vitest";
import { setServerConfig, type AdminServerConfig } from "../src/lib/config";
const convex = vi.hoisted(() => ({ mutation: vi.fn(), setAuth: vi.fn() }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { mutation = convex.mutation; setAuth = convex.setAuth; } }));
import { createCatalogPrivateDeleteHandler } from "../src/lib/server/handlers/catalogPrivateDeletion";
const siteUrl = "tenant.example";
const id = "jh76abc123";
const kind = "print_source";
const facts = { siteUrl, kind, assetKey: "test-file", sha256: "a".repeat(64) };
function configure(overrides: Partial<AdminServerConfig> = {}) {
	setServerConfig({ siteUrl, siteName: "test", fromEmail: "test@example.com", isCreator: false,
		api: { catalogPrivateAssets: { requestDeletion: "private.requestDeletion", listForCleanup: "private.listForCleanup" } } as never,
		convexUrl: "https://tenant.convex.cloud", resendApiKey: "", cmsMediaWorkerUrl: "https://media.example",
		cmsMediaConvexSiteUrl: "https://tenant.convex.site", cmsMediaTenantSecret: "worker-test", cmsMediaDeletionCompletionSecret: "completion-test",
		verifyAdmin: async () => true, getConvexToken: async () => "session-test", ...overrides });
	convex.mutation.mockResolvedValue({ status: "deleting", deletionId: "testdeletionid" });
}
function manifestResponse() { return Response.json({ status: "deleting", ...facts, privateObjectKey: `sites/${siteUrl}/catalog/print-sources/test-file/original` }); }
function request(body: unknown = { id, kind }, origin = `https://${siteUrl}`) {
	return new Request(`https://${siteUrl}/api/admin/catalog-private-assets/delete`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("private cleanup host adapter", () => {
	it("authorizes before writes and rejects foreign origins", async () => {
		configure({ verifyAdmin: async () => false });
		await expect(createCatalogPrivateDeleteHandler()({ request: request() })).rejects.toMatchObject({ status: 401 });
		configure();
		await expect(createCatalogPrivateDeleteHandler()({ request: request(undefined, "https://other.example") })).rejects.toMatchObject({ status: 403 });
		expect(convex.mutation).not.toHaveBeenCalled();
	});
	it("uses authenticated registry identities and completes only after storage acknowledgement", async () => {
		configure();
		const fetchMock = vi.fn().mockResolvedValueOnce(manifestResponse()).mockResolvedValueOnce(Response.json({ deleted: true, ...facts })).mockResolvedValueOnce(Response.json({ deleted: true, id }));
		vi.stubGlobal("fetch", fetchMock);
		const response = await createCatalogPrivateDeleteHandler()({ request: request() });
		expect(await response.json()).toEqual({ deleted: true, id });
		expect(convex.setAuth).toHaveBeenCalledWith("session-test");
		expect(convex.mutation).toHaveBeenCalledWith("private.requestDeletion", { siteUrl, id, kind });
		expect(fetchMock.mock.calls[1][0]).toBe("https://media.example/v1/catalog-assets/delete");
		expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(facts);
		expect(fetchMock.mock.calls[2][0]).toBe("https://tenant.convex.site/cms-media/catalog-private-assets/complete-deletion");
	});
	it("does not complete after a storage failure or mismatched response", async () => {
		for (const response of [new Response("unavailable", { status: 503 }), Response.json({ deleted: true, ...facts, siteUrl: "other.example" })]) {
			configure(); const fetchMock = vi.fn().mockResolvedValueOnce(manifestResponse()).mockResolvedValueOnce(response); vi.stubGlobal("fetch", fetchMock);
			await expect(createCatalogPrivateDeleteHandler()({ request: request() })).rejects.toMatchObject({ status: 502 });
			expect(fetchMock).toHaveBeenCalledTimes(2);
		}
	});
	it("retries a lost completion without changing the manifest", async () => {
		configure();
		const fetchMock = vi.fn().mockResolvedValueOnce(manifestResponse()).mockResolvedValueOnce(Response.json({ deleted: true, ...facts })).mockRejectedValueOnce(new Error("lost completion"))
			.mockResolvedValueOnce(manifestResponse()).mockResolvedValueOnce(Response.json({ deleted: true, ...facts })).mockResolvedValueOnce(Response.json({ deleted: true, id }));
		vi.stubGlobal("fetch", fetchMock);
		await expect(createCatalogPrivateDeleteHandler()({ request: request() })).rejects.toMatchObject({ status: 502 });
		expect((await createCatalogPrivateDeleteHandler()({ request: request() })).status).toBe(200);
		expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[4][1].body);
	});
	it("rejects browser-selected storage keys and registry scope corruption", async () => {
		configure(); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
		await expect(createCatalogPrivateDeleteHandler()({ request: request({ id, kind, assetKey: "other" }) })).rejects.toMatchObject({ status: 400 });
		fetchMock.mockResolvedValueOnce(Response.json({ status: "deleting", ...facts, privateObjectKey: "foreign/key" }));
		await expect(createCatalogPrivateDeleteHandler()({ request: request() })).rejects.toMatchObject({ status: 502 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
