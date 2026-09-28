import { error, isHttpError } from "@sveltejs/kit";
import { ConvexHttpClient } from "convex/browser";
import { getServerConfig } from "../../config.js";
import { requireAdmin } from "../requireAdmin.js";
import {
	ContentExportError,
	ContentExportLimitError,
	createContentExportPackage,
	exportByteLength,
	exportFingerprint,
	exportSha256,
	prepareContentExport,
	readContentExportInventory,
	type ExportFileDigest,
} from "../contentExportCore.js";

const ARCHIVE_MAX = 16 * 1024 * 1024;
const METADATA_MAX = 1024 * 1024;
function object(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
async function readBounded(response: Response, maximum: number) {
	if (!response.body) throw error(502, "The export service returned an empty response.");
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const part = await reader.read();
			if (part.done) break;
			size += part.value.length;
			if (size > maximum)
				throw error(413, "This export needs operator assistance. Contact your hosting provider.");
			chunks.push(part.value);
		}
	} catch (failure) {
		await reader.cancel().catch(() => {});
		throw failure;
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	return bytes;
}
/** Prepare privately, verify, then return the archive. No export artifacts are stored on the server. */
export function createContentExportHandler() {
	return async ({ request }: { request: Request }) => {
		if (request.headers.get("Origin") !== new URL(request.url).origin)
			throw error(403, "Same-origin export is required.");
		await requireAdmin(request);
		if (request.body) {
			const supplied = await readBounded(new Response(request.body), 4096);
			if (new TextDecoder().decode(supplied).trim() !== "")
				throw error(400, "Export requests do not accept content or tenant selections.");
		}
		const config = getServerConfig();
		const reference = config.api.contentExport?.page;
		if (
			!config.contentExportEndpoint ||
			!reference ||
			!config.getConvexToken ||
			!config.cmsMediaWorkerUrl ||
			!config.cmsMediaTenantSecret
		)
			throw error(503, "Website export is not configured.");
		const origin = new URL(config.cmsMediaWorkerUrl);
		if (
			origin.protocol !== "https:" ||
			origin.username ||
			origin.password ||
			origin.search ||
			origin.hash ||
			origin.pathname !== "/"
		)
			throw error(503, "Website export is not configured.");
		const token = await config.getConvexToken(request);
		if (!token) throw error(401, "Sign in again before exporting.");
		const signal = AbortSignal.any([request.signal, AbortSignal.timeout(180000)]);
		const client = new ConvexHttpClient(config.convexUrl, {
			logger: false,
			fetch: (input, init) => fetch(input, { ...init, signal, cache: "no-store" }),
		});
		client.setAuth(token);
		const inventory = () =>
			readContentExportInventory(
				config.siteUrl,
				(family, cursor) =>
					client.query(reference, {
						siteUrl: config.siteUrl,
						family,
						paginationOpts: { cursor, numItems: 1 },
					}),
				{ records: 250, metadataBytes: METADATA_MAX },
			);
		const worker = async (path: "inspect" | "archive", body: object) => {
			const serialized = JSON.stringify(body);
			if (exportByteLength(serialized) > METADATA_MAX + 128 * 1024)
				throw error(413, "This export needs operator assistance. Contact your hosting provider.");
			const response = await fetch(new URL(`/v1/content-export/${path}`, origin), {
				method: "POST",
				redirect: "error",
				signal,
				headers: {
					Authorization: `Bearer ${config.cmsMediaTenantSecret}`,
					"Content-Type": "application/json",
				},
				body: serialized,
			});
			if (response.status === 413)
				throw error(413, "This export needs operator assistance. Contact your hosting provider.");
			if (!response.ok) {
				await response.body?.cancel();
				throw error(
					502,
					"The export could not be verified. Retry or contact your hosting provider.",
				);
			}
			return response;
		};
		try {
			const snapshot = await inventory();
			const fingerprint = await exportFingerprint(snapshot);
			const plan = prepareContentExport(snapshot);
			if (plan.files.length > 100 || plan.totalBytes > ARCHIVE_MAX - METADATA_MAX)
				throw error(413, "This export needs operator assistance. Contact your hosting provider.");
			const assets = plan.files.map(({ kind, assetKey, path, sizeBytes, mimeType, sha256 }) => ({
				kind,
				assetKey,
				path,
				sizeBytes,
				mimeType,
				...(sha256 ? { sha256 } : {}),
			}));
			const inspected: unknown = JSON.parse(
				new TextDecoder().decode(
					await readBounded(
						await worker("inspect", { siteUrl: config.siteUrl, assets }),
						128 * 1024,
					),
				),
			);
			if (
				!object(inspected) ||
				inspected.siteUrl !== config.siteUrl ||
				!Array.isArray(inspected.files) ||
				inspected.files.length !== assets.length
			)
				throw error(502, "Invalid export inventory.");
			const completed: Record<string, ExportFileDigest> = {};
			for (const file of inspected.files) {
				if (
					!object(file) ||
					typeof file.path !== "string" ||
					typeof file.sizeBytes !== "number" ||
					typeof file.sha256 !== "string" ||
					!/^[a-f0-9]{64}$/.test(file.sha256) ||
					Object.hasOwn(completed, file.path) ||
					!assets.some(
						(asset) =>
							asset.path === file.path &&
							asset.sizeBytes === file.sizeBytes &&
							(!asset.sha256 || asset.sha256 === file.sha256),
					)
				)
					throw error(502, "Invalid export file integrity.");
				completed[file.path] = { sizeBytes: file.sizeBytes, sha256: file.sha256 };
			}
			const prepared = await createContentExportPackage(
				snapshot,
				plan,
				completed,
				new Date().toISOString(),
			);
			if (
				Object.values(prepared.metadata).reduce(
					(total, text) => total + exportByteLength(text),
					0,
				) > METADATA_MAX
			)
				throw error(413, "This export needs operator assistance. Contact your hosting provider.");
			const response = await worker("archive", {
				siteUrl: config.siteUrl,
				assets: assets.map((asset) => ({ ...asset, sha256: completed[asset.path].sha256 })),
				metadata: prepared.metadata,
			});
			const expectedHash = response.headers.get("X-Export-Sha256");
			if (
				response.headers.get("Content-Type") !== "application/zip" ||
				!expectedHash ||
				!/^[a-f0-9]{64}$/.test(expectedHash)
			) {
				await response.body?.cancel();
				throw error(502, "Invalid export archive.");
			}
			const archive = await readBounded(response, ARCHIVE_MAX);
			// Streaming responses may omit their transport length; the archive hash remains mandatory.
			const declaredLength = response.headers.get("Content-Length");
			if (
				(declaredLength !== null && archive.length !== Number(declaredLength)) ||
				(await exportSha256(archive)) !== expectedHash
			)
				throw error(502, "Export archive integrity mismatch.");
			if ((await exportFingerprint(await inventory())) !== fingerprint)
				throw error(
					409,
					"Your content changed while the export was being prepared. Please try again.",
				);
			signal.throwIfAborted();
			// Stream an already verified archive so hosted response-size limits do not truncate the download.
			let offset = 0;
			const body = new ReadableStream<Uint8Array>({
				pull(controller) {
					if (offset >= archive.length) {
						controller.close();
						return;
					}
					const end = Math.min(offset + 65536, archive.length);
					controller.enqueue(archive.subarray(offset, end));
					offset = end;
				},
			});
			return new Response(body, {
				headers: {
					"Content-Type": "application/zip",
					"Content-Disposition": `attachment; filename="${config.siteUrl}-content-export.zip"`,
					"Cache-Control": "private, no-store",
					"X-Content-Type-Options": "nosniff",
					"X-Export-Sha256": expectedHash,
				},
			});
		} catch (failure) {
			if (isHttpError(failure)) throw failure;
			if (failure instanceof ContentExportLimitError)
				throw error(413, "This export needs operator assistance. Contact your hosting provider.");
			if (failure instanceof ContentExportError) throw error(409, failure.message);
			throw error(
				signal.aborted ? 408 : 502,
				signal.aborted
					? "The export was cancelled or timed out. Please try again."
					: "The export could not be completed. Please try again or contact your hosting provider.",
			);
		}
	};
}
