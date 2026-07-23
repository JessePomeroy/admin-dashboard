import { getServerConfig, type CatalogPrivateEditorUploadConfig } from "../../config.js";
import { requireAdmin } from "../requireAdmin.js";

const SUPPORTED_SITE = "angelsrest.online";
const PRODUCTION_BROWSER_ORIGIN = "https://www.angelsrest.online";
const PRODUCTION_WORKER_ORIGIN = "https://cms-media-worker.thinkingofview.workers.dev";
const SOURCE_PATH = "/v1/catalog-assets/editor-uploads/source";
const STORAGE_PATH = "/v1/catalog-assets/editor-uploads/storage";
const JOURNAL_BEGIN_PATH = "/cms-media/catalog-private-assets/editor-upload/journal/begin";
const JOURNAL_STATUS_PATH = "/cms-media/catalog-private-assets/editor-upload/journal/status";
const JOURNAL_STORAGE_CLAIM_PATH =
	"/cms-media/catalog-private-assets/editor-upload/journal/claim-storage";
const JOURNAL_STORAGE_ACK_PATH =
	"/cms-media/catalog-private-assets/editor-upload/journal/ack-storage";
const PREPARE_BODY_MAX_BYTES = 16 * 1024;
const COMPLETE_BODY_MAX_BYTES = 4 * 1024;
const JOURNAL_RESPONSE_MAX_BYTES = 16 * 1024;
const WORKER_RESPONSE_MAX_BYTES = 8 * 1024;
const PREPARE_OVERALL_TIMEOUT_MS = 25_000;
const PREPARE_JOURNAL_TIMEOUT_MS = 10_000;
const COMPLETE_OVERALL_TIMEOUT_MS = 52_000;
const COMPLETE_STATUS_TIMEOUT_MS = 6_000;
const COMPLETE_CLAIM_TIMEOUT_MS = 6_000;
const COMPLETE_WORKER_TIMEOUT_MS = 24_000;
const COMPLETE_ACK_TIMEOUT_MS = 6_000;
const COMPLETE_RECONCILE_TIMEOUT_MS = 6_000;
const PRINT_MAX_SIZE_BYTES = 100_000_000;
const DIGITAL_MAX_SIZE_BYTES = 16_777_216;
const FULL_RASTER_PIXEL_MAX = 100_000_000;
const RETRY_AFTER_MAX_SECONDS = 300;
const UUID_V4_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPERATION_ID_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const LEASE_PATTERN = /^[0-9a-f]{40}$/;
const TOKEN_PATTERN = /^cms-editor-upload-v1\.[A-Za-z0-9_-]{2768}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const SAFE_HEADERS = {
	"Cache-Control": "no-store",
	"X-Content-Type-Options": "nosniff",
} as const;

export type CatalogPrivateEditorUploadPrintPrepareRequest = {
	uploadHandle: string;
	productKind: "print" | "print_set";
	originalFilename: string;
	contentType: "image/jpeg" | "image/png";
	sizeBytes: number;
	sha256: string;
	widthPixels: number;
	heightPixels: number;
};

export type CatalogPrivateEditorUploadDigitalPrepareRequest = {
	uploadHandle: string;
	productKind: "digital_download";
	originalFilename: string;
	contentType: "application/zip";
	sizeBytes: number;
	sha256: string;
	version?: string;
};

export type CatalogPrivateEditorUploadPrepareRequest =
	| CatalogPrivateEditorUploadPrintPrepareRequest
	| CatalogPrivateEditorUploadDigitalPrepareRequest;

export type CatalogPrivateEditorUploadPrepareResponse = {
	status: "upload_required";
	uploadHandle: string;
	uploadUrl: string;
	uploadToken: string;
	uploadExpiresAt: string;
};

export type CatalogPrivateEditorUploadCompleteRequest = {
	uploadHandle: string;
};

export type CatalogPrivateEditorUploadPrintAsset = {
	kind: "print_source";
	assetId: string;
	status: "verified";
	originalFilename: string;
	mimeType: "image/jpeg" | "image/png";
	sizeBytes: number;
	widthPixels: number;
	heightPixels: number;
	createdAt: number;
};

export type CatalogPrivateEditorUploadDigitalAsset = {
	kind: "paid_digital_file";
	assetId: string;
	status: "verified";
	originalFilename: string;
	mimeType: "application/zip";
	sizeBytes: number;
	version?: string;
	createdAt: number;
};

