import { error, json } from "@sveltejs/kit";
import { getServerConfig } from "../../config.js";
import { isValidGalleryUploadSize } from "../../galleryUploadSize.js";
import { handleServerError } from "../handleError.js";
import {
	canonicalGallerySiteUrl,
	isGalleryOriginalKeyForSession,
	isGalleryStorageSegment,
	parseGalleryStorageKey,
} from "../galleryStorageKeys.js";
import { getRequiredAdminVerifier, requireAdmin } from "../requireAdmin.js";
import { validateFilename } from "../validation.js";

const UPLOAD_SESSION_SCOPE = "gallery-upload-session";
const DEFAULT_UPLOAD_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const BULK_DELETE_KEYS_PER_WORKER_REQUEST = 150;
const UPLOAD_CAPABILITY_HEADER = "X-Gallery-Upload-Token";

interface GalleryUploadSessionPayload {
	scope: typeof UPLOAD_SESSION_SCOPE;
	siteUrl: string;
	galleryId: string;
	iat: number;
	exp: number;
}

/** Validate gallery worker config, throw 500 if missing. */
function requireWorkerConfig() {
	const config = getServerConfig();
	if (!config.galleryWorkerUrl || !config.galleryAdminSecret) {
		throw error(500, "Gallery worker not configured");
	}
	return config;
}

function requireConfiguredGallerySite(configuredSiteUrl: string): string {
	const siteUrl = canonicalGallerySiteUrl(configuredSiteUrl);
	if (!siteUrl) throw error(500, "Gallery site not configured");
	return siteUrl;
}

function requireMatchingGallerySite(
	siteUrl: unknown,
	configuredSiteUrl: string,
): string {
	if (typeof siteUrl !== "string" || !siteUrl) {
		throw error(400, "siteUrl is required");
	}
	const configuredSite = requireConfiguredGallerySite(configuredSiteUrl);
	if (canonicalGallerySiteUrl(siteUrl) !== configuredSite) {
		throw error(403, "Gallery site must match the configured host");
	}
	return configuredSite;
}

function requireGalleryId(galleryId: unknown): string {
	if (!isGalleryStorageSegment(galleryId)) {
		throw error(400, "galleryId must be one storage-key segment");
	}
	return galleryId;
}

function requireGalleryKeyForConfiguredSite(
	r2Key: unknown,
	configuredSiteUrl: string,
	options: { originalOnly?: boolean } = {},
): string {
	if (typeof r2Key !== "string" || !r2Key) {
		throw error(400, "Invalid gallery object key");
	}
	const parsed = parseGalleryStorageKey(r2Key);
	if (!parsed || !isGalleryStorageSegment(parsed.galleryId)) {
		throw error(400, "Invalid gallery object key");
	}
	if (
		canonicalGallerySiteUrl(parsed.siteUrl)
		!== requireConfiguredGallerySite(configuredSiteUrl)
	) {
		throw error(403, "Gallery object key must belong to the configured host");
	}
	if (options.originalOnly && parsed.kind !== "original") {
		throw error(400, "An original gallery object key is required");
	}
	return r2Key;
}

function optionalUploadSessionToken(value: unknown): string | null | undefined {
	if (value === null || value === undefined || typeof value === "string") return value;
	throw error(400, "uploadSessionToken must be a string");
}

function optionalGalleryUploadSize(value: unknown): number | undefined {
	if (value === undefined) return undefined;
	if (!isValidGalleryUploadSize(value)) {
		throw error(400, "sizeBytes must be a positive supported upload size");
	}
	return value;
}

function requireUploadContentLength(request: Request): number {
	const value = request.headers.get("Content-Length");
	if (!value) throw error(411, "Content-Length is required");
	if (!/^\d+$/.test(value)) throw error(400, "Invalid Content-Length");
	const sizeBytes = Number(value);
	if (!isValidGalleryUploadSize(sizeBytes)) {
		throw error(400, "Invalid Content-Length");
	}
	return sizeBytes;
}

type FixedLengthStreamConstructor = new(
	expectedLength: number,
) => TransformStream<Uint8Array, Uint8Array>;

