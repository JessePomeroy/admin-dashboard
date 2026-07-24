import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setServerConfig, type AdminServerConfig } from "../src/lib/config";
import {
	createCatalogPrivateEditorUploadCompleteHandler,
	createCatalogPrivateEditorUploadPrepareHandler,
} from "../src/lib/server/handlers/catalogPrivateEditorUpload";

const SITE = "angelsrest.online";
const BROWSER_ORIGIN = "https://www.angelsrest.online";
const JOURNAL_ORIGIN = "https://loyal-swan-967.convex.site";
const WORKER_ORIGIN = "https://cms-media-worker.thinkingofview.workers.dev";
const HOST_SECRET = "host-journal-secret-0123456789abcdef";
const STORAGE_SECRET = "storage-caller-secret-0123456789abcdef";
const HANDLE = "123e4567-e89b-42d3-a456-426614174000";
const TOKEN = `cms-editor-upload-v1.${"a".repeat(2768)}`;
const CONTINUATION = `cms-editor-upload-v1.${"b".repeat(2768)}`;
const LEASE = "c".repeat(40);
const EXPIRES = new Date(Date.now() + 10 * 60 * 1000).toISOString();
const LONG_EXPIRES = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();

function configure(
	verifyAdmin = vi.fn(async () => true),
	overrides: Partial<AdminServerConfig> = {},
) {
	setServerConfig({
		siteUrl: SITE,
		siteName: "angel's rest",
		fromEmail: "admin@angelsrest.online",
		isCreator: true,
		api: {} as never,
		convexUrl: "https://loyal-swan-967.convex.cloud",
		resendApiKey: "",
		verifyAdmin,
		catalogPrivateEditorUpload: {
			convexJournalOrigin: JOURNAL_ORIGIN,
			hostJournalSecret: HOST_SECRET,
			workerOrigin: WORKER_ORIGIN,
			storageCallerSecret: STORAGE_SECRET,
			browserOrigin: BROWSER_ORIGIN,
		},
		...overrides,
	});
	return verifyAdmin;
}

function browserRequest(body: unknown, options: {
	path?: string;
	headers?: Record<string, string>;
	method?: string;
	rawBody?: string;
} = {}) {
	return new Request(`${BROWSER_ORIGIN}${options.path ?? "/api/admin/catalog/upload"}`, {
		method: options.method ?? "POST",
		headers: {
			Origin: BROWSER_ORIGIN,
			"Sec-Fetch-Site": "same-origin",
			"Sec-Fetch-Mode": "cors",
			"Sec-Fetch-Dest": "empty",
			"Content-Type": "application/json",
			Cookie: "session=private",
			...options.headers,
		},
		body: options.method === "GET" ? undefined : options.rawBody ?? JSON.stringify(body),
	});
}

function printInput(overrides: Record<string, unknown> = {}) {
	return {
		uploadHandle: HANDLE,
		productKind: "print",
		originalFilename: "print-source.jpg",
		contentType: "image/jpeg",
		sizeBytes: 100_000_000,
		sha256: "d".repeat(64),
		widthPixels: 10_000,
		heightPixels: 10_000,
		...overrides,
	};
}

function digitalInput(overrides: Record<string, unknown> = {}) {
	return {
		uploadHandle: HANDLE,
		productKind: "digital_download",
		originalFilename: "download.zip",
		contentType: "application/zip",
		sizeBytes: 16_777_216,
		sha256: "e".repeat(64),
		version: "2026.1",
		...overrides,
	};
}

function prepareProjection(overrides: Record<string, unknown> = {}) {
	return {
		replayed: false,
		operationId: "f".repeat(40),
		uploadPath: "/v1/catalog-assets/editor-uploads/source",
		uploadToken: TOKEN,
		uploadExpiresAt: EXPIRES,
		...overrides,
	};
}

function safePrintAsset(overrides: Record<string, unknown> = {}) {
	return {
		kind: "print_source",
		assetId: "jd712abcde",
		status: "verified",
		originalFilename: "print-source.jpg",
		mimeType: "image/jpeg",
		sizeBytes: 8_000_000,
		widthPixels: 6000,
		heightPixels: 4000,
		createdAt: 1_750_000_000_000,
		...overrides,
	};
}

function journalStatus(status: string, extras: Record<string, unknown> = {}) {
	return {
		status,
		uploadExpiresAt: EXPIRES,
		storageExpiresAt: LONG_EXPIRES,
		inspectionExpiresAt: LONG_EXPIRES,
		...extras,
	};
}