export type CatalogPrivateEditorUploadAsset =
	| CatalogPrivateEditorUploadPrintAsset
	| CatalogPrivateEditorUploadDigitalAsset;

export type CatalogPrivateEditorUploadVerifiedResponse = {
	status: "verified";
	asset: CatalogPrivateEditorUploadAsset;
};

export type CatalogPrivateEditorUploadPendingResponse = {
	status: "pending_inspection" | "storage_pending" | "retry_later";
};

export type CatalogPrivateEditorUploadCompleteResponse =
	| CatalogPrivateEditorUploadVerifiedResponse
	| CatalogPrivateEditorUploadPendingResponse;

type HandlerEvent = { request: Request };
type PrepareInput = CatalogPrivateEditorUploadPrepareRequest;
type JournalStatusName =
	| "preparing"
	| "upload_required"
	| "storage_pending"
	| "inspection_pending"
	| "verified"
	| "expired"
	| "failed";
type JournalStatus = {
	status: JournalStatusName;
	retryAt?: string;
	asset?: CatalogPrivateEditorUploadAsset;
};
type StorageClaim = {
	storageContinuation: string;
	lease: string;
	leaseExpiresAt: string;
};
type StorageOutcome = "success" | "retryable" | "rejected";

type UpstreamResult =
	| { kind: "response"; response: Response }
	| { kind: "ambiguous" };

const ABORTED = Symbol("aborted");

async function beforeAbort<T>(promise: Promise<T>, signal: AbortSignal) {
	if (signal.aborted) return ABORTED;
	return new Promise<T | typeof ABORTED>((resolve, reject) => {
		const abort = () => resolve(ABORTED);
		signal.addEventListener("abort", abort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener("abort", abort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener("abort", abort);
				reject(error);
			},
		);
	});
}

function stageSignal(overallSignal: AbortSignal, timeoutMs: number) {
	return AbortSignal.any([overallSignal, AbortSignal.timeout(timeoutMs)]);
}

function jsonResponse(status: number, body: object, retryAfter?: number) {
	const headers = new Headers(SAFE_HEADERS);
	if (retryAfter !== undefined) headers.set("Retry-After", String(retryAfter));
	return Response.json(body, { status, headers });
}

function errorResponse(status: number, code: string, retryAfter?: number) {
	return jsonResponse(status, { status: code }, retryAfter);
}

function pendingResponse(status: CatalogPrivateEditorUploadPendingResponse["status"], retryAfter?: number) {
	return jsonResponse(202, { status }, retryAfter);
}

function logFailure(code:
	| "journal_fetch"
	| "journal_response"
	| "journal_parse"
	| "worker_fetch"
	| "worker_response"
	| "worker_parse"
	| "ack_fetch"
	| "ack_response"
	| "ack_parse"
	| "reconcile_fetch"
	| "reconcile_response"
	| "reconcile_parse") {
	console.error(JSON.stringify({
		route: "catalog_private_editor_upload",
		code,
	}));
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
	const keys = Object.keys(value);
	return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
	return Object.keys(value).every((key) => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isWellFormedText(value: unknown, maximum: number): value is string {
	if (
		typeof value !== "string"
		|| value.length === 0
		|| value.length > maximum
		|| value !== value.trim()
		|| CONTROL_CHARACTER_PATTERN.test(value)
	) return false;
	for (let index = 0; index < value.length; index += 1) {
		const codeUnit = value.charCodeAt(index);
		if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
			const trailing = value.charCodeAt(index + 1);
			if (!(trailing >= 0xdc00 && trailing <= 0xdfff)) return false;
			index += 1;
		} else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) return false;
	}
	return true;
}

function positiveSafeInteger(value: unknown, maximum: number): value is number {
	return typeof value === "number"
		&& Number.isSafeInteger(value)
		&& value > 0
		&& value <= maximum;
}

function canonicalIso(value: unknown) {
	if (typeof value !== "string" || value.length > 32) return null;
	const timestamp = new Date(value).valueOf();
	return Number.isSafeInteger(timestamp) && new Date(timestamp).toISOString() === value
		? { value, timestamp }
		: null;
}

function parseOrigin(value: unknown, requireConvex = false) {
	if (typeof value !== "string") return null;
	try {
		const url = new URL(value);
		if (
			url.protocol !== "https:"
			|| url.username !== ""
			|| url.password !== ""
			|| url.origin !== value
			|| (requireConvex && !url.hostname.endsWith(".convex.site"))
		) return null;
		return url.origin;
	} catch {
		return null;
	}
}

