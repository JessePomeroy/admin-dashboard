import { isValidGalleryUploadSize } from "../../galleryUploadSize";

const PRESIGN_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 10 * 60_000;
const PROCESS_TIMEOUT_MS = 60_000;
const UPLOAD_CAPABILITY_HEADER = "X-Gallery-Upload-Token";
const MULTIPART_PART_BYTES = 20 * 1024 * 1024;
const UPLOAD_RETRY_DELAYS_MS = [250, 500] as const;

export interface GalleryUploadSession {
	token: string;
	expiresAt: number;
}

export interface GalleryPresignResult {
	r2Key: string;
	uploadUrl?: string;
	uploadToken?: string;
}

export interface GalleryStoragePort {
	startUploadSession(input: {
		siteUrl: string;
		galleryId: string;
		signal?: AbortSignal;
	}): Promise<GalleryUploadSession>;
	presign(input: {
		siteUrl: string;
		galleryId: string;
		filename: string;
		contentType: string;
		sizeBytes?: number;
		uploadSessionToken: string;
		signal?: AbortSignal;
	}): Promise<GalleryPresignResult>;
	uploadFile(input: {
		file: Blob;
		r2Key: string;
		uploadUrl?: string;
		uploadToken?: string;
		contentType: string;
		uploadSessionToken: string;
		signal?: AbortSignal;
	}): Promise<void>;
	process(input: {
		r2Key: string;
		uploadSessionToken: string;
		signal?: AbortSignal;
	}): Promise<void>;
	delete(input: {
		r2Key: string;
		uploadSessionToken?: string | null;
		signal?: AbortSignal;
	}): Promise<void>;
}

type GalleryFetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

interface GalleryStoragePortOptions {
	fetch?: GalleryFetch;
	galleryWorkerUrl?: string;
}

async function fetchWithTimeout(
	fetcher: GalleryFetch,
	input: RequestInfo | URL,
	init: RequestInit,
	timeoutMs: number,
	externalSignal?: AbortSignal,
): Promise<Response> {
	const ctrl = new AbortController();
	let abortReason: "timeout" | "canceled" | undefined;
	const abort = (reason: "timeout" | "canceled") => {
		abortReason ??= reason;
		ctrl.abort();
	};
	const timer = setTimeout(() => abort("timeout"), timeoutMs);
	if (externalSignal?.aborted) abort("canceled");
	const handleExternalAbort = () => abort("canceled");
	externalSignal?.addEventListener("abort", handleExternalAbort, { once: true });

	try {
		return await fetcher(input, { ...init, signal: ctrl.signal });
	} catch (err) {
		if (ctrl.signal.aborted && abortReason === "timeout") {
			throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
		}
		if (ctrl.signal.aborted && abortReason === "canceled") {
			throw new Error("Request canceled");
		}
		throw err;
	} finally {
		clearTimeout(timer);
		externalSignal?.removeEventListener("abort", handleExternalAbort);
	}
}

async function parseErrorResponse(res: Response, fallback: string): Promise<Error> {
	const body = (await res.text()).trim();
	if (res.status === 409 && body.toLowerCase().includes("already exists")) return new Error("File already exists");
	return new Error(body ? `${fallback}: ${res.status} ${body}` : `${fallback}: ${res.status}`);
}

async function parseJsonObject(res: Response, fallback: string): Promise<Record<string, unknown>> {
	if (!res.ok) throw await parseErrorResponse(res, fallback);
	const data = await res.json();
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		throw new Error(`${fallback}: response was invalid`);
	}
	return data as Record<string, unknown>;
}

function directEndpoint(uploadUrl: string, galleryWorkerUrl?: string): string | null {
	if (!galleryWorkerUrl) return null;
	try {
		const worker = new URL(galleryWorkerUrl);
		const endpoint = new URL(uploadUrl, worker);
		return endpoint.origin === worker.origin ? endpoint.toString() : null;
	} catch {
		return null;
	}
}

function multipartEndpoint(endpoint: string, params: Record<string, string | number>): string {
	const url = new URL(endpoint);
	url.pathname = "/upload/multipart";
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
	return url.toString();
}

function isV2UploadUrl(value: unknown): value is string {
	if (typeof value !== "string" || !value) return false;
	try {
		return !new URL(value, "https://gallery-upload.invalid").searchParams.has("token");
	} catch {
		return false;
	}
}

async function retryUpload<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
	for (const delay of [0, ...UPLOAD_RETRY_DELAYS_MS]) {
		if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
		try {
			return await operation();
		} catch (error) {
			if (signal?.aborted || delay === UPLOAD_RETRY_DELAYS_MS.at(-1)) throw error;
		}
	}
	throw new Error("Upload retry exhausted");
}

