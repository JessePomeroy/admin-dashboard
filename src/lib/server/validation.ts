import { GALLERY_UPLOAD_EXTENSIONS, galleryFileExtension } from "../galleryUploadPolicy.js";

export function trimString(
	value: string | undefined | null,
	maxLength: number,
): string | undefined {
	if (value == null) return undefined;
	return String(value).trim().slice(0, maxLength);
}

/**
 * Validate a filename for gallery uploads.
 * Rejects path traversal, excessively long names, and non-image extensions.
 */
export function validateFilename(filename: string): string {
	if (!filename || typeof filename !== "string") {
		throw new Error("Filename is required");
	}

	const trimmed = filename.trim();
	if (trimmed.length > 255) {
		throw new Error("Filename must be 255 characters or less");
	}
	if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
		throw new Error("Filename contains invalid characters");
	}

	const ext = galleryFileExtension(trimmed);
	if (!GALLERY_UPLOAD_EXTENSIONS.has(ext)) {
		throw new Error(`File type not allowed: ${ext}`);
	}

	return trimmed;
}