function fixedLengthUploadBody(
	body: ReadableStream<Uint8Array>,
	sizeBytes: number,
): ReadableStream<Uint8Array> {
	const FixedLengthStream = (
		globalThis as typeof globalThis & {
			FixedLengthStream?: FixedLengthStreamConstructor;
		}
	).FixedLengthStream;
	return typeof FixedLengthStream === "function"
		? body.pipeThrough(new FixedLengthStream(sizeBytes))
		: body;
}

function base64UrlEncode(input: string | ArrayBuffer): string {
	const bytes = typeof input === "string"
		? new TextEncoder().encode(input)
		: new Uint8Array(input);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array {
	const padded = input.replaceAll("-", "+").replaceAll("_", "/").padEnd(
		Math.ceil(input.length / 4) * 4,
		"=",
	);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function hmacSha256(secret: string, payload: string): Promise<ArrayBuffer> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

async function createUploadSessionToken(
	secret: string,
	siteUrl: string,
	galleryId: string,
): Promise<{ token: string; expiresAt: number }> {
	const now = Date.now();
	const expiresAt = now + DEFAULT_UPLOAD_SESSION_TTL_MS;
	const payload: GalleryUploadSessionPayload = {
		scope: UPLOAD_SESSION_SCOPE,
		siteUrl,
		galleryId,
		iat: now,
		exp: expiresAt,
	};
	const encodedPayload = base64UrlEncode(JSON.stringify(payload));
	const signature = base64UrlEncode(await hmacSha256(secret, encodedPayload));
	return { token: `${encodedPayload}.${signature}`, expiresAt };
}

async function verifyUploadSessionToken(
	secret: string,
	token: string | null | undefined,
): Promise<GalleryUploadSessionPayload | null> {
	if (!token) return null;
	const [encodedPayload, encodedSignature] = token.split(".");
	if (!encodedPayload || !encodedSignature) return null;

	const expectedSignature = new Uint8Array(await hmacSha256(secret, encodedPayload));
	let actualSignature: Uint8Array;
	try {
		actualSignature = base64UrlDecode(encodedSignature);
	} catch {
		return null;
	}
	if (!timingSafeEqual(expectedSignature, actualSignature)) return null;

	let payload: GalleryUploadSessionPayload;
	try {
		payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));
	} catch {
		return null;
	}

	if (payload.scope !== UPLOAD_SESSION_SCOPE) return null;
	if (typeof payload.siteUrl !== "string" || typeof payload.galleryId !== "string") return null;
	if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
	return payload;
}

async function requireGalleryUploadAccess(
	request: Request,
	constraints: {
		siteUrl?: string;
		galleryId?: string;
		r2Key?: string;
		uploadSessionToken?: string | null;
	},
): Promise<void> {
	// A scoped upload grant can replace a repeated cookie/session check, but it
	// must never make missing host authorization configuration fail open.
	getRequiredAdminVerifier();
	const config = requireWorkerConfig();
	const configuredSite = requireConfiguredGallerySite(config.siteUrl);
	if (constraints.siteUrl !== undefined) {
		requireMatchingGallerySite(constraints.siteUrl, configuredSite);
	}
	if (constraints.galleryId !== undefined) {
		requireGalleryId(constraints.galleryId);
	}
	if (constraints.r2Key !== undefined) {
		requireGalleryKeyForConfiguredSite(constraints.r2Key, configuredSite);
	}
	const token = constraints.uploadSessionToken ?? request.headers.get("X-Gallery-Upload-Session");
	const session = await verifyUploadSessionToken(config.galleryAdminSecret!, token);

	if (session) {
		if (canonicalGallerySiteUrl(session.siteUrl) !== configuredSite) {
			throw error(403, "Upload session is not valid for this host");
		}
		if (!isGalleryStorageSegment(session.galleryId)) {
			throw error(403, "Upload session gallery is invalid");
		}
		if (
			constraints.siteUrl
			&& canonicalGallerySiteUrl(session.siteUrl)
			!== canonicalGallerySiteUrl(constraints.siteUrl)
		) throw error(403, "Upload session site mismatch");
		if (constraints.galleryId && session.galleryId !== constraints.galleryId) throw error(403, "Upload session gallery mismatch");
		if (constraints.r2Key && !isGalleryOriginalKeyForSession(constraints.r2Key, session)) {
			throw error(403, "Upload session cannot access this file");
		}
		return;
	}

	await requireAdmin(request);
}

