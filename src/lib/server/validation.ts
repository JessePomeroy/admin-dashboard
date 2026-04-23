const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): boolean {
	return EMAIL_REGEX.test(email);
}

export function trimString(
	value: string | undefined | null,
	maxLength: number,
): string | undefined {
	if (value == null) return undefined;
	return String(value).trim().slice(0, maxLength);
}

export function requireString(
	value: unknown,
	fieldName: string,
	maxLength = 255,
): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`${fieldName} is required`);
	}
	return value.trim().slice(0, maxLength);
}

/**
 * Gallery image extension allowlist. Must stay in sync with the client-side
 * `ALLOWED_TYPES` in GalleryUploader.svelte — the UI and processing pipeline
 * only handle these formats. Keeping both lists identical prevents a caller
 * from smuggling unsupported formats (e.g. gif, heic, avif) past the UI and
 * into R2, where downstream processing would silently fail.
 */
export const ALLOWED_IMAGE_EXTENSIONS = new Set([
	".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif",
]);

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

	const ext = trimmed.slice(trimmed.lastIndexOf(".")).toLowerCase();
	if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
		throw new Error(`File type not allowed: ${ext}`);
	}

	return trimmed;
}

export function validatePositiveNumber(
	value: unknown,
	fieldName: string,
): number {
	const num = Number(value);
	if (Number.isNaN(num) || num < 0) {
		throw new Error(`${fieldName} must be a positive number`);
	}
	return num;
}