function validSecret(value: unknown) {
	return typeof value === "string"
		&& value.length >= 32
		&& value.length <= 512
		&& value === value.trim();
}

function requireUploadConfig(): CatalogPrivateEditorUploadConfig | null {
	const config = getServerConfig();
	const upload = config.catalogPrivateEditorUpload;
	if (
		config.siteUrl !== SUPPORTED_SITE
		|| !upload
		|| !exactKeys(upload as unknown as Record<string, unknown>, [
			"convexJournalOrigin",
			"hostJournalSecret",
			"workerOrigin",
			"storageCallerSecret",
			"browserOrigin",
		])
		|| !parseOrigin(upload.convexJournalOrigin, true)
		|| upload.workerOrigin !== PRODUCTION_WORKER_ORIGIN
		|| !parseOrigin(upload.workerOrigin)
		|| !validSecret(upload.hostJournalSecret)
		|| !validSecret(upload.storageCallerSecret)
		|| upload.hostJournalSecret === upload.storageCallerSecret
		|| upload.browserOrigin !== PRODUCTION_BROWSER_ORIGIN
	) return null;
	return upload;
}

function fixedUrl(origin: string, path: string) {
	const url = new URL(path, `${origin}/`);
	if (url.origin !== origin || url.pathname !== path || url.search !== "" || url.hash !== "") {
		throw new TypeError("Invalid fixed upstream URL");
	}
	return url.toString();
}

function validBrowserEnvelope(request: Request, config: CatalogPrivateEditorUploadConfig) {
	let url: URL;
	try {
		url = new URL(request.url);
	} catch {
		return false;
	}
	return request.method === "POST"
		&& url.origin === config.browserOrigin
		&& url.search === ""
		&& request.headers.get("Origin") === config.browserOrigin
		&& request.headers.get("Sec-Fetch-Site") === "same-origin"
		&& request.headers.get("Sec-Fetch-Mode") === "cors"
		&& request.headers.get("Sec-Fetch-Dest") === "empty"
		&& request.headers.get("Content-Type") === "application/json";
}

async function readBoundedBody(
	request: Request,
	maximumBytes: number,
	signal: AbortSignal,
) {
	const contentLength = request.headers.get("Content-Length");
	let expectedLength: number | null = null;
	if (contentLength !== null) {
		const parsed = Number(contentLength);
		if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximumBytes) return null;
		expectedLength = parsed;
	}
	if (!request.body) return null;
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let byteLength = 0;
	try {
		while (true) {
			const read = await beforeAbort(reader.read(), signal);
			if (read === ABORTED) {
				await reader.cancel().catch(() => undefined);
				return null;
			}
			const { done, value } = read;
			if (done) break;
			byteLength += value.byteLength;
			if (byteLength > maximumBytes) {
				await reader.cancel().catch(() => undefined);
				return null;
			}
			chunks.push(value);
		}
	} catch {
		await reader.cancel().catch(() => undefined);
		return null;
	} finally {
		reader.releaseLock();
	}
	if (byteLength === 0 || (expectedLength !== null && byteLength !== expectedLength)) return null;
	const bytes = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

function parseJsonObject(bytes: Uint8Array) {
	try {
		const value = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
		return isRecord(value) ? value : null;
	} catch {
		return null;
	}
}

async function authorize(request: Request, signal: AbortSignal) {
	try {
		const result = await beforeAbort(requireAdmin(request), signal);
		if (result === ABORTED) return errorResponse(503, "service_unavailable", 1);
		return null;
	} catch (error) {
		const upstreamStatus = isRecord(error) ? error.status : undefined;
		const status = upstreamStatus === 403 ? 403 : upstreamStatus === 500 ? 503 : 401;
		return errorResponse(
			status,
			status === 403 ? "forbidden" : status === 503 ? "service_unavailable" : "unauthorized",
		);
	}
}