/** Standard headers for gallery worker requests. */
function workerHeaders(secret: string, contentType = "application/json") {
	return {
		"Content-Type": contentType,
		Authorization: `Bearer ${secret}`,
	};
}

/**
 * Safely parse a worker response as JSON. If the worker returns non-JSON
 * (e.g. a Cloudflare interstitial HTML page on 200), surface a clean 502 so
 * callers don't see a confusing "Unexpected token <" JSON parse error.
 */
async function parseWorkerJson(res: Response): Promise<unknown> {
	const contentType = res.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		const snippet = (await res.text()).slice(0, 200);
		throw error(
			502,
			`Gallery worker returned non-JSON response (content-type: ${contentType || "unknown"}): ${snippet}`,
		);
	}
	return res.json();
}

function requireV2WorkerPresignResult(
	value: unknown,
	options: {
		workerUrl: string;
		siteUrl: string;
		galleryId: string;
	},
) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw error(502, "Gallery worker returned an invalid upload capability");
	}
	const { r2Key, uploadUrl, uploadToken } = value as Record<string, unknown>;
	if (
		typeof r2Key !== "string"
		|| typeof uploadUrl !== "string"
		|| typeof uploadToken !== "string"
		|| !uploadToken
		|| uploadToken !== uploadToken.trim()
	) throw error(502, "Gallery worker returned an invalid upload capability");

	const parsedKey = parseGalleryStorageKey(r2Key);
	if (
		!parsedKey
		|| parsedKey.kind !== "original"
		|| canonicalGallerySiteUrl(parsedKey.siteUrl) !== options.siteUrl
		|| parsedKey.galleryId !== options.galleryId
	) throw error(502, "Gallery worker returned an invalid upload capability");

	try {
		const worker = new URL(options.workerUrl);
		const endpoint = new URL(uploadUrl, worker);
		const queryNames = [...endpoint.searchParams.keys()];
		if (
			endpoint.origin !== worker.origin
			|| endpoint.pathname !== "/upload/put"
			|| endpoint.searchParams.get("key") !== r2Key
			|| endpoint.searchParams.has("token")
			|| queryNames.some((name) => name !== "key")
		) throw new Error("invalid endpoint");
	} catch {
		throw error(502, "Gallery worker returned an invalid upload capability");
	}

	return { r2Key, uploadUrl, uploadToken };
}

function chunkKeys(keys: string[]): string[][] {
	const chunks: string[][] = [];
	for (let i = 0; i < keys.length; i += BULK_DELETE_KEYS_PER_WORKER_REQUEST) {
		chunks.push(keys.slice(i, i + BULK_DELETE_KEYS_PER_WORKER_REQUEST));
	}
	return chunks;
}

function getDeletedCount(result: unknown): number {
	if (!result || typeof result !== "object") return 0;
	const { deleted } = result as { deleted?: unknown };
	return typeof deleted === "number" ? deleted : 0;
}

export function createGalleryUploadSessionHandler() {
	return async ({ request }: { request: Request }) => {
		await requireAdmin(request);
		const config = requireWorkerConfig();

		let data: unknown;
		try {
			data = await request.json();
		} catch {
			throw error(400, "Invalid JSON body");
		}

		if (!data || typeof data !== "object" || Array.isArray(data)) {
			throw error(400, "siteUrl and galleryId are required");
		}
		const input = data as { siteUrl?: unknown; galleryId?: unknown };
		const siteUrl = requireMatchingGallerySite(input.siteUrl, config.siteUrl);
		const galleryId = requireGalleryId(input.galleryId);

		const { token, expiresAt } = await createUploadSessionToken(
			config.galleryAdminSecret!,
			siteUrl,
			galleryId,
		);

		return json({ uploadSessionToken: token, expiresAt });
	};
}