export function createGalleryStoragePort(
	options: GalleryStoragePortOptions = {},
): GalleryStoragePort {
	const fetcher = options.fetch ?? fetch;

	return {
		async startUploadSession({ siteUrl, galleryId, signal }) {
			const res = await fetchWithTimeout(
				fetcher,
				"/api/admin/galleries/upload-session",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ siteUrl, galleryId }),
				},
				PRESIGN_TIMEOUT_MS,
				signal,
			);
			const data = await parseJsonObject(res, "Failed to start upload session");
			if (typeof data.uploadSessionToken !== "string" || typeof data.expiresAt !== "number") {
				throw new Error("Upload session response was invalid");
			}
			return { token: data.uploadSessionToken, expiresAt: data.expiresAt };
		},

		async presign({
			siteUrl,
			galleryId,
			filename,
			contentType,
			sizeBytes,
			uploadSessionToken,
			signal,
		}) {
			if (!isValidGalleryUploadSize(sizeBytes)) {
				throw new Error("A positive upload size is required");
			}
			const res = await fetchWithTimeout(
				fetcher,
				"/api/admin/galleries/presign",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						siteUrl,
						galleryId,
						filename,
						contentType,
						sizeBytes,
						uploadSessionToken,
					}),
				},
				PRESIGN_TIMEOUT_MS,
				signal,
			);
			const data = await parseJsonObject(res, "Failed to get upload URL");
			if (
				typeof data.r2Key !== "string"
				|| typeof data.uploadUrl !== "string"
				|| typeof data.uploadToken !== "string"
				|| !data.uploadToken
				|| !isV2UploadUrl(data.uploadUrl)
			) {
				throw new Error("Presign response was invalid");
			}
			return {
				r2Key: data.r2Key,
				uploadUrl: data.uploadUrl,
				uploadToken: data.uploadToken,
			};
		},

		async uploadFile({
			file,
			r2Key,
			uploadUrl,
			uploadToken,
			contentType,
			signal,
		}) {
			if (!uploadToken) throw new Error("Upload capability is required");
			const endpoint = uploadUrl ? directEndpoint(uploadUrl, options.galleryWorkerUrl) : null;
			if (!endpoint) throw new Error("Direct upload URL is required");
			if (file.size > MULTIPART_PART_BYTES) {
				const partSize = Math.max(
					MULTIPART_PART_BYTES,
					Math.ceil(file.size / 10_000),
				);
				const common = { partSize };
				const headers = { [UPLOAD_CAPABILITY_HEADER]: uploadToken };
				const created = await parseJsonObject(await fetchWithTimeout(
					fetcher,
					multipartEndpoint(endpoint, { ...common, action: "create" }),
					{ method: "POST", headers },
					PROCESS_TIMEOUT_MS,
					signal,
				), "Failed to start multipart upload");
				if (typeof created.uploadId !== "string") {
					throw new Error("Multipart upload response was invalid");
				}
				const session = { ...common, uploadId: created.uploadId };
				try {
					const parts = [];
					for (let offset = 0, partNumber = 1; offset < file.size; offset += partSize, partNumber++) {
						const part = await retryUpload(async () => parseJsonObject(await fetchWithTimeout(
							fetcher,
							multipartEndpoint(endpoint, { ...session, action: "part", partNumber }),
							{
								method: "PUT",
								headers: { ...headers, "Content-Type": contentType },
								body: file.slice(offset, offset + partSize),
							},
							UPLOAD_TIMEOUT_MS,
							signal,
						), "Multipart upload failed"), signal);
						parts.push(part);
					}
					const response = await fetchWithTimeout(
						fetcher,
						multipartEndpoint(endpoint, { ...session, action: "complete" }),
						{
							method: "POST",
							headers: { ...headers, "Content-Type": "application/json" },
							body: JSON.stringify({ parts }),
						},
						UPLOAD_TIMEOUT_MS,
						signal,
					);
					if (!response.ok) throw await parseErrorResponse(response, "Upload failed");
					return;
				} catch (error) {
					await fetchWithTimeout(
						fetcher,
						multipartEndpoint(endpoint, { ...session, action: "abort" }),
						{ method: "DELETE", headers },
						PROCESS_TIMEOUT_MS,
					).catch(() => undefined);
					throw error;
				}
			}
			const requestInit = {
				method: "PUT",
				headers: {
					"Content-Type": contentType,
					[UPLOAD_CAPABILITY_HEADER]: uploadToken,
				},
				body: file,
			};
			const response = await fetchWithTimeout(
				fetcher,
				endpoint,
				requestInit,
				UPLOAD_TIMEOUT_MS,
				signal,
			);
			if (!response.ok) throw await parseErrorResponse(response, "Upload failed");
		},

		async process({ r2Key, uploadSessionToken, signal }) {
			const res = await fetchWithTimeout(
				fetcher,
				"/api/admin/galleries/process",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ r2Key, uploadSessionToken }),
				},
				PROCESS_TIMEOUT_MS,
				signal,
			);
			if (!res.ok) throw await parseErrorResponse(res, "Processing failed");
		},

		async delete({ r2Key, uploadSessionToken, signal }) {
			const res = await fetchWithTimeout(
				fetcher,
				"/api/admin/galleries/delete",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ r2Key, uploadSessionToken }),
				},
				PROCESS_TIMEOUT_MS,
				signal,
			);
			if (!res.ok) throw await parseErrorResponse(res, "Delete failed");
		},
	};
}