function parsePrepareInput(value: Record<string, unknown>): PrepareInput | null {
	if (!UUID_V4_PATTERN.test(typeof value.uploadHandle === "string" ? value.uploadHandle : "")) {
		return null;
	}
	if (
		(value.productKind === "print" || value.productKind === "print_set")
		&& exactKeys(value, [
			"uploadHandle",
			"productKind",
			"originalFilename",
			"contentType",
			"sizeBytes",
			"sha256",
			"widthPixels",
			"heightPixels",
		])
		&& isWellFormedText(value.originalFilename, 255)
		&& !/[\\/]/.test(value.originalFilename)
		&& (value.contentType === "image/jpeg" || value.contentType === "image/png")
		&& positiveSafeInteger(value.sizeBytes, PRINT_MAX_SIZE_BYTES)
		&& positiveSafeInteger(value.widthPixels, 100_000)
		&& positiveSafeInteger(value.heightPixels, 100_000)
		&& value.widthPixels * value.heightPixels <= FULL_RASTER_PIXEL_MAX
		&& SHA256_PATTERN.test(typeof value.sha256 === "string" ? value.sha256 : "")
		&& (value.contentType === "image/jpeg"
			? /\.jpe?g$/i.test(value.originalFilename)
			: /\.png$/i.test(value.originalFilename))
	) return value as PrepareInput;
	const expectedKeys = value.version === undefined
		? ["uploadHandle", "productKind", "originalFilename", "contentType", "sizeBytes", "sha256"]
		: [
				"uploadHandle",
				"productKind",
				"originalFilename",
				"contentType",
				"sizeBytes",
				"sha256",
				"version",
			];
	if (
		value.productKind === "digital_download"
		&& exactKeys(value, expectedKeys)
		&& isWellFormedText(value.originalFilename, 255)
		&& !/[\\/]/.test(value.originalFilename)
		&& /\.zip$/i.test(value.originalFilename)
		&& value.contentType === "application/zip"
		&& positiveSafeInteger(value.sizeBytes, DIGITAL_MAX_SIZE_BYTES)
		&& SHA256_PATTERN.test(typeof value.sha256 === "string" ? value.sha256 : "")
		&& (value.version === undefined || isWellFormedText(value.version, 64))
	) return value as PrepareInput;
	return null;
}

function parseCompleteInput(value: Record<string, unknown>) {
	return exactKeys(value, ["uploadHandle"])
		&& UUID_V4_PATTERN.test(typeof value.uploadHandle === "string" ? value.uploadHandle : "")
		? value.uploadHandle as string
		: null;
}

function retryAfterFromHeader(response: Response) {
	const value = response.headers.get("Retry-After");
	if (!value || !/^\d{1,10}$/.test(value)) return undefined;
	const seconds = Number(value);
	return Number.isSafeInteger(seconds) && seconds >= 1
		? Math.min(seconds, RETRY_AFTER_MAX_SECONDS)
		: undefined;
}

function retryAfterFromIso(value: string | undefined) {
	const iso = canonicalIso(value);
	if (!iso) return undefined;
	return Math.max(1, Math.min(
		Math.ceil((iso.timestamp - Date.now()) / 1000),
		RETRY_AFTER_MAX_SECONDS,
	));
}

async function postUpstream(
	url: string,
	secret: string,
	body: object,
	signal: AbortSignal,
): Promise<UpstreamResult> {
	if (signal.aborted) return { kind: "ambiguous" };
	try {
		return {
			kind: "response",
			response: await fetch(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${secret}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
				redirect: "manual",
				signal,
			}),
		};
	} catch {
		return { kind: "ambiguous" };
	}
}

async function readBoundedUpstreamJson(
	response: Response,
	maximumBytes: number,
	signal: AbortSignal,
) {
	if (response.headers.get("Content-Type") !== "application/json") {
		await response.body?.cancel().catch(() => undefined);
		return null;
	}
	const contentLength = response.headers.get("Content-Length");
	let expectedLength: number | null = null;
	if (contentLength !== null) {
		const parsed = Number(contentLength);
		if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximumBytes) {
			await response.body?.cancel().catch(() => undefined);
			return null;
		}
		expectedLength = parsed;
	}
	if (!response.body) return null;
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let byteLength = 0;
	try {
		while (true) {
			const read = await beforeAbort(reader.read(), signal);
			if (read === ABORTED) {
				await reader.cancel().catch(() => undefined);
				return null;
			}
			const { done, value } = read;
			if (done) break;
			byteLength += value.byteLength;
			if (byteLength > maximumBytes) {
				await reader.cancel().catch(() => undefined);
				return null;
			}
			chunks.push(value);
		}
	} catch {
		await reader.cancel().catch(() => undefined);
		return null;
	} finally {
		reader.releaseLock();
	}
	if (expectedLength !== null && byteLength !== expectedLength) return null;
	const bytes = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return parseJsonObject(bytes);
}