export function createGalleryPresignHandler() {
	return async ({ request }: { request: Request }) => {
		const config = requireWorkerConfig();

		let data: unknown;
		try {
			data = await request.json();
		} catch {
			throw error(400, "Invalid JSON body");
		}

		if (!data || typeof data !== "object" || Array.isArray(data)) {
			throw error(400, "siteUrl, galleryId, filename, and contentType are required");
		}
		const input = data as {
			siteUrl?: unknown;
			galleryId?: unknown;
			filename?: unknown;
			contentType?: unknown;
			sizeBytes?: unknown;
			uploadSessionToken?: unknown;
		};
		if (typeof input.filename !== "string" || !input.filename
			|| typeof input.contentType !== "string" || !input.contentType) {
			throw error(400, "siteUrl, galleryId, filename, and contentType are required");
		}
		const siteUrl = requireMatchingGallerySite(input.siteUrl, config.siteUrl);
		const galleryId = requireGalleryId(input.galleryId);
		const sizeBytes = optionalGalleryUploadSize(input.sizeBytes);
		const uploadSessionToken = optionalUploadSessionToken(input.uploadSessionToken);
		await requireGalleryUploadAccess(request, {
			siteUrl,
			galleryId,
			uploadSessionToken,
		});

		let filename: string;
		try {
			filename = validateFilename(input.filename);
		} catch (err) {
			throw error(400, (err as Error).message);
		}

		try {
			const res = await fetch(`${config.galleryWorkerUrl}/upload/presign`, {
				method: "POST",
				headers: workerHeaders(config.galleryAdminSecret!),
				body: JSON.stringify({
					siteUrl,
					galleryId,
					filename,
					contentType: input.contentType,
					...(sizeBytes === undefined ? {} : { sizeBytes }),
				}),
			});

			if (!res.ok) throw error(res.status, await res.text());
			const result = await parseWorkerJson(res);
			return json(sizeBytes === undefined
				? result
				: requireV2WorkerPresignResult(result, {
					workerUrl: config.galleryWorkerUrl!,
					siteUrl,
					galleryId,
				}));
		} catch (err) {
			handleServerError(err, "Failed to generate upload URL");
		}
	};
}

export function createGalleryUploadHandler() {
	return async ({ request }: { request: Request }) => {
		const config = requireWorkerConfig();

		const url = new URL(request.url);
		const key = url.searchParams.get("key");
		if (!key) throw error(400, "Missing key parameter");
		requireGalleryKeyForConfiguredSite(key, config.siteUrl);
		await requireGalleryUploadAccess(request, { r2Key: key });
		requireGalleryKeyForConfiguredSite(key, config.siteUrl, { originalOnly: true });
		const uploadToken = request.headers.get(UPLOAD_CAPABILITY_HEADER);
		if (!uploadToken) throw error(400, "Upload capability is required");
		const sizeBytes = requireUploadContentLength(request);
		if (!request.body) throw error(400, "Upload body is required");
		const body = fixedLengthUploadBody(request.body, sizeBytes);

		try {
			const res = await fetch(
				`${config.galleryWorkerUrl}/upload/put?key=${encodeURIComponent(key)}`,
				{
					method: "PUT",
					headers: {
						"Content-Type": request.headers.get("Content-Type") ?? "application/octet-stream",
						"Content-Length": String(sizeBytes),
						[UPLOAD_CAPABILITY_HEADER]: uploadToken,
					},
					body,
					// @ts-expect-error — duplex is required for streaming request bodies but missing from TypeScript's RequestInit
					duplex: "half",
				},
			);

			if (!res.ok) throw error(res.status, await res.text());
			return json(await parseWorkerJson(res));
		} catch (err) {
			handleServerError(err, "Failed to upload file");
		}
	};
}

