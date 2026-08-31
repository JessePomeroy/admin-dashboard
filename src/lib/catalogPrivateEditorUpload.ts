import type {
	CatalogEditorPrivateAsset,
	CatalogProductKind,
} from "./catalogProductEditor";

const PRINT_MAX_SIZE_BYTES = 100_000_000;
const DIGITAL_MAX_SIZE_BYTES = 16_777_216;
const RESPONSE_MAX_BYTES = 16 * 1024;
const RETRY_AFTER_MAX_SECONDS = 300;
const FALLBACK_RETRY_MS = 5_000;
const COMPLETE_TIMEOUT_MS = 60_000;
const SOURCE_URL = "https://cms-media-worker.thinkingofview.workers.dev/v1/catalog-assets/editor-uploads/source";
const UUID_V4_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const ZIP_BROWSER_MIME_TYPES = new Set([
	"",
	"application/octet-stream",
	"application/x-zip-compressed",
	"application/zip",
]);

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

export type CatalogPrivateEditorUploadAsset = CatalogEditorPrivateAsset;
export type CatalogPrivateEditorUploadPrintAsset = Extract<
	CatalogEditorPrivateAsset,
	{ kind: "print_source" }
>;
export type CatalogPrivateEditorUploadDigitalAsset = Extract<
	CatalogEditorPrivateAsset,
	{ kind: "paid_digital_file" }
>;

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

export type CatalogPrivateEditorUploadCompletion =
	| { status: "verified"; asset: CatalogPrivateEditorUploadAsset }
	| { status: "pending"; retryAfterMs: number }
	| { status: "failed" };

type PreparedUpload = Pick<
	CatalogPrivateEditorUploadPrepareResponse,
	"uploadUrl" | "uploadToken"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isRootedQuerylessEndpoint(value: unknown): value is string {
	if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return false;
	try {
		const parsed = new URL(value, "https://cms-editor.invalid");
		return parsed.origin === "https://cms-editor.invalid"
			&& parsed.pathname === value
			&& parsed.search === ""
			&& parsed.hash === "";
	} catch {
		return false;
	}
}

export function newCatalogPrivateEditorUploadHandle() {
	const handle = globalThis.crypto.randomUUID().toLowerCase();
	if (!UUID_V4_PATTERN.test(handle)) throw new TypeError("A secure upload handle could not be created");
	return handle;
}

function abortIfRequested(signal?: AbortSignal) {
	if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
}

function validFilename(file: File, extension: RegExp) {
	return file.name.length > 0
		&& file.name.length <= 255
		&& file.name === file.name.trim()
		&& !CONTROL_CHARACTER_PATTERN.test(file.name)
		&& !/[\\/]/.test(file.name)
		&& extension.test(file.name);
}

function hasZipSignature(bytes: Uint8Array) {
	return bytes.byteLength >= 4
		&& bytes[0] === 0x50
		&& bytes[1] === 0x4b
		&& (
			(bytes[2] === 0x03 && bytes[3] === 0x04)
			|| (bytes[2] === 0x05 && bytes[3] === 0x06)
			|| (bytes[2] === 0x07 && bytes[3] === 0x08)
		);
}

function readPngDimensions(bytes: Uint8Array) {
	if (bytes.byteLength < 24) return null;
	const signature = [137, 80, 78, 71, 13, 10, 26, 10];
	if (!signature.every((value, index) => bytes[index] === value)) return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (
		view.getUint32(8) !== 13
		|| String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR"
	) return null;
	return { widthPixels: view.getUint32(16), heightPixels: view.getUint32(20) };
}

function readJpegDimensions(bytes: Uint8Array) {
	if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
	let offset = 2;
	while (offset < bytes.byteLength) {
		while (bytes[offset] === 0xff) offset += 1;
		if (offset >= bytes.byteLength) return null;
		const marker = bytes[offset++];
		if (marker === 0xda || marker === 0xd9) return null;
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
		if (offset + 2 > bytes.byteLength) return null;
		const length = view.getUint16(offset);
		if (length < 2 || offset + length > bytes.byteLength) return null;
		if (startOfFrame.has(marker)) {
			if (length < 7) return null;
			return {
				widthPixels: view.getUint16(offset + 5),
				heightPixels: view.getUint16(offset + 3),
			};
		}
		offset += length;
	}
	return null;
}

function validDimensions(dimensions: { widthPixels: number; heightPixels: number } | null) {
	return dimensions
		&& dimensions.widthPixels > 0
		&& dimensions.heightPixels > 0
		&& dimensions.widthPixels <= 100_000
		&& dimensions.heightPixels <= 100_000
		&& dimensions.widthPixels * dimensions.heightPixels <= 100_000_000
		? dimensions
		: null;
}