function mapUpstreamError(response: Response) {
	const status = [400, 401, 403, 409, 410, 422, 429, 502, 503].includes(response.status)
		? response.status
		: 502;
	const code = status === 400
		? "invalid_request"
		: status === 401
			? "unauthorized"
			: status === 403
				? "forbidden"
				: status === 409
					? "conflict"
					: status === 410
						? "unavailable"
						: status === 422
							? "unprocessable"
							: status === 429
								? "retry_later"
								: "service_unavailable";
	return errorResponse(status, code, status === 429 ? retryAfterFromHeader(response) : undefined);
}

function parsePrepareProjection(value: Record<string, unknown>) {
	if (
		!exactKeys(value, ["replayed", "operationId", "uploadPath", "uploadToken", "uploadExpiresAt"])
		|| typeof value.replayed !== "boolean"
		|| !OPERATION_ID_PATTERN.test(typeof value.operationId === "string" ? value.operationId : "")
		|| value.uploadPath !== SOURCE_PATH
		|| !TOKEN_PATTERN.test(typeof value.uploadToken === "string" ? value.uploadToken : "")
	) return null;
	const expiresAt = canonicalIso(value.uploadExpiresAt);
	if (!expiresAt || expiresAt.timestamp <= Date.now() || expiresAt.timestamp > Date.now() + 16 * 60 * 1000) {
		return null;
	}
	return {
		uploadToken: value.uploadToken as string,
		uploadExpiresAt: expiresAt.value,
	};
}

function parseSafeAsset(value: unknown): CatalogPrivateEditorUploadAsset | null {
	if (!isRecord(value)) return null;
	const commonValid = isWellFormedText(value.assetId, 128)
		&& value.status === "verified"
		&& isWellFormedText(value.originalFilename, 255)
		&& !/[\\/]/.test(value.originalFilename)
		&& positiveSafeInteger(value.sizeBytes, PRINT_MAX_SIZE_BYTES)
		&& typeof value.createdAt === "number"
		&& Number.isSafeInteger(value.createdAt)
		&& value.createdAt >= 0;
	if (!commonValid) return null;
	if (
		value.kind === "print_source"
		&& exactKeys(value, [
			"kind",
			"assetId",
			"status",
			"originalFilename",
			"mimeType",
			"sizeBytes",
			"widthPixels",
			"heightPixels",
			"createdAt",
		])
		&& (value.mimeType === "image/jpeg" || value.mimeType === "image/png")
		&& (value.mimeType === "image/jpeg"
			? /\.jpe?g$/i.test(value.originalFilename as string)
			: /\.png$/i.test(value.originalFilename as string))
		&& positiveSafeInteger(value.widthPixels, 100_000)
		&& positiveSafeInteger(value.heightPixels, 100_000)
		&& value.widthPixels * value.heightPixels <= FULL_RASTER_PIXEL_MAX
	) return value as CatalogPrivateEditorUploadPrintAsset;
	const digitalKeys = value.version === undefined
		? ["kind", "assetId", "status", "originalFilename", "mimeType", "sizeBytes", "createdAt"]
		: [
				"kind",
				"assetId",
				"status",
				"originalFilename",
				"mimeType",
				"sizeBytes",
				"version",
				"createdAt",
			];
	if (
		value.kind === "paid_digital_file"
		&& exactKeys(value, digitalKeys)
		&& value.mimeType === "application/zip"
		&& positiveSafeInteger(value.sizeBytes, DIGITAL_MAX_SIZE_BYTES)
		&& /\.zip$/i.test(value.originalFilename as string)
		&& (value.version === undefined || isWellFormedText(value.version, 64))
	) return value as CatalogPrivateEditorUploadDigitalAsset;
	return null;
}