function response(body: unknown, init: ResponseInit = {}) {
	return Response.json(body, init);
}

async function listen(server: ReturnType<typeof createServer>) {
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Missing HTTP test address");
	return `http://127.0.0.1:${address.port}`;
}

async function close(server: ReturnType<typeof createServer>) {
	await new Promise<void>((resolve, reject) => {
		server.close((error) => error ? reject(error) : resolve());
	});
}

function callPrepare(request = browserRequest(printInput())) {
	return createCatalogPrivateEditorUploadPrepareHandler()({ request });
}

function callComplete(request = browserRequest({ uploadHandle: HANDLE })) {
	return createCatalogPrivateEditorUploadCompleteHandler()({ request });
}

function expectSafeHeaders(result: Response) {
	expect(result.headers.get("Cache-Control")).toBe("no-store");
	expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
	expect(result.headers.get("Content-Type")).toContain("application/json");
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("catalog private editor upload prepare handler", () => {
	it("authenticates before declaration semantics and projects only browser upload authority", async () => {
		const order: string[] = [];
		const verifyAdmin = configure(vi.fn(async () => {
			order.push("auth");
			return true;
		}));
		const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			order.push("fetch");
			expect(init?.headers).toEqual({
				Authorization: `Bearer ${HOST_SECRET}`,
				"Content-Type": "application/json",
			});
			expect(JSON.parse(String(init?.body))).toEqual(printInput());
			return response({
				...prepareProjection(),
				// Known journal-only fields are consumed but never projected.
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await callPrepare();
		expect(order).toEqual(["auth", "fetch"]);
		expect(verifyAdmin).toHaveBeenCalledOnce();
		expect(fetchMock).toHaveBeenCalledWith(
			`${JOURNAL_ORIGIN}/cms-media/catalog-private-assets/editor-upload/journal/begin`,
			expect.objectContaining({ method: "POST", redirect: "manual", signal: expect.any(AbortSignal) }),
		);
		expect(result.status).toBe(200);
		expectSafeHeaders(result);
		const text = await result.text();
		expect(JSON.parse(text)).toEqual({
			status: "upload_required",
			uploadHandle: HANDLE,
			uploadUrl: `${WORKER_ORIGIN}/v1/catalog-assets/editor-uploads/source`,
			uploadToken: TOKEN,
			uploadExpiresAt: EXPIRES,
		});
		expect(text).not.toMatch(/operationId|replayed|continuation|receipt|sha256|privateObjectKey/i);
		expect(String(fetchMock.mock.calls[0]?.[1])).not.toContain("session=private");
	});

	it("accepts a Fetch-decoded gzip journal response with its wire Content-Length", async () => {
		configure();
		const decodedBody = JSON.stringify(prepareProjection());
		const wireLength = gzipSync(decodedBody).byteLength;
		expect(wireLength).not.toBe(Buffer.byteLength(decodedBody));
		vi.stubGlobal("fetch", vi.fn(async () => new Response(decodedBody, {
			headers: {
				"Content-Type": "application/json",
				"Content-Encoding": "gzip",
				"Content-Length": String(wireLength),
			},
		})));

		expect((await callPrepare()).status).toBe(200);
	});

	it("keeps prepare within a 25s overall and 10s journal budget", async () => {
		configure();
		const timeout = vi.spyOn(AbortSignal, "timeout");
		vi.stubGlobal("fetch", vi.fn(async () => response(prepareProjection())));

		expect((await callPrepare()).status).toBe(200);
		expect(timeout.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([25_000, 10_000]);
	});

	it("requires auth before revealing malformed declaration semantics", async () => {
		configure(vi.fn(async () => false));
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const result = await callPrepare(browserRequest({ definitely: "not a declaration" }));
		expect(result.status).toBe(401);
		expect(await result.json()).toEqual({ status: "unauthorized" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		["origin", { Origin: "https://attacker.example" }],
		["site", { "Sec-Fetch-Site": "cross-site" }],
		["mode", { "Sec-Fetch-Mode": "navigate" }],
		["dest", { "Sec-Fetch-Dest": "document" }],
		["content type parameters", { "Content-Type": "application/json; charset=utf-8" }],
		["missing origin", { Origin: "" }],
	])("rejects invalid fetch metadata: %s", async (_name, headers) => {
		const verify = configure();
		const result = await callPrepare(browserRequest(printInput(), { headers }));
		expect(result.status).toBe(400);
		expectSafeHeaders(result);
		expect(verify).not.toHaveBeenCalled();
	});

	it.each([
		["GET", browserRequest(printInput(), { method: "GET" })],
		["query", browserRequest(printInput(), { path: "/api/admin/catalog/upload?next=1" })],
		["oversized", browserRequest(printInput(), { rawBody: `{"x":"${"a".repeat(17_000)}"}` })],
		["empty", browserRequest(null, { rawBody: "" })],
	])("rejects a non-closed or unbounded request: %s", async (_name, request) => {
		const verify = configure();
		const result = await callPrepare(request);
		expect(result.status).toBe(400);
		expect(verify).not.toHaveBeenCalled();
	});

	it.each([
		["print", printInput()],
		["print set", printInput({ productKind: "print_set", contentType: "image/png", originalFilename: "set.PNG" })],
		["digital", digitalInput()],
		["digital without version", (() => {
			const input = digitalInput();
			delete input.version;
			return input;
		})()],
	])("accepts the exact supported %s declaration", async (_name, input) => {
		configure();
		vi.stubGlobal("fetch", vi.fn(async () => response(prepareProjection())));
		expect((await callPrepare(browserRequest(input))).status).toBe(200);
	});

	it.each([
		["unsupported kind", printInput({ productKind: "postcard" })],
		["extra field", printInput({ operationId: "f".repeat(40) })],
		["non-v4 handle", printInput({ uploadHandle: "123e4567-e89b-12d3-a456-426614174000" })],
		["uppercase hash", printInput({ sha256: "D".repeat(64) })],
		["oversized print", printInput({ sizeBytes: 100_000_001 })],
		["oversized pixels", printInput({ widthPixels: 10_001, heightPixels: 10_000 })],
		["wrong image extension", printInput({ originalFilename: "source.png" })],
		["oversized zip", digitalInput({ sizeBytes: 16_777_217 })],
		["wrong zip content type", digitalInput({ contentType: "application/octet-stream" })],
		["path filename", digitalInput({ originalFilename: "private/download.zip" })],
		["unbounded version", digitalInput({ version: "v".repeat(65) })],
	])("rejects declaration policy violation: %s", async (_name, input) => {
		const verify = configure();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const result = await callPrepare(browserRequest(input));
		expect(result.status).toBe(400);
		expect(verify).toHaveBeenCalledOnce();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		["wrong site", { siteUrl: "other.example" }],
		["pathful journal", { catalogPrivateEditorUpload: {
			convexJournalOrigin: `${JOURNAL_ORIGIN}/path`, hostJournalSecret: HOST_SECRET,
			workerOrigin: WORKER_ORIGIN, storageCallerSecret: STORAGE_SECRET,
			browserOrigin: BROWSER_ORIGIN,
		} }],
		["non-Convex journal", { catalogPrivateEditorUpload: {
			convexJournalOrigin: "https://journal.example", hostJournalSecret: HOST_SECRET,
			workerOrigin: WORKER_ORIGIN, storageCallerSecret: STORAGE_SECRET,
			browserOrigin: BROWSER_ORIGIN,
		} }],
		["HTTP Worker", { catalogPrivateEditorUpload: {
			convexJournalOrigin: JOURNAL_ORIGIN, hostJournalSecret: HOST_SECRET,
			workerOrigin: "http://worker.example", storageCallerSecret: STORAGE_SECRET,
			browserOrigin: BROWSER_ORIGIN,
		} }],
		["wrong browser", { catalogPrivateEditorUpload: {
			convexJournalOrigin: JOURNAL_ORIGIN, hostJournalSecret: HOST_SECRET,
			workerOrigin: WORKER_ORIGIN, storageCallerSecret: STORAGE_SECRET,
			browserOrigin: "https://angelsrest.online",
		} }],
		["short journal secret", { catalogPrivateEditorUpload: {
			convexJournalOrigin: JOURNAL_ORIGIN, hostJournalSecret: "short",
			workerOrigin: WORKER_ORIGIN, storageCallerSecret: STORAGE_SECRET,
			browserOrigin: BROWSER_ORIGIN,
		} }],
	])("fails closed for invalid config: %s", async (_name, override) => {
		configure(vi.fn(async () => true), override as Partial<AdminServerConfig>);
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const result = await callPrepare();
		expect(result.status).toBe(503);
		expect(await result.json()).toEqual({ status: "service_unavailable" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		["prepare", (request: Request) => callPrepare(request), printInput()],
		["complete", (request: Request) => callComplete(request), { uploadHandle: HANDLE }],
	])("fails %s closed before reading the body or causing auth/upstream effects when secrets match", async (
		_name,
		call,
		body,
	) => {
		const verify = vi.fn(async () => true);
		configure(verify, {
			catalogPrivateEditorUpload: {
				convexJournalOrigin: JOURNAL_ORIGIN,
				hostJournalSecret: HOST_SECRET,
				workerOrigin: WORKER_ORIGIN,
				storageCallerSecret: HOST_SECRET,
				browserOrigin: BROWSER_ORIGIN,
			},
		});
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const request = browserRequest(body);

		const result = await call(request);

		expect(result.status).toBe(503);
		expect(request.bodyUsed).toBe(false);
		expect(verify).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
		const response = {
			body: await result.text(),
			headers: Object.fromEntries(result.headers),
		};
		expect(JSON.parse(response.body)).toEqual({ status: "service_unavailable" });
		expect(JSON.stringify(response)).not.toContain(HOST_SECRET);
	});

	it.each([
		"https://attacker.example",
		`${WORKER_ORIGIN}/path`,
		`${WORKER_ORIGIN}?route=storage`,
		`https://user@cms-media-worker.thinkingofview.workers.dev`,
	])("never sends authority or returns an upload URL for unpinned Worker origin %s", async (
		workerOrigin,
	) => {
		const verify = vi.fn(async () => true);
		configure(verify, {
			catalogPrivateEditorUpload: {
				convexJournalOrigin: JOURNAL_ORIGIN,
				hostJournalSecret: HOST_SECRET,
				workerOrigin,
				storageCallerSecret: STORAGE_SECRET,
				browserOrigin: BROWSER_ORIGIN,
			} as never,
		});
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const prepareRequest = browserRequest(printInput());
		const completeRequest = browserRequest({ uploadHandle: HANDLE });

		const prepared = await callPrepare(prepareRequest);
		const completed = await callComplete(completeRequest);

		expect(prepared.status).toBe(503);
		expect(completed.status).toBe(503);
		expect(await prepared.json()).toEqual({ status: "service_unavailable" });
		expect(await completed.json()).toEqual({ status: "service_unavailable" });
		expect(prepareRequest.bodyUsed).toBe(false);
		expect(completeRequest.bodyUsed).toBe(false);
		expect(verify).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects extra secret custody fields in runtime config", async () => {
		configure(vi.fn(async () => true), {
			catalogPrivateEditorUpload: {
				convexJournalOrigin: JOURNAL_ORIGIN,
				hostJournalSecret: HOST_SECRET,
				workerOrigin: WORKER_ORIGIN,
				storageCallerSecret: STORAGE_SECRET,
				browserOrigin: BROWSER_ORIGIN,
				inspectionSecret: "must-not-be-admitted",
			} as never,
		});
		expect((await callPrepare()).status).toBe(503);
	});

	it.each([
		["extra", prepareProjection({ serverOnly: { storageContinuation: CONTINUATION } })],
		["bad path", prepareProjection({ uploadPath: "/v1/catalog-assets/editor-uploads/inspection" })],
		["bad token", prepareProjection({ uploadToken: "token" })],
		["bad operation", prepareProjection({ operationId: "not-an-operation" })],
		["expired", prepareProjection({ uploadExpiresAt: new Date(Date.now() - 1).toISOString() })],
	])("rejects malformed journal projection: %s", async (_name, body) => {
		configure();
		vi.stubGlobal("fetch", vi.fn(async () => response(body)));
		const result = await callPrepare();
		expect(result.status).toBe(502);
		expect(await result.json()).toEqual({ status: "service_unavailable" });
	});

	it("bounds the journal response without leaking its body", async () => {
		configure();
		vi.stubGlobal("fetch", vi.fn(async () => new Response(`{"secret":"${"x".repeat(17_000)}"}`, {
			headers: { "Content-Type": "application/json" },
		})));
		const result = await callPrepare();
		expect(result.status).toBe(502);
		expect(await result.text()).not.toContain("secret");
	});

	it.each([400, 401, 403, 409, 410, 422, 429, 502, 503])(
		"maps journal status %i without upstream body leakage",
		async (status) => {
			configure();
			vi.stubGlobal("fetch", vi.fn(async () => new Response("private upstream details", {
				status,
				headers: status === 429 ? { "Retry-After": "999999" } : {},
			})));
			const result = await callPrepare();
			expect(result.status).toBe(status);
			expect(await result.text()).not.toContain("private upstream details");
			if (status === 429) expect(result.headers.get("Retry-After")).toBe("300");
		},
	);
});

describe("Node 24 Worker wire compatibility", () => {
	it("matches the server-fetch classifier merged in Worker 6de645b2", async () => {
		expect(process.versions.node).toMatch(/^24\./);
		let resolveHeaders!: (headers: Headers) => void;
		const received = new Promise<Headers>((resolve) => {
			resolveHeaders = resolve;
		});
		const server = createServer((incoming, outgoing) => {
			const headers = new Headers();
			for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
				headers.append(incoming.rawHeaders[index]!, incoming.rawHeaders[index + 1]!);
			}
			resolveHeaders(headers);
			incoming.resume();
			outgoing.writeHead(204).end();
		});
		const origin = await listen(server);
		try {
			const result = await fetch(`${origin}/v1/catalog-assets/editor-uploads/storage`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${STORAGE_SECRET}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ storageContinuation: CONTINUATION }),
				redirect: "manual",
			});
			expect(result.status).toBe(204);
			const headers = await received;
			expect([...headers].filter(([name]) => name.startsWith("sec-fetch-")))
				.toEqual([["sec-fetch-mode", "cors"]]);
			expect(headers.has("Origin")).toBe(false);
			expect(headers.has("Cookie")).toBe(false);
			expect(headers.has("X-CMS-Editor-Upload-Token")).toBe(false);
			expect(headers.has("Sec-Fetch-Site")).toBe(false);
			expect(headers.has("Sec-Fetch-Dest")).toBe(false);
			expect(headers.has("Sec-Fetch-User")).toBe(false);
		} finally {
			await close(server);
		}
	});
});

describe("catalog private editor upload complete handler", () => {
	it("returns only the exact verified safe print asset from journal reconciliation", async () => {
		configure();
		const fetchMock = vi.fn(async () => response(journalStatus("verified", { asset: safePrintAsset() })));
		vi.stubGlobal("fetch", fetchMock);
		const result = await callComplete();
		expect(result.status).toBe(200);
		expect(await result.json()).toEqual({ status: "verified", asset: safePrintAsset() });
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
			`${JOURNAL_ORIGIN}/cms-media/catalog-private-assets/editor-upload/journal/status`,
		);
	});

	it("accepts the exact safe digital asset union", async () => {
		configure();
		const asset = {
			kind: "paid_digital_file",
			assetId: "jd712digital",
			status: "verified",
			originalFilename: "download.zip",
			mimeType: "application/zip",
			sizeBytes: 16_777_216,
			version: "2026.1",
			createdAt: 1_750_000_000_000,
		};
		vi.stubGlobal("fetch", vi.fn(async () => response(journalStatus("verified", { asset }))));
		expect(await (await callComplete()).json()).toEqual({ status: "verified", asset });
	});

	it.each([
		["asset extra", safePrintAsset({ privateObjectKey: "private/key" })],
		["asset hash", safePrintAsset({ sha256: "a".repeat(64) })],
		["wrong kind shape", safePrintAsset({ kind: "paid_digital_file" })],
		["oversized digital", {
			kind: "paid_digital_file", assetId: "id", status: "verified",
			originalFilename: "file.zip", mimeType: "application/zip",
			sizeBytes: 16_777_217, createdAt: 1,
		}],
	])("rejects unsafe verified projection: %s", async (_name, asset) => {
		configure();
		vi.stubGlobal("fetch", vi.fn(async () => response(journalStatus("verified", { asset }))));
		const result = await callComplete();
		expect(result.status).toBe(502);
		expect(await result.text()).not.toMatch(/privateObjectKey|sha256|private\/key/);
	});

	it("returns pending inspection without claiming or fetching inspection", async () => {
		configure();
		const fetchMock = vi.fn(async () => response(journalStatus("inspection_pending")));
		vi.stubGlobal("fetch", fetchMock);
		const result = await callComplete();
		expect(result.status).toBe(202);
		expect(await result.json()).toEqual({ status: "pending_inspection" });
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("inspectionContinuation");
		expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("claim-inspection");
	});

	it("claims only storage, calls only the fixed Worker storage path, ACKs, and reconciles", async () => {
		configure();
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(response(journalStatus("storage_pending")))
			.mockResolvedValueOnce(response({
				storageContinuation: CONTINUATION,
				leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
				lease: LEASE,
			}))
			.mockResolvedValueOnce(response({
				status: "pending_inspection",
				replayed: false,
			}))
			.mockResolvedValueOnce(response({ status: "acknowledged" }))
			.mockResolvedValueOnce(response(journalStatus("inspection_pending")));
		vi.stubGlobal("fetch", fetchMock);

		const result = await callComplete(browserRequest(
			{ uploadHandle: HANDLE },
			{ headers: { "X-Arbitrary-Browser-Header": "must-not-forward" } },
		));
		expect(result.status).toBe(202);
		expect(await result.json()).toEqual({ status: "pending_inspection" });
		expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
			`${JOURNAL_ORIGIN}/cms-media/catalog-private-assets/editor-upload/journal/status`,
			`${JOURNAL_ORIGIN}/cms-media/catalog-private-assets/editor-upload/journal/claim-storage`,
			`${WORKER_ORIGIN}/v1/catalog-assets/editor-uploads/storage`,
			`${JOURNAL_ORIGIN}/cms-media/catalog-private-assets/editor-upload/journal/ack-storage`,
			`${JOURNAL_ORIGIN}/cms-media/catalog-private-assets/editor-upload/journal/status`,
		]);
		const workerInit = fetchMock.mock.calls[2]?.[1] as RequestInit;
		expect(workerInit.headers).toEqual({
			Authorization: `Bearer ${STORAGE_SECRET}`,
			"Content-Type": "application/json",
		});
		expect(JSON.parse(String(workerInit.body))).toEqual({ storageContinuation: CONTINUATION });
		const ackInit = fetchMock.mock.calls[3]?.[1] as RequestInit;
		expect(JSON.parse(String(ackInit.body))).toEqual({
			uploadHandle: HANDLE,
			lease: LEASE,
			outcome: "success",
		});
		const serialized = JSON.stringify(fetchMock.mock.calls);
		expect(serialized).not.toContain("session=private");
		expect(serialized).not.toContain("must-not-forward");
		expect(serialized).not.toContain("X-Arbitrary-Browser-Header");
		expect(serialized).not.toContain("claim-inspection");
		expect(serialized).not.toContain("/inspection");
	});

	it("allocates a 52s overall deadline with bounded status, claim, Worker, ACK, and reconcile stages", async () => {
		configure();
		const timeout = vi.spyOn(AbortSignal, "timeout");
		vi.stubGlobal("fetch", vi.fn()
			.mockResolvedValueOnce(response(journalStatus("storage_pending")))
			.mockResolvedValueOnce(response({
				storageContinuation: CONTINUATION,
				leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
				lease: LEASE,
			}))
			.mockResolvedValueOnce(response({ status: "pending_inspection", replayed: false }))
			.mockResolvedValueOnce(response({ status: "acknowledged" }))
			.mockResolvedValueOnce(response(journalStatus("inspection_pending"))));

		expect((await callComplete()).status).toBe(202);
		expect(timeout.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([
			52_000,
			6_000,
			6_000,
			24_000,
			6_000,
			6_000,
		]);
	});

	it("ACKs and reconciles after the bounded Worker stage loses its response", async () => {
		configure();
		const controllers = new Map<number, AbortController[]>();
		vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
			const controller = new AbortController();
			const entries = controllers.get(milliseconds) ?? [];
			entries.push(controller);
			controllers.set(milliseconds, entries);
			return controller.signal;
		});
		let call = 0;
		const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			call += 1;
			if (call === 1) return response(journalStatus("storage_pending"));
			if (call === 2) return response({
				storageContinuation: CONTINUATION,
				leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
				lease: LEASE,
			});
			if (call === 3) {
				return await new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => reject(new TypeError("timed out")), {
						once: true,
					});
				});
			}
			if (call === 4) return response({
				status: "retry_scheduled",
				retryAt: new Date(Date.now() + 30_000).toISOString(),
			});
			return response(journalStatus("inspection_pending"));
		});
		vi.stubGlobal("fetch", fetchMock);

		const pending = callComplete();
		while (fetchMock.mock.calls.length < 3) await Promise.resolve();
		controllers.get(24_000)?.[0]?.abort();
		const result = await pending;

		expect(result.status).toBe(202);
		expect(await result.json()).toEqual({ status: "pending_inspection" });
		expect(fetchMock).toHaveBeenCalledTimes(5);
		expect(JSON.parse(String((fetchMock.mock.calls[3]?.[1] as RequestInit).body))).toEqual({
			uploadHandle: HANDLE,
			lease: LEASE,
			outcome: "retryable",
		});
	});

	it.each([
		["unauthorized", 401, 401, "unauthorized"],
		["forbidden", 403, 403, "forbidden"],
		["verifier configuration failure", 500, 503, "service_unavailable"],
	] as const)("preserves a timely %s auth failure without effects", async (
		_name,
		verifierStatus,
		expectedStatus,
		expectedCode,
	) => {
		let markVerifierStarted!: () => void;
		const verifierStarted = new Promise<void>((resolve) => {
			markVerifierStarted = resolve;
		});
		let settleVerifier!: () => void;
		const verifierGate = new Promise<void>((resolve) => {
			settleVerifier = resolve;
		});
		const verify = configure(vi.fn(async () => {
			markVerifierStarted();
			await verifierGate;
			if (verifierStatus === 401) return false;
			throw { status: verifierStatus };
		}));
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const pending = callComplete();
		await verifierStarted;
		settleVerifier();
		const result = await pending;

		expect(result.status).toBe(expectedStatus);
		expect(result.headers.get("Retry-After")).toBeNull();
		expect(await result.json()).toEqual({ status: expectedCode });
		expect(verify).toHaveBeenCalledOnce();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns the exact retry response when the overall deadline expires during authorization", async () => {
		let markVerifierStarted!: () => void;
		const verifierStarted = new Promise<void>((resolve) => {
			markVerifierStarted = resolve;
		});
		let settleVerifier!: (authorized: boolean) => void;
		const verifierGate = new Promise<boolean>((resolve) => {
			settleVerifier = resolve;
		});
		const verify = configure(vi.fn(() => {
			markVerifierStarted();
			return verifierGate;
		}));
		const controllers = new Map<number, AbortController>();
		vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
			const controller = new AbortController();
			controllers.set(milliseconds, controller);
			return controller.signal;
		});
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const pending = callComplete();
		await verifierStarted;
		const overallController = controllers.get(52_000);
		if (!overallController) throw new Error("Complete deadline was not allocated");
		overallController.abort();
		settleVerifier(false);
		const result = await pending;

		expect(result.status).toBe(202);
		expect(result.headers.get("Retry-After")).toBe("1");
		expect(await result.json()).toEqual({ status: "retry_later" });
		expect(verify).toHaveBeenCalledOnce();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("converges when the Worker response is lost after its receipt arrives", async () => {
		configure();
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(response(journalStatus("storage_pending")))
			.mockResolvedValueOnce(response({
				storageContinuation: CONTINUATION,
				leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
				lease: LEASE,
			}))
			.mockRejectedValueOnce(new TypeError("lost response"))
			.mockResolvedValueOnce(new Response("receipt reconciled first", { status: 409 }))
			.mockResolvedValueOnce(response(journalStatus("inspection_pending")));
		vi.stubGlobal("fetch", fetchMock);
		const result = await callComplete();
		expect(result.status).toBe(202);
		expect(await result.json()).toEqual({ status: "pending_inspection" });
		expect(JSON.parse(String((fetchMock.mock.calls[3]?.[1] as RequestInit).body))).toEqual({
			uploadHandle: HANDLE,
			lease: LEASE,
			outcome: "retryable",
		});
	});

	it("converges when a replayed Worker completion verifies before ACK", async () => {
		configure();
		const asset = safePrintAsset();
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(response(journalStatus("storage_pending")))
			.mockResolvedValueOnce(response({
				storageContinuation: CONTINUATION,
				leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
				lease: LEASE,
			}))
			.mockResolvedValueOnce(response({ status: "verified", replayed: true }))
			.mockResolvedValueOnce(response({ status: "acknowledged" }))
			.mockResolvedValueOnce(response(journalStatus("verified", { asset })));
		vi.stubGlobal("fetch", fetchMock);
		const result = await callComplete();
		expect(result.status).toBe(200);
		expect(await result.json()).toEqual({ status: "verified", asset });
	});

	it("ACKs retryable Worker failures and returns a bounded retry contract", async () => {
		configure();
		const retryAt = new Date(Date.now() + 90_000).toISOString();
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(response(journalStatus("storage_pending")))
			.mockResolvedValueOnce(response({
				storageContinuation: CONTINUATION,
				leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
				lease: LEASE,
			}))
			.mockResolvedValueOnce(new Response("upload incomplete", { status: 503 }))
			.mockResolvedValueOnce(response({ status: "retry_scheduled", retryAt }))
			.mockResolvedValueOnce(response(journalStatus("storage_pending", { retryAt })));
		vi.stubGlobal("fetch", fetchMock);
		const result = await callComplete();
		expect(result.status).toBe(202);
		expect(await result.json()).toEqual({ status: "retry_later" });
		expect(Number(result.headers.get("Retry-After"))).toBeGreaterThan(0);
		expect(Number(result.headers.get("Retry-After"))).toBeLessThanOrEqual(300);
		expect(JSON.parse(String((fetchMock.mock.calls[3]?.[1] as RequestInit).body))).toMatchObject({
			outcome: "retryable",
		});
	});

	it.each([400, 409, 410, 422])("ACKs definite Worker rejection %i as rejected", async (status) => {
		configure();
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(response(journalStatus("storage_pending")))
			.mockResolvedValueOnce(response({
				storageContinuation: CONTINUATION,
				leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
				lease: LEASE,
			}))
			.mockResolvedValueOnce(new Response("sensitive", { status }))
			.mockResolvedValueOnce(response({ status: "rejected" }))
			.mockResolvedValueOnce(response(journalStatus("failed")));
		vi.stubGlobal("fetch", fetchMock);
		const result = await callComplete();
		expect(result.status).toBe(409);
		expect(await result.text()).not.toContain("sensitive");
		expect(JSON.parse(String((fetchMock.mock.calls[3]?.[1] as RequestInit).body))).toMatchObject({
			outcome: "rejected",
		});
	});

	it("rejects malformed or extra Worker success and never leaks continuations", async () => {
		configure();
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(response(journalStatus("storage_pending")))
			.mockResolvedValueOnce(response({
				storageContinuation: CONTINUATION,
				leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
				lease: LEASE,
			}))
			.mockResolvedValueOnce(response({
				status: "pending_inspection", replayed: false,
				inspectionContinuation: "must-not-pass",
			}))
			.mockResolvedValueOnce(response({
				status: "retry_scheduled",
				retryAt: new Date(Date.now() + 30_000).toISOString(),
			}))
			.mockResolvedValueOnce(response(journalStatus("storage_pending", {
				retryAt: new Date(Date.now() + 30_000).toISOString(),
			})));
		vi.stubGlobal("fetch", fetchMock);
		const result = await callComplete();
		expect(result.status).toBe(202);
		const text = await result.text();
		expect(text).not.toMatch(/continuation|lease|token|inspection/i);
	});

	it("rejects an oversized Worker response, ACKs retryable, and remains generic", async () => {
		configure();
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(response(journalStatus("storage_pending")))
			.mockResolvedValueOnce(response({
				storageContinuation: CONTINUATION,
				leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
				lease: LEASE,
			}))
			.mockResolvedValueOnce(new Response(`{"secret":"${"x".repeat(9000)}"}`, {
				headers: { "Content-Type": "application/json" },
			}))
			.mockResolvedValueOnce(response({
				status: "retry_scheduled",
				retryAt: new Date(Date.now() + 30_000).toISOString(),
			}))
			.mockResolvedValueOnce(response(journalStatus("storage_pending", {
				retryAt: new Date(Date.now() + 30_000).toISOString(),
			})));
		vi.stubGlobal("fetch", fetchMock);
		const result = await callComplete();
		expect(result.status).toBe(202);
		expect(await result.text()).not.toContain("secret");
	});

	it.each([
		["extra complete field", { uploadHandle: HANDLE, operationId: "f".repeat(40) }],
		["bad handle", { uploadHandle: "not-a-handle" }],
		["array", [HANDLE]],
	])("authenticates then rejects invalid complete body: %s", async (_name, body) => {
		const verify = configure();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const result = await callComplete(browserRequest(body));
		expect(result.status).toBe(400);
		expect(verify).toHaveBeenCalledOnce();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		["expired", 410],
		["failed", 409],
	])("maps terminal journal status %s generically", async (status, expected) => {
		configure();
		vi.stubGlobal("fetch", vi.fn(async () => response(journalStatus(status))));
		const result = await callComplete();
		expect(result.status).toBe(expected);
		expect(await result.json()).toEqual({ status: expected === 410 ? "unavailable" : "conflict" });
	});

	it("uses only coarse fixed log codes", async () => {
		configure();
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.stubGlobal("fetch", vi.fn(async () => new Response(
			`upstream-details ${HANDLE} ${TOKEN} ${LEASE}`,
			{ status: 503 },
		)));
		await callComplete();
		const logs = error.mock.calls.flat().join(" ");
		expect(logs).toContain("reconcile_response");
		expect(logs).not.toContain(HANDLE);
		expect(logs).not.toContain(TOKEN);
		expect(logs).not.toContain(LEASE);
		expect(logs).not.toContain("upstream-details");
	});
});
