import type { PortfolioMediaAsset } from "./portfolioEditor";

export const CMS_MEDIA_UPLOAD_MAX_SIZE_BYTES = 20_000_000;
export const CMS_MEDIA_UPLOAD_TOKEN_HEADER = "X-CMS-Media-Upload-Token";
export const CMS_MEDIA_UPLOAD_CONTENT_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;

export type CmsMediaUploadContentType = (typeof CMS_MEDIA_UPLOAD_CONTENT_TYPES)[number];
export type CmsMediaUploadStatus =
	| "pending"
	| "authorizing"
	| "uploading"
	| "processing"
	| "done"
	| "error";

export interface CmsMediaUploadCapability {
	assetId: string;
	privateObjectKey: string;
	uploadUrl: string;
	uploadToken: string;
	expiresAt: string;
}

export interface CmsMediaUploadResult {
	asset: PortfolioMediaAsset;
}

export function validateCmsMediaFile(file: Pick<File, "name" | "size" | "type">): string | null {
	if (!CMS_MEDIA_UPLOAD_CONTENT_TYPES.includes(file.type as CmsMediaUploadContentType)) {
		return "Choose a JPEG, PNG, or WebP image.";
	}
	if (!Number.isSafeInteger(file.size) || file.size < 1) {
		return "This image is empty or its size could not be read.";
	}
	if (file.size > CMS_MEDIA_UPLOAD_MAX_SIZE_BYTES) {
		return "Images must be 20 MB or smaller.";
	}
	if (
		file.name.length < 1
		|| file.name.length > 255
		|| file.name !== file.name.trim()
		|| /[\u0000-\u001f\u007f/\\]/.test(file.name)
	) return "Rename this image before uploading it.";
	return null;
}

async function responseError(response: Response, fallback: string) {
	const message = (await response.text()).trim();
	return new Error(message || fallback);
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
	if (!response.ok) throw await responseError(response, fallback);
	try {
		return await response.json() as T;
	} catch {
		throw new Error(fallback);
	}
}

export async function uploadCmsMediaFile(
	file: File,
	options: {
		endpoint: string;
		fetch?: typeof fetch;
		signal?: AbortSignal;
		onStatus?: (status: CmsMediaUploadStatus) => void;
	},
): Promise<PortfolioMediaAsset> {
	const validationError = validateCmsMediaFile(file);
	if (validationError) throw new Error(validationError);
	const request = options.fetch ?? fetch;
	const endpoint = options.endpoint.replace(/\/+$/, "");

	options.onStatus?.("authorizing");
	const capability = await readJson<CmsMediaUploadCapability>(await request(`${endpoint}/capability`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			filename: file.name,
			contentType: file.type,
			sizeBytes: file.size,
		}),
		signal: options.signal,
	}), "Could not prepare this upload.");

	options.onStatus?.("uploading");
	const uploadResponse = await request(capability.uploadUrl, {
		method: "PUT",
		headers: {
			"Content-Type": file.type,
			[CMS_MEDIA_UPLOAD_TOKEN_HEADER]: capability.uploadToken,
		},
		body: file,
		signal: options.signal,
	});
	if (!uploadResponse.ok) throw await responseError(uploadResponse, "The image upload failed.");

	options.onStatus?.("processing");
	const result = await readJson<CmsMediaUploadResult>(await request(`${endpoint}/process`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ privateObjectKey: capability.privateObjectKey }),
		signal: options.signal,
	}), "The image could not be prepared for the site.");
	options.onStatus?.("done");
	return result.asset;
}
