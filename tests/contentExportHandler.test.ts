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
it.each(["declared-length", "chunked"])("verifies a %s response and rereads source before returning bytes", async (transport) => {
	const archive = new TextEncoder().encode("synthetic-verified-archive");
	const hash = await exportSha256(archive);
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(archive.subarray(0, 8));
			controller.enqueue(archive.subarray(8));
			controller.close();
		},
	});
	const fetcher = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ siteUrl, files: [] }))
		.mockResolvedValueOnce(
			new Response(body, {
				headers: {
					"Content-Type": "application/zip",
					...(transport === "declared-length"
						? { "Content-Length": String(archive.length) }
						: {}),
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
	"wrong-length",
	"chunked-wrong-hash",
	"chunked-missing-hash",
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
	const chunked = scenario.startsWith("chunked-");
	const headers = new Headers({ "Content-Type": "application/zip" });
	if (!chunked)
		headers.set("Content-Length", String(archive.length + (scenario === "wrong-length" ? 1 : 0)));
	if (scenario !== "chunked-missing-hash")
		headers.set("X-Export-Sha256", scenario.endsWith("wrong-hash") ? "0".repeat(64) : hash);
	vi.stubGlobal(
		"fetch",
		vi
			.fn()
			.mockResolvedValueOnce(
				scenario === "too-large"
					? new Response(null, { status: 413 })
					: Response.json({ siteUrl, files: [] }),
			)
			.mockResolvedValueOnce(new Response(archive, { headers })),
	);
	await expect(createContentExportHandler()({ request: request() })).rejects.toMatchObject({
		status:
			scenario === "too-large"
				? 413
				: scenario === "wrong-tenant" || scenario === "changed"
					? 409
					: 502,
	});
});

it("enforces the archive byte limit when the streamed response omits Content-Length", async () => {
	const cancel = vi.fn();
	let chunks = 0;
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			controller.enqueue(new Uint8Array(chunks++ === 0 ? 16 * 1024 * 1024 : 1));
		},
		cancel,
	});
	vi.stubGlobal(
		"fetch",
		vi.fn()
			.mockResolvedValueOnce(Response.json({ siteUrl, files: [] }))
			.mockResolvedValueOnce(new Response(body, {
				headers: { "Content-Type": "application/zip", "X-Export-Sha256": "0".repeat(64) },
			})),
	);
	await expect(createContentExportHandler()({ request: request() })).rejects.toMatchObject({
		status: 413,
	});
	expect(cancel).toHaveBeenCalled();
});