export async function declareCatalogPrivateEditorUpload(
	file: File,
	productKind: CatalogProductKind,
	uploadHandle: string,
	version?: string,
	signal?: AbortSignal,
): Promise<CatalogPrivateEditorUploadPrepareRequest> {
	abortIfRequested(signal);
	if (!UUID_V4_PATTERN.test(uploadHandle)) throw new TypeError("Invalid upload handle");
	const isPrint = productKind === "print" || productKind === "print_set";
	const isDigital = productKind === "digital_download";
	if (!isPrint && !isDigital) throw new TypeError("This product does not accept private uploads");
	if (
		file.size <= 0
		|| !Number.isSafeInteger(file.size)
		|| file.size > (isPrint ? PRINT_MAX_SIZE_BYTES : DIGITAL_MAX_SIZE_BYTES)
	) throw new TypeError("The selected file is outside the upload size limit");
	if (isPrint) {
		const extension = file.type === "image/jpeg" ? /\.jpe?g$/i : file.type === "image/png" ? /\.png$/i : null;
		if (!extension || !validFilename(file, extension)) throw new TypeError("Select an encoded JPEG or PNG file");
	} else if (!ZIP_BROWSER_MIME_TYPES.has(file.type.toLowerCase()) || !validFilename(file, /\.zip$/i)) {
		throw new TypeError("Select a ZIP file");
	}
	const normalizedVersion = version?.trim() || undefined;
	if (
		normalizedVersion !== undefined
		&& (normalizedVersion.length > 64 || CONTROL_CHARACTER_PATTERN.test(normalizedVersion))
	) throw new TypeError("The ZIP version is invalid");

	const bytes = new Uint8Array(await file.arrayBuffer());
	abortIfRequested(signal);
	if (bytes.byteLength !== file.size) throw new TypeError("The selected file changed while it was read");
	if (isDigital && !hasZipSignature(bytes)) throw new TypeError("Select an encoded ZIP file");
	const hash = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
	abortIfRequested(signal);
	const sha256 = Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
	const common = {
		uploadHandle,
		productKind,
		originalFilename: file.name,
		contentType: file.type,
		sizeBytes: file.size,
		sha256,
	};
	if (isDigital) return { ...common, productKind, contentType: "application/zip", ...(normalizedVersion ? { version: normalizedVersion } : {}) };
	const dimensions = validDimensions(
		file.type === "image/png" ? readPngDimensions(bytes) : readJpegDimensions(bytes),
	);
	if (!dimensions) throw new TypeError("The encoded image dimensions are invalid");
	return {
		...common,
		productKind,
		contentType: file.type as "image/jpeg" | "image/png",
		...dimensions,
	};
}

