import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setServerConfig, type AdminServerConfig } from "../src/lib/config";
import { createContentExportHandler } from "../src/lib/server/handlers/contentExport";
import { exportSha256 } from "../src/lib/server/contentExportCore";
const f = vi.hoisted(() => ({ query: vi.fn(), setAuth: vi.fn() }));
vi.mock("convex/browser", () => ({
	ConvexHttpClient: class {
		query = f.query;
		setAuth = f.setAuth;
	},
}));
const siteUrl = "tenant.example";
function configure(override: Partial<AdminServerConfig> = {}) {
	setServerConfig({
		siteUrl,
		siteName: "test",
		fromEmail: "",
		isCreator: false,
		api: { contentExport: { page: "export.page" } } as never,
		contentExportEndpoint: "/api/admin/content-export",
		convexUrl: "https://tenant.convex.cloud",
		resendApiKey: "",
		cmsMediaWorkerUrl: "https://media.example",
		cmsMediaTenantSecret: "synthetic-worker-secret",
		verifyAdmin: async () => true,
		getConvexToken: async () => "synthetic-session",
		...override,
	});
}
function request(origin = `https://${siteUrl}`, body?: string) {
	return new Request(`https://${siteUrl}/api/admin/content-export`, {
		method: "POST",
		headers: { Origin: origin },
		...(body ? { body } : {}),
	});
}
beforeEach(() => {
	configure();
	f.query.mockImplementation(async (_ref, args) => ({
		siteUrl: args.siteUrl,
		tenantId: "tenant",
		page: [],
		isDone: true,
		continueCursor: "",
	}));
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});
it("rejects missing membership, cross-origin requests and tenant/body injection before export I/O", async () => {
	const fetcher = vi.fn();
	vi.stubGlobal("fetch", fetcher);
	configure({ verifyAdmin: async () => false });
	await expect(createContentExportHandler()({ request: request() })).rejects.toMatchObject({
		status: 401,
	});
	configure();
	await expect(
		createContentExportHandler()({ request: request("https://foreign.example") }),
	).rejects.toMatchObject({ status: 403 });
	await expect(
		createContentExportHandler()({ request: request(undefined, '{"siteUrl":"foreign.example"}') }),
	).rejects.toMatchObject({ status: 400 });
	expect(f.query).not.toHaveBeenCalled();
	expect(fetcher).not.toHaveBeenCalled();
});
it("uses current authenticated inventory, verifies transport and rereads source before returning bytes", async () => {
	const archive = new TextEncoder().encode("synthetic-verified-archive");
	const hash = await exportSha256(archive);
	const fetcher = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ siteUrl, files: [] }))
		.mockResolvedValueOnce(
			new Response(archive, {
				headers: {
					"Content-Type": "application/zip",
					"Content-Length": String(archive.length),
					"X-Export-Sha256": hash,
				},
			}),
		);
	vi.stubGlobal("fetch", fetcher);
	const response = await createContentExportHandler()({ request: request() });
	expect(response.headers.get("cache-control")).toBe("private, no-store");
	expect(await response.text()).toBe("synthetic-verified-archive");
	expect(f.setAuth).toHaveBeenCalledWith("synthetic-session");
	expect(f.query).toHaveBeenCalledTimes(14);
	expect(f.query.mock.calls.every(([, args]) => args.siteUrl === siteUrl)).toBe(true);
	const prepared = JSON.parse(fetcher.mock.calls[1][1].body);
	expect(prepared.metadata["manifest.json"]).toContain(siteUrl);
	expect(JSON.stringify(prepared)).not.toContain("synthetic-session");
});
it.each([
	"wrong-tenant",
	"wrong-hash",
	"changed",
	"too-large",
])("blocks %s without returning an archive", async (scenario) => {
	let pass = 0;
	f.query.mockImplementation(async (_ref, args) => {
		if (args.family === "content") pass++;
		return {
			siteUrl: scenario === "wrong-tenant" ? "foreign.example" : siteUrl,
			tenantId: "tenant",
			page:
				scenario === "changed" && pass > 1 && args.family === "content"
					? [{ id: "new", revisions: [] }]
					: [],
			isDone: true,
			continueCursor: "",
		};
	});
	const archive = new TextEncoder().encode("verified");
	const hash = await exportSha256(archive);
	vi.stubGlobal(
		"fetch",
		vi
			.fn()
			.mockResolvedValueOnce(
				scenario === "too-large"
					? new Response(null, { status: 413 })
					: Response.json({ siteUrl, files: [] }),
			)
			.mockResolvedValueOnce(
				new Response(archive, {
					headers: {
						"Content-Type": "application/zip",
						"Content-Length": String(archive.length),
						"X-Export-Sha256": scenario === "wrong-hash" ? "0".repeat(64) : hash,
					},
				}),
			),
	);
	await expect(createContentExportHandler()({ request: request() })).rejects.toMatchObject({
		status: scenario === "wrong-hash" ? 502 : scenario === "too-large" ? 413 : 409,
	});
});
