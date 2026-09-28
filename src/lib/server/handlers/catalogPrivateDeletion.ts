import { error, json } from "@sveltejs/kit";
import { ConvexHttpClient } from "convex/browser";
import { getServerConfig } from "../../config.js";
import { requireAdmin } from "../requireAdmin.js";

async function boundedJson(stream: ReadableStream<Uint8Array> | null): Promise<Record<string, unknown>> {
	if (!stream) throw error(400, "Missing cleanup request");
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > 4096) { await reader.cancel(); throw error(413, "Cleanup request is too large"); }
			chunks.push(value);
		}
	} finally { reader.releaseLock(); }
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
	let body: unknown;
	try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw error(400, "Invalid cleanup response"); }
	if (!body || typeof body !== "object" || Array.isArray(body)) throw error(400, "Invalid cleanup response");
	return body as Record<string, unknown>;
}

function endpoint(origin: string | undefined, path: string, suffix?: string) {
	if (!origin) throw error(503, "Private file cleanup is not configured");
	const url = new URL(origin);
	if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
		|| url.pathname !== "/" || (suffix && !url.hostname.endsWith(suffix))) {
		throw error(503, "Private file cleanup is not configured");
	}
	return new URL(path, url).href;
}

/** Browser submits only kind + registry ID. The backend owns every storage identity. */
export function createCatalogPrivateDeleteHandler() {
	return async ({ request }: { request: Request }) => {
		if (request.headers.get("Origin") !== new URL(request.url).origin) throw error(403, "Same-origin cleanup is required");
		await requireAdmin(request);
		const config = getServerConfig();
		const registry = config.api.catalogPrivateAssets;
		if (!registry?.requestDeletion || !config.getConvexToken || !config.cmsMediaTenantSecret || !config.cmsMediaDeletionCompletionSecret) {
			throw error(503, "Private file cleanup is not configured");
		}
		const workerUrl = endpoint(config.cmsMediaWorkerUrl, "/v1/catalog-assets/delete");
		const manifestUrl = endpoint(config.cmsMediaConvexSiteUrl, "/cms-media/catalog-private-assets/deletion-manifest", ".convex.site");
		const completionUrl = endpoint(config.cmsMediaConvexSiteUrl, "/cms-media/catalog-private-assets/complete-deletion", ".convex.site");
		if (request.headers.get("Content-Type")?.split(";", 1)[0] !== "application/json") throw error(400, "Invalid cleanup request");
		const input = await boundedJson(request.body);
		if (Object.keys(input).length !== 2 || (input.kind !== "print_source" && input.kind !== "paid_digital_file")
			|| typeof input.id !== "string" || !/^[a-z0-9]{1,128}$/.test(input.id)) throw error(400, "Invalid cleanup request");
		const { id, kind } = input;
		const token = await config.getConvexToken(request);
		if (!token) throw error(401, "Unauthorized");
		const deadline = Date.now() + 45000;
		const client = new ConvexHttpClient(config.convexUrl);
		client.setAuth(token);
		let raw: unknown;
		try { raw = await client.mutation(registry.requestDeletion, { siteUrl: config.siteUrl, kind, id }); }
		catch { throw error(409, "Cleanup was refused. Delete unused product references first; unfinished uploads must expire before cleanup."); }
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw error(502, "Invalid cleanup manifest");
		const intent = raw as Record<string, unknown>;
		if ((intent.status !== "deleting" && intent.status !== "deleted") || typeof intent.deletionId !== "string" || !/^[a-z0-9]{1,128}$/.test(intent.deletionId)) throw error(502, "Invalid cleanup intent");
		if (intent.status === "deleted") return json({ deleted: true, id });
		const manifest = await post(manifestUrl, config.cmsMediaDeletionCompletionSecret, { siteUrl: config.siteUrl, kind, id, deletionId: intent.deletionId });
		const boundary = kind === "print_source" ? "print-sources" : "paid-digital-files";
		if ((manifest.status !== "deleting" && manifest.status !== "deleted") || manifest.siteUrl !== config.siteUrl || manifest.kind !== kind
			|| typeof manifest.assetKey !== "string" || manifest.assetKey.length > 160 || !/^[A-Za-z0-9]+(?:[._:-][A-Za-z0-9]+)*$/.test(manifest.assetKey)
			|| manifest.privateObjectKey !== `sites/${config.siteUrl}/catalog/${boundary}/${manifest.assetKey}/original`
			|| typeof manifest.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.sha256)) throw error(502, "Invalid cleanup manifest");
		if (manifest.status === "deleted") return json({ deleted: true, id });
		const facts = { siteUrl: config.siteUrl, kind, assetKey: manifest.assetKey, sha256: manifest.sha256 };
		async function post(url: string, secret: string, body: object) {
			try {
				const remaining = deadline - Date.now();
				if (remaining <= 0) throw new Error();
				const response = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(Math.min(15000, remaining)),
					headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
				if (!response.ok) throw new Error();
				return await boundedJson(response.body);
			} catch { throw error(502, "Cleanup is incomplete. Retry this same file to finish safely."); }
		}
		const storage = await post(workerUrl, config.cmsMediaTenantSecret, facts);
		if (storage.deleted !== true || Object.entries(facts).some(([key, value]) => storage[key] !== value)) throw error(502, "Storage cleanup identity mismatch");
		const completed = await post(completionUrl, config.cmsMediaDeletionCompletionSecret, { ...facts, id });
		if (completed.deleted !== true || completed.id !== id) throw error(502, "Cleanup completion identity mismatch");
		return json({ deleted: true, id });
	};
}