function parseJournalStatus(value: Record<string, unknown>): JournalStatus | null {
	if (!onlyKeys(value, [
		"status",
		"uploadExpiresAt",
		"storageExpiresAt",
		"inspectionExpiresAt",
		"retryAt",
		"asset",
	])) return null;
	if (![
		"preparing",
		"upload_required",
		"storage_pending",
		"inspection_pending",
		"verified",
		"expired",
		"failed",
	].includes(typeof value.status === "string" ? value.status : "")) return null;
	const status = value.status as JournalStatusName;
	if (status === "preparing") {
		return exactKeys(value, ["status"]) ? { status } : null;
	}
	for (const key of ["uploadExpiresAt", "storageExpiresAt", "inspectionExpiresAt"] as const) {
		if (!canonicalIso(value[key])) return null;
	}
	if (value.retryAt !== undefined && !canonicalIso(value.retryAt)) return null;
	const expectedKeys = [
		"status",
		"uploadExpiresAt",
		"storageExpiresAt",
		"inspectionExpiresAt",
		...(value.retryAt === undefined ? [] : ["retryAt"]),
		...(status === "verified" ? ["asset"] : []),
	];
	if (!exactKeys(value, expectedKeys)) return null;
	const asset = status === "verified" ? parseSafeAsset(value.asset) : undefined;
	if (status === "verified" && !asset) return null;
	return {
		status,
		...(typeof value.retryAt === "string" ? { retryAt: value.retryAt } : {}),
		...(asset ? { asset } : {}),
	};
}

function parseStorageClaim(value: Record<string, unknown>) {
	const leaseExpiresAt = canonicalIso(value.leaseExpiresAt);
	if (
		exactKeys(value, ["storageContinuation", "leaseExpiresAt", "lease"])
		&& TOKEN_PATTERN.test(typeof value.storageContinuation === "string" ? value.storageContinuation : "")
		&& LEASE_PATTERN.test(typeof value.lease === "string" ? value.lease : "")
		&& leaseExpiresAt
		&& leaseExpiresAt.timestamp > Date.now()
		&& leaseExpiresAt.timestamp <= Date.now() + 2 * 60 * 1000
	) return value as StorageClaim;
	if (
		exactKeys(value, ["status"])
		&& (value.status === "attempts_exhausted" || value.status === "capability_expired")
	) return { status: value.status } as const;
	return null;
}

function parseWorkerCompletion(value: Record<string, unknown>) {
	return exactKeys(value, ["status", "replayed"])
		&& (value.status === "pending_inspection" || value.status === "verified")
		&& typeof value.replayed === "boolean";
}

function parseAck(value: Record<string, unknown>, outcome: StorageOutcome) {
	if (outcome === "success") {
		return exactKeys(value, ["status"]) && value.status === "acknowledged"
			? { status: "acknowledged" as const }
			: null;
	}
	if (outcome === "rejected") {
		return exactKeys(value, ["status"]) && value.status === "rejected"
			? { status: "rejected" as const }
			: null;
	}
	if (exactKeys(value, ["status"]) && value.status === "attempts_exhausted") {
		return { status: "attempts_exhausted" as const };
	}
	if (exactKeys(value, ["status", "retryAt"]) && value.status === "retry_scheduled") {
		const retryAt = canonicalIso(value.retryAt);
		return retryAt ? { status: "retry_scheduled" as const, retryAt: retryAt.value } : null;
	}
	return null;
}

async function journalStatus(
	config: CatalogPrivateEditorUploadConfig,
	uploadHandle: string,
	signal: AbortSignal,
) {
	const result = await postUpstream(
		fixedUrl(config.convexJournalOrigin, JOURNAL_STATUS_PATH),
		config.hostJournalSecret,
		{ uploadHandle },
		signal,
	);
	if (result.kind === "ambiguous") return { kind: "ambiguous" } as const;
	if (!result.response.ok) {
		await result.response.body?.cancel().catch(() => undefined);
		return { kind: "error", response: result.response } as const;
	}
	const body = await readBoundedUpstreamJson(
		result.response,
		JOURNAL_RESPONSE_MAX_BYTES,
		signal,
	);
	const parsed = body ? parseJournalStatus(body) : null;
	return parsed ? { kind: "status", status: parsed } as const : { kind: "invalid" } as const;
}

function responseFromJournalStatus(status: JournalStatus, fallbackRetryAt?: string) {
	if (status.status === "verified" && status.asset) {
		return jsonResponse(200, { status: "verified", asset: status.asset });
	}
	if (status.status === "inspection_pending") return pendingResponse("pending_inspection");
	if (status.status === "expired") return errorResponse(410, "unavailable");
	if (status.status === "failed") return errorResponse(409, "conflict");
	const retryAt = status.retryAt ?? fallbackRetryAt;
	return retryAt
		? pendingResponse("retry_later", retryAfterFromIso(retryAt))
		: pendingResponse("storage_pending");
}

