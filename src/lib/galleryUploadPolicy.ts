const BROWSER_PREVIEW_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;

const TIFF_EXTENSIONS = [".tif", ".tiff"] as const;

const VIDEO_CONTENT_TYPES = {
	".avi": "video/x-msvideo",
	".m2ts": "video/mp2t",
	".m4v": "video/mp4",
	".mkv": "video/x-matroska",
	".mov": "video/quicktime",
	".mp4": "video/mp4",
	".mts": "video/mp2t",
	".webm": "video/webm",
} as const;

const RAW_EXTENSIONS = [
	".3fr",
	".ari",
	".arw",
	".cr2",
	".cr3",
	".dcr",
	".dng",
	".erf",
	".fff",
	".iiq",
	".kdc",
	".mef",
	".mos",
	".mrw",
	".nef",
	".orf",
	".pef",
	".raf",
	".raw",
	".rwl",
	".rw2",
	".srw",
	".x3f",
] as const;

export const GALLERY_BROWSER_PREVIEW_EXTENSIONS = new Set<string>(
	BROWSER_PREVIEW_EXTENSIONS,
);
export const GALLERY_UPLOAD_EXTENSIONS = new Set<string>([
	...BROWSER_PREVIEW_EXTENSIONS,
	...TIFF_EXTENSIONS,
	...RAW_EXTENSIONS,
	...Object.keys(VIDEO_CONTENT_TYPES),
]);

const GALLERY_UPLOAD_MIME_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/tiff",
	"image/x-tiff",
	"image/x-adobe-dng",
	"image/x-canon-cr2",
	"image/x-canon-cr3",
	"image/x-fuji-raf",
	"image/x-nikon-nef",
	"image/x-panasonic-raw",
	"image/x-pentax-pef",
	"image/x-sony-arw",
	...Object.values(VIDEO_CONTENT_TYPES),
	"application/octet-stream",
]);

export const GALLERY_UPLOAD_ACCEPT = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/tiff",
	...GALLERY_UPLOAD_EXTENSIONS,
].join(",");

export function galleryFileExtension(filename: string): string {
	const cleanName = filename.trim().toLowerCase();
	const dotIndex = cleanName.lastIndexOf(".");
	return dotIndex >= 0 ? cleanName.slice(dotIndex) : "";
}

export function isAllowedGalleryFileName(filename: string): boolean {
	return GALLERY_UPLOAD_EXTENSIONS.has(galleryFileExtension(filename));
}

export function isBrowserPreviewableGalleryFile(filename: string): boolean {
	return GALLERY_BROWSER_PREVIEW_EXTENSIONS.has(galleryFileExtension(filename));
}

export function isAllowedGalleryFile(file: File): boolean {
	if (file.name.toLowerCase().startsWith("._")) return false;
	if (isAllowedGalleryFileName(file.name)) return true;
	return file.type ? GALLERY_UPLOAD_MIME_TYPES.has(file.type) : false;
}

export function galleryFileContentType(file: File): string {
	if (file.type && GALLERY_UPLOAD_MIME_TYPES.has(file.type)) return file.type;
	const extension = galleryFileExtension(file.name);
	if (extension === ".dng") return "image/x-adobe-dng";
	if (extension === ".raf") return "image/x-fuji-raf";
	if (extension in VIDEO_CONTENT_TYPES) {
		return VIDEO_CONTENT_TYPES[extension as keyof typeof VIDEO_CONTENT_TYPES];
	}
	return "application/octet-stream";
}
