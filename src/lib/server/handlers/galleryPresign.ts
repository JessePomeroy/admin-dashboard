import { error, json } from "@sveltejs/kit";
import { getServerConfig } from "../../config.js";
import { handleServerError } from "../handleError.js";
import { isGalleryOriginalKeyForSession } from "../galleryStorageKeys.js";
import { requireAdmin } from "../requireAdmin.js";
import { validateFilename } from "../validation.js";

const UPLOAD_SESSION_SCOPE = "gallery-upload-session";
const DEFAULT_UPLOAD_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const BULK_DELETE_KEYS_PER_WORKER_REQUEST = 150;

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
	const config = requireWorkerConfig();
	const token = constraints.uploadSessionToken ?? request.headers.get("X-Gallery-Upload-Session");
	const session = await verifyUploadSessionToken(config.galleryAdminSecret!, token);

	if (session) {
		if (constraints.siteUrl && session.siteUrl !== constraints.siteUrl) throw error(403, "Upload session site mismatch");
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

function isGalleryKeyForConfiguredSite(key: string, siteUrl: string): boolean {
	const normalizedSiteUrl = siteUrl.replace(/\/+$/, "");
	return key.startsWith(`${normalizedSiteUrl}/`);
}

export function createGalleryUploadSessionHandler() {
	return async ({ request }: { request: Request }) => {
		await requireAdmin(request);
		const config = requireWorkerConfig();

		let data;
		try {
			data = await request.json();
		} catch {
			throw error(400, "Invalid JSON body");
		}

		if (!data.siteUrl || !data.galleryId) {
			throw error(400, "siteUrl and galleryId are required");
		}
		if (data.siteUrl !== config.siteUrl) {
			throw error(403, "Upload session site mismatch");
		}

		const { token, expiresAt } = await createUploadSessionToken(
			config.galleryAdminSecret!,
			data.siteUrl,
			data.galleryId,
		);

		return json({ uploadSessionToken: token, expiresAt });
	};
}

export function createGalleryPresignHandler() {
	return async ({ request }: { request: Request }) => {
		const config = requireWorkerConfig();

		let data;
		try {
			data = await request.json();
		} catch {
			throw error(400, "Invalid JSON body");
		}

		if (!data.siteUrl || !data.galleryId || !data.filename || !data.contentType) {
			throw error(400, "siteUrl, galleryId, filename, and contentType are required");
		}
		await requireGalleryUploadAccess(request, {
			siteUrl: data.siteUrl,
			galleryId: data.galleryId,
			uploadSessionToken: data.uploadSessionToken,
		});

		try {
			data.filename = validateFilename(data.filename);
		} catch (err) {
			throw error(400, (err as Error).message);
		}

		try {
			const res = await fetch(`${config.galleryWorkerUrl}/upload/presign`, {
				method: "POST",
				headers: workerHeaders(config.galleryAdminSecret!),
				body: JSON.stringify(data),
			});

			if (!res.ok) throw error(res.status, await res.text());
			return json(await parseWorkerJson(res));
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
		await requireGalleryUploadAccess(request, { r2Key: key });

		try {
			const res = await fetch(
				`${config.galleryWorkerUrl}/upload/put?key=${encodeURIComponent(key)}`,
				{
					method: "PUT",
					headers: {
						"Content-Type": request.headers.get("Content-Type") ?? "application/octet-stream",
						Authorization: `Bearer ${config.galleryAdminSecret}`,
					},
					body: request.body,
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

		const data = await request.json();
		if (!data.r2Key) throw error(400, "r2Key is required");
		await requireGalleryUploadAccess(request, {
			r2Key: data.r2Key,
			uploadSessionToken: data.uploadSessionToken,
		});

		try {
			const res = await fetch(`${config.galleryWorkerUrl}/upload/process`, {
				method: "POST",
				headers: workerHeaders(config.galleryAdminSecret!),
				body: JSON.stringify(data),
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

		const { r2Key, uploadSessionToken } = await request.json();
		if (!r2Key) throw error(400, "r2Key is required");
		await requireGalleryUploadAccess(request, { r2Key, uploadSessionToken });

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
		if (stringKeys.some((key) => !isGalleryKeyForConfiguredSite(key, config.siteUrl))) {
			throw error(403, "Bulk delete keys must belong to this site");
		}

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