export function createCatalogPrivateEditorUploadPrepareHandler() {
	return async ({ request }: HandlerEvent): Promise<Response> => {
		const overallSignal = AbortSignal.timeout(PREPARE_OVERALL_TIMEOUT_MS);
		const config = requireUploadConfig();
		if (!config) return errorResponse(503, "service_unavailable");
		if (!validBrowserEnvelope(request, config)) return errorResponse(400, "invalid_request");
		const bodyBytes = await readBoundedBody(request, PREPARE_BODY_MAX_BYTES, overallSignal);
		if (!bodyBytes) return overallSignal.aborted
			? errorResponse(503, "service_unavailable", 1)
			: errorResponse(400, "invalid_request");
		const authFailure = await authorize(request, overallSignal);
		if (authFailure) return authFailure;
		const body = parseJsonObject(bodyBytes);
		const input = body ? parsePrepareInput(body) : null;
		if (!input) return errorResponse(400, "invalid_request");
		const journalSignal = stageSignal(overallSignal, PREPARE_JOURNAL_TIMEOUT_MS);
		const result = await postUpstream(
			fixedUrl(config.convexJournalOrigin, JOURNAL_BEGIN_PATH),
			config.hostJournalSecret,
			input,
			journalSignal,
		);
		if (result.kind === "ambiguous") {
			logFailure("journal_fetch");
			return errorResponse(502, "service_unavailable");
		}
		if (!result.response.ok) {
			await result.response.body?.cancel().catch(() => undefined);
			logFailure("journal_response");
			return mapUpstreamError(result.response);
		}
		const projection = await readBoundedUpstreamJson(
			result.response,
			JOURNAL_RESPONSE_MAX_BYTES,
			journalSignal,
		);
		const parsed = projection ? parsePrepareProjection(projection) : null;
		if (!parsed) {
			logFailure("journal_parse");
			return errorResponse(502, "service_unavailable");
		}
		return jsonResponse(200, {
			status: "upload_required",
			uploadHandle: input.uploadHandle,
			uploadUrl: fixedUrl(config.workerOrigin, SOURCE_PATH),
			uploadToken: parsed.uploadToken,
			uploadExpiresAt: parsed.uploadExpiresAt,
		});
	};
}

