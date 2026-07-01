const GALLERY_OBJECT_KINDS = new Set(["original", "preview", "thumb"]);

export interface GalleryStorageKey {
	siteUrl: string;
	galleryId: string;
	kind: "original" | "preview" | "thumb";
	filename: string;
}

export function parseGalleryStorageKeyForSession(
	r2Key: string,
	session: { siteUrl: string; galleryId: string },
): GalleryStorageKey | null {
	const prefix = `${session.siteUrl}/${session.galleryId}/`;
	if (!r2Key.startsWith(prefix)) return null;

	const rest = r2Key.slice(prefix.length);
	const [kind, filename, ...extra] = rest.split("/");
	if (extra.length > 0) return null;
	if (!GALLERY_OBJECT_KINDS.has(kind)) return null;
	if (!filename || filename === "." || filename === ".." || filename.includes("\\")) return null;

	return {
		siteUrl: session.siteUrl,
		galleryId: session.galleryId,
		kind: kind as GalleryStorageKey["kind"],
		filename,
	};
}

export function isGalleryOriginalKeyForSession(
	r2Key: string,
	session: { siteUrl: string; galleryId: string },
): boolean {
	return parseGalleryStorageKeyForSession(r2Key, session)?.kind === "original";
}
