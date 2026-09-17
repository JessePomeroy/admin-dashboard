import { GALLERY_UPLOAD_EXTENSIONS, galleryFileExtension, type GalleryUploadPolicy } from "../galleryUploadPolicy.js";

export function trimString(
	value: string | undefined | null,
	maxLength: number,
): string | undefined {
	if (value == null) return undefined;
	return String(value).trim().slice(0, maxLength);
}

/**
 * Validate a filename for gallery uploads.
 * Rejects path traversal and excessive names; expanded types require a resolved owner policy.
 */
export function validateFilename(filename: string, policy: GalleryUploadPolicy = "media"): string {
	if (!filename || typeof filename !== "string") {
		throw new Error("Filename is required");
	}

	const trimmed = filename.trim();
	if (!trimmed) throw new Error("Filename is required");
	if (trimmed.length > 255) {
		throw new Error("Filename must be 255 characters or less");
	}
	if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
		throw new Error("Filename contains invalid characters");
	}

	const ext = galleryFileExtension(trimmed);
	if (policy !== "all-files" && !GALLERY_UPLOAD_EXTENSIONS.has(ext)) {
		throw new Error(`File type not allowed: ${ext}`);
	}

	return trimmed;
}
