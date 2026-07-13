const GALLERY_OBJECT_KINDS = new Set(["original", "preview", "thumb"]);

export interface GalleryStorageKey {
	siteUrl: string;
	galleryId: string;
	kind: "original" | "preview" | "thumb";
	filename: string;
}

/** Remove only trailing separators so one host has one storage namespace. */
export function canonicalGallerySiteUrl(siteUrl: string): string {
	return siteUrl.replace(/\/+$/, "");
}

/** Gallery IDs are one storage-key segment, never a path fragment. */
export function isGalleryStorageSegment(value: unknown): value is string {
	return typeof value === "string"
		&& value.length > 0
		&& value !== "."
		&& value !== ".."
		&& !value.includes("/")
		&& !value.includes("\\");
}

/** Parse the Worker's right-to-left gallery storage-key contract. */
export function parseGalleryStorageKey(r2Key: string): GalleryStorageKey | null {
	const segments = r2Key.split("/");
	if (segments.length < 4) return null;

	const filename = segments.at(-1);
	const kind = segments.at(-2);
	const galleryId = segments.at(-3);
	const siteUrl = segments.slice(0, -3).join("/");

	if (!siteUrl || !galleryId) return null;
	if (!kind || !GALLERY_OBJECT_KINDS.has(kind)) return null;
	if (!filename || filename === "." || filename === ".." || filename.includes("\\")) return null;

	return {
		siteUrl,
		galleryId,
		kind: kind as GalleryStorageKey["kind"],
		filename,
	};
}

export function isGalleryKeyForSite(
	r2Key: string,
	siteUrl: string,
): boolean {
	const parsed = parseGalleryStorageKey(r2Key);
	return Boolean(
		parsed
		&& isGalleryStorageSegment(parsed.galleryId)
		&& canonicalGallerySiteUrl(parsed.siteUrl) === canonicalGallerySiteUrl(siteUrl),
	);
}

export function isGalleryOriginalKeyForSite(
	r2Key: string,
	siteUrl: string,
): boolean {
	return isGalleryKeyForSite(r2Key, siteUrl)
		&& parseGalleryStorageKey(r2Key)?.kind === "original";
}

export function parseGalleryStorageKeyForSession(
	r2Key: string,
	session: { siteUrl: string; galleryId: string },
): GalleryStorageKey | null {
	const parsed = parseGalleryStorageKey(r2Key);
	if (!parsed) return null;
	if (!isGalleryStorageSegment(parsed.galleryId)) return null;
	if (canonicalGallerySiteUrl(parsed.siteUrl) !== canonicalGallerySiteUrl(session.siteUrl)) return null;
	if (parsed.galleryId !== session.galleryId) return null;
	return parsed;
}

export function isGalleryOriginalKeyForSession(
	r2Key: string,
	session: { siteUrl: string; galleryId: string },
): boolean {
	return parseGalleryStorageKeyForSession(r2Key, session)?.kind === "original";
}