export function createGalleryProcessHandler() {
	return async ({ request }: { request: Request }) => {
		const config = requireWorkerConfig();

		const data = await request.json() as { r2Key?: unknown; uploadSessionToken?: unknown };
		const r2Key = requireGalleryKeyForConfiguredSite(data?.r2Key, config.siteUrl);
		const uploadSessionToken = optionalUploadSessionToken(data?.uploadSessionToken);
		await requireGalleryUploadAccess(request, {
			r2Key,
			uploadSessionToken,
		});
		requireGalleryKeyForConfiguredSite(r2Key, config.siteUrl, { originalOnly: true });

		try {
			const res = await fetch(`${config.galleryWorkerUrl}/upload/process`, {
				method: "POST",
				headers: workerHeaders(config.galleryAdminSecret!),
				body: JSON.stringify({ r2Key }),
			});

			if (!res.ok) throw error(res.status, await res.text());
			return json(await parseWorkerJson(res));
		} catch (err) {
			handleServerError(err, "Failed to process image");
		}
	};
}

export function createGalleryDeleteHandler() {
	return async ({ request }: { request: Request }) => {
		const config = requireWorkerConfig();

		const data = await request.json() as { r2Key?: unknown; uploadSessionToken?: unknown };
		const r2Key = requireGalleryKeyForConfiguredSite(data?.r2Key, config.siteUrl);
		const uploadSessionToken = optionalUploadSessionToken(data?.uploadSessionToken);
		await requireGalleryUploadAccess(request, { r2Key, uploadSessionToken });
		requireGalleryKeyForConfiguredSite(r2Key, config.siteUrl, { originalOnly: true });

		try {
			const res = await fetch(`${config.galleryWorkerUrl}/upload/delete`, {
				method: "POST",
				headers: workerHeaders(config.galleryAdminSecret!),
				body: JSON.stringify({ r2Key }),
			});

			if (!res.ok) throw error(res.status, await res.text());
			return json(await parseWorkerJson(res));
		} catch (err) {
			handleServerError(err, "Failed to delete image");
		}
	};
}

export function createGalleryBulkDeleteHandler() {
	return async ({ request }: { request: Request }) => {
		const config = requireWorkerConfig();
		await requireAdmin(request);

		let data: unknown;
		try {
			data = await request.json();
		} catch {
			throw error(400, "Invalid JSON body");
		}

		if (!data || typeof data !== "object" || Array.isArray(data)) {
			throw error(400, "keys are required");
		}
		const { keys } = data as { keys?: unknown };
		if (!Array.isArray(keys) || keys.length === 0) {
			throw error(400, "keys are required");
		}
		if (keys.some((key) => typeof key !== "string")) {
			throw error(400, "keys must be strings");
		}
		const stringKeys = keys as string[];
		for (const key of stringKeys) requireGalleryKeyForConfiguredSite(key, config.siteUrl);

		try {
			let deleted = 0;
			let chunks = 0;
			for (const keyChunk of chunkKeys(stringKeys)) {
				const res = await fetch(`${config.galleryWorkerUrl}/admin/bulk-delete`, {
					method: "POST",
					headers: workerHeaders(config.galleryAdminSecret!),
					body: JSON.stringify({ keys: keyChunk }),
				});

				if (!res.ok) throw error(res.status, await res.text());
				deleted += getDeletedCount(await parseWorkerJson(res));
				chunks += 1;
			}
			return json({ success: true, deleted, chunks });
		} catch (err) {
			handleServerError(err, "Failed to bulk delete gallery images");
		}
	};
}

/**
 * Stream one gallery thumbnail through the authenticated host. The browser
 * never receives the Worker admin secret, and the host never buffers image
 * bytes. Customer-facing image routes use portal access grants instead.
 */
export function createGalleryImageHandler() {
	return async ({ request, url }: { request: Request; url: URL }) => {
		const config = requireWorkerConfig();
		await requireAdmin(request);
		const key = url.searchParams.get("key");
		if (!key) throw error(400, "key is required");
		requireGalleryKeyForConfiguredSite(key, config.siteUrl);

		try {
			const res = await fetch(
				`${config.galleryWorkerUrl}/admin/image/${encodeURIComponent(key)}`,
				{ headers: { Authorization: `Bearer ${config.galleryAdminSecret}` } },
			);
			if (!res.ok) throw error(res.status, await res.text());
			return new Response(res.body, {
				status: res.status,
				statusText: res.statusText,
				headers: res.headers,
			});
		} catch (err) {
			handleServerError(err, "Failed to load gallery image");
		}
	};
}