export function createCatalogPrivateEditorUploadCompleteHandler() {
	return async ({ request }: HandlerEvent): Promise<Response> => {
		const overallSignal = AbortSignal.timeout(COMPLETE_OVERALL_TIMEOUT_MS);
		const deadlineResponse = () => pendingResponse("retry_later", 1);
		const config = requireUploadConfig();
		if (!config) return errorResponse(503, "service_unavailable");
		if (!validBrowserEnvelope(request, config)) return errorResponse(400, "invalid_request");
		const bodyBytes = await readBoundedBody(request, COMPLETE_BODY_MAX_BYTES, overallSignal);
		if (!bodyBytes) return overallSignal.aborted
			? deadlineResponse()
			: errorResponse(400, "invalid_request");
		const authFailure = await authorize(request, overallSignal);
		if (overallSignal.aborted) return deadlineResponse();
		if (authFailure) return authFailure;
		const body = parseJsonObject(bodyBytes);
		const uploadHandle = body ? parseCompleteInput(body) : null;
		if (!uploadHandle) return errorResponse(400, "invalid_request");

		const initial = await journalStatus(
			config,
			uploadHandle,
			stageSignal(overallSignal, COMPLETE_STATUS_TIMEOUT_MS),
		);
		if (overallSignal.aborted) return deadlineResponse();
		if (initial.kind === "ambiguous") {
			logFailure("reconcile_fetch");
			return errorResponse(502, "service_unavailable");
		}
		if (initial.kind === "error") {
			logFailure("reconcile_response");
			return mapUpstreamError(initial.response);
		}
		if (initial.kind === "invalid") {
			logFailure("reconcile_parse");
			return errorResponse(502, "service_unavailable");
		}
		if (["verified", "inspection_pending", "expired", "failed"].includes(initial.status.status)) {
			return responseFromJournalStatus(initial.status);
		}
		if (initial.status.retryAt && canonicalIso(initial.status.retryAt)!.timestamp > Date.now()) {
			return pendingResponse("retry_later", retryAfterFromIso(initial.status.retryAt));
		}

		const claimSignal = stageSignal(overallSignal, COMPLETE_CLAIM_TIMEOUT_MS);
		const claimResult = await postUpstream(
			fixedUrl(config.convexJournalOrigin, JOURNAL_STORAGE_CLAIM_PATH),
			config.hostJournalSecret,
			{ uploadHandle },
			claimSignal,
		);
		if (overallSignal.aborted) return deadlineResponse();
		if (claimResult.kind === "ambiguous") {
			logFailure("journal_fetch");
			return pendingResponse("retry_later");
		}
		if (!claimResult.response.ok) {
			await claimResult.response.body?.cancel().catch(() => undefined);
			if ([409, 410, 429].includes(claimResult.response.status)) {
				const reconciled = await journalStatus(
					config,
					uploadHandle,
					stageSignal(overallSignal, COMPLETE_RECONCILE_TIMEOUT_MS),
				);
				if (overallSignal.aborted) return deadlineResponse();
				if (reconciled.kind === "status") {
					return responseFromJournalStatus(reconciled.status);
				}
			}
			logFailure("journal_response");
			return claimResult.response.status === 429
				? pendingResponse("retry_later", retryAfterFromHeader(claimResult.response))
				: mapUpstreamError(claimResult.response);
		}
		const claimBody = await readBoundedUpstreamJson(
			claimResult.response,
			JOURNAL_RESPONSE_MAX_BYTES,
			claimSignal,
		);
		if (overallSignal.aborted) return deadlineResponse();
		const claim = claimBody ? parseStorageClaim(claimBody) : null;
		if (!claim) {
			logFailure("journal_parse");
			return errorResponse(502, "service_unavailable");
		}
		if ("status" in claim) {
			return claim.status === "capability_expired"
				? errorResponse(410, "unavailable")
				: errorResponse(409, "conflict");
		}

		const workerSignal = stageSignal(overallSignal, COMPLETE_WORKER_TIMEOUT_MS);
		const workerResult = await postUpstream(
			fixedUrl(config.workerOrigin, STORAGE_PATH),
			config.storageCallerSecret,
			{ storageContinuation: claim.storageContinuation },
			workerSignal,
		);
		if (overallSignal.aborted) return deadlineResponse();
		let outcome: StorageOutcome = "retryable";
		let workerDefinite = false;
		if (workerResult.kind === "ambiguous") {
			logFailure("worker_fetch");
		} else if (workerResult.response.ok) {
			const workerBody = await readBoundedUpstreamJson(
				workerResult.response,
				WORKER_RESPONSE_MAX_BYTES,
				workerSignal,
			);
			if (workerBody && parseWorkerCompletion(workerBody)) {
				outcome = "success";
				workerDefinite = true;
			} else {
				logFailure("worker_parse");
			}
		} else {
			await workerResult.response.body?.cancel().catch(() => undefined);
			workerDefinite = true;
			outcome = [400, 409, 410, 422].includes(workerResult.response.status)
				? "rejected"
				: "retryable";
			logFailure("worker_response");
		}

		const ackSignal = stageSignal(overallSignal, COMPLETE_ACK_TIMEOUT_MS);
		const ackResult = await postUpstream(
			fixedUrl(config.convexJournalOrigin, JOURNAL_STORAGE_ACK_PATH),
			config.hostJournalSecret,
			{ uploadHandle, lease: claim.lease, outcome },
			ackSignal,
		);
		if (overallSignal.aborted) return deadlineResponse();
		let ackRetryAt: string | undefined;
		if (ackResult.kind === "ambiguous") {
			logFailure("ack_fetch");
		} else if (!ackResult.response.ok) {
			await ackResult.response.body?.cancel().catch(() => undefined);
			logFailure("ack_response");
		} else {
			const ackBody = await readBoundedUpstreamJson(
				ackResult.response,
				JOURNAL_RESPONSE_MAX_BYTES,
				ackSignal,
			);
			const ack = ackBody ? parseAck(ackBody, outcome) : null;
			if (!ack) logFailure("ack_parse");
			else if ("retryAt" in ack) ackRetryAt = ack.retryAt;
		}

		const reconciled = await journalStatus(
			config,
			uploadHandle,
			stageSignal(overallSignal, COMPLETE_RECONCILE_TIMEOUT_MS),
		);
		if (overallSignal.aborted) return deadlineResponse();
		if (reconciled.kind === "status") {
			return responseFromJournalStatus(reconciled.status, ackRetryAt);
		}
		if (reconciled.kind === "ambiguous") logFailure("reconcile_fetch");
		else if (reconciled.kind === "error") logFailure("reconcile_response");
		else logFailure("reconcile_parse");
		if (outcome === "rejected" && workerDefinite) return errorResponse(409, "conflict");
		return pendingResponse("retry_later", retryAfterFromIso(ackRetryAt));
	};
}
