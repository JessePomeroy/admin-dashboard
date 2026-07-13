import { GALLERY_MAX_FILE_SIZE_BYTES } from "./galleryUploadPolicy.js";

export function isValidGalleryUploadSize(value: unknown): value is number {
	return typeof value === "number"
		&& Number.isSafeInteger(value)
		&& value > 0
		&& value <= GALLERY_MAX_FILE_SIZE_BYTES;
}