async function readBoundedJson(response: Response) {
	if (response.headers.get("Content-Type")?.split(";", 1)[0] !== "application/json" || !response.body) return null;
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			length += value.byteLength;
			if (length > RESPONSE_MAX_BYTES) {
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
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export async function prepareCatalogPrivateEditorUpload(
	endpoint: string,
	declaration: CatalogPrivateEditorUploadPrepareRequest,
	signal?: AbortSignal,
): Promise<PreparedUpload> {
	if (!isRootedQuerylessEndpoint(endpoint)) throw new TypeError("Invalid prepare endpoint");
	const response = await fetch(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(declaration),
		credentials: "same-origin",
		redirect: "error",
		signal,
	});
	if (!response.ok) {
		await response.body?.cancel().catch(() => undefined);
		throw new TypeError("The upload could not be prepared");
	}
	const value = await readBoundedJson(response);
	if (
		!value
		|| value.status !== "upload_required"
		|| value.uploadHandle !== declaration.uploadHandle
		|| value.uploadUrl !== SOURCE_URL
		|| typeof value.uploadToken !== "string"
		|| value.uploadToken.length === 0
		|| value.uploadToken.length > 4096
		|| CONTROL_CHARACTER_PATTERN.test(value.uploadToken)
		|| !canonicalIso(value.uploadExpiresAt)
	) throw new TypeError("The prepare response was invalid");
	return { uploadUrl: value.uploadUrl, uploadToken: value.uploadToken };
}

export async function putCatalogPrivateEditorUpload(
	prepared: PreparedUpload,
	file: File,
	contentType: CatalogPrivateEditorUploadPrepareRequest["contentType"],
	signal?: AbortSignal,
) {
	abortIfRequested(signal);
	const response = await fetch(prepared.uploadUrl, {
		method: "PUT",
		headers: {
			"Content-Type": contentType,
			"X-CMS-Editor-Upload-Token": prepared.uploadToken,
		},
		body: file,
		credentials: "omit",
		redirect: "error",
		...(signal ? { signal } : {}),
	});
	await response.body?.cancel().catch(() => undefined);
	abortIfRequested(signal);
}

function positiveSafeInteger(value: unknown, maximum: number): value is number {
	return typeof value === "number"
		&& Number.isSafeInteger(value)
		&& value > 0
		&& value <= maximum;
}

function wellFormedText(value: unknown, maximum: number): value is string {
	return typeof value === "string"
		&& value.length > 0
		&& value.length <= maximum
		&& value === value.trim()
		&& !CONTROL_CHARACTER_PATTERN.test(value);
}

function canonicalIso(value: unknown) {
	if (typeof value !== "string" || value.length > 32) return false;
	const timestamp = new Date(value).valueOf();
	return Number.isSafeInteger(timestamp) && new Date(timestamp).toISOString() === value;
}

function projectAsset(value: unknown): CatalogPrivateEditorUploadAsset | null {
	if (
		!isRecord(value)
		|| !wellFormedText(value.assetId, 128)
		|| value.status !== "verified"
		|| !wellFormedText(value.originalFilename, 255)
		|| /[\\/]/.test(value.originalFilename)
		|| !positiveSafeInteger(value.sizeBytes, PRINT_MAX_SIZE_BYTES)
		|| typeof value.createdAt !== "number"
		|| !Number.isSafeInteger(value.createdAt)
		|| value.createdAt < 0
	) return null;
	if (
		value.kind === "print_source"
		&& (value.mimeType === "image/jpeg" || value.mimeType === "image/png")
		&& (value.mimeType === "image/jpeg"
			? /\.jpe?g$/i.test(value.originalFilename)
			: /\.png$/i.test(value.originalFilename))
		&& positiveSafeInteger(value.widthPixels, 100_000)
		&& positiveSafeInteger(value.heightPixels, 100_000)
		&& value.widthPixels * value.heightPixels <= 100_000_000
	) return {
		kind: value.kind,
		assetId: value.assetId,
		status: value.status,
		originalFilename: value.originalFilename,
		mimeType: value.mimeType,
		sizeBytes: value.sizeBytes,
		widthPixels: value.widthPixels,
		heightPixels: value.heightPixels,
		createdAt: value.createdAt,
	};
	if (
		value.kind === "paid_digital_file"
		&& value.mimeType === "application/zip"
		&& positiveSafeInteger(value.sizeBytes, DIGITAL_MAX_SIZE_BYTES)
		&& /\.zip$/i.test(value.originalFilename)
		&& (value.version === undefined || wellFormedText(value.version, 64))
	) return {
		kind: value.kind,
		assetId: value.assetId,
		status: value.status,
		originalFilename: value.originalFilename,
		mimeType: value.mimeType,
		sizeBytes: value.sizeBytes,
		...(typeof value.version === "string" ? { version: value.version } : {}),
		createdAt: value.createdAt,
	};
	return null;
}

function retryAfterMs(response: Response) {
	const value = response.headers.get("Retry-After");
	if (!value || !/^\d{1,10}$/.test(value)) return FALLBACK_RETRY_MS;
	const seconds = Number(value);
	return Number.isSafeInteger(seconds) && seconds >= 1
		? Math.min(seconds, RETRY_AFTER_MAX_SECONDS) * 1000
		: FALLBACK_RETRY_MS;
}

export async function completeCatalogPrivateEditorUpload(
	endpoint: string,
	uploadHandle: string,
	signal?: AbortSignal,
): Promise<CatalogPrivateEditorUploadCompletion> {
	abortIfRequested(signal);
	if (!isRootedQuerylessEndpoint(endpoint) || !UUID_V4_PATTERN.test(uploadHandle)) return { status: "failed" };
	let response: Response;
	try {
		const timeoutSignal = AbortSignal.timeout(COMPLETE_TIMEOUT_MS);
		response = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ uploadHandle } satisfies CatalogPrivateEditorUploadCompleteRequest),
			credentials: "same-origin",
			redirect: "error",
			signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
		});
	} catch {
		abortIfRequested(signal);
		return { status: "pending", retryAfterMs: FALLBACK_RETRY_MS };
	}
	const delay = retryAfterMs(response);
	if (response.status === 200) {
		const value = await readBoundedJson(response);
		abortIfRequested(signal);
		const asset = value?.status === "verified"
			? projectAsset(value.asset)
			: null;
		return asset ? { status: "verified", asset } : { status: "pending", retryAfterMs: FALLBACK_RETRY_MS };
	}
	if (response.status === 202) {
		const value = await readBoundedJson(response);
		abortIfRequested(signal);
		return value
			&& ["pending_inspection", "storage_pending", "retry_later"].includes(String(value.status))
			? { status: "pending", retryAfterMs: delay }
			: { status: "pending", retryAfterMs: FALLBACK_RETRY_MS };
	}
	await response.body?.cancel().catch(() => undefined);
	abortIfRequested(signal);
	return [400, 401, 403, 409, 410, 422].includes(response.status)
		? { status: "failed" }
		: { status: "pending", retryAfterMs: delay };
}
