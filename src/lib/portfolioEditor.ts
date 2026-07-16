export interface PortfolioRevisionSummary {
	revisionId: string;
	title: string | null;
	description: string | null;
	slug: string;
	placementCount: number;
	checksum: string;
	createdAt: number;
}

export interface PortfolioGalleryEditorSummary {
	galleryId: string;
	slug: string;
	portfolioOrder: number;
	isPublished: boolean;
	draft: PortfolioRevisionSummary | null;
	published: PortfolioRevisionSummary | null;
	updatedAt: number;
}

export type PortfolioGalleryStatus = "unpublished" | "draft changes" | "published";

export function portfolioGalleryStatus(
	gallery: PortfolioGalleryEditorSummary,
): PortfolioGalleryStatus {
	if (!gallery.published || !gallery.isPublished) return "unpublished";
	if (gallery.draft?.revisionId !== gallery.published.revisionId) {
		return "draft changes";
	}
	return "published";
}

export function portfolioGalleryLabel(gallery: PortfolioGalleryEditorSummary) {
	return gallery.draft?.title?.trim() || gallery.published?.title?.trim() || gallery.slug;
}

export function slugifyPortfolioTitle(value: string) {
	return value
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80)
		.replace(/-+$/g, "");
}

export function validateNewPortfolioGallery(title: string, slug: string) {
	const errors: { title?: string; slug?: string } = {};
	const cleanTitle = title.trim();
	const cleanSlug = slug.trim();
	if (!cleanTitle) errors.title = "Give this gallery a name.";
	else if (cleanTitle.length > 120) errors.title = "Use 120 characters or fewer.";
	if (!cleanSlug) errors.slug = "Choose a public URL.";
	else if (cleanSlug.length > 80) errors.slug = "Use 80 characters or fewer.";
	else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug)) {
		errors.slug = "Use lowercase letters, numbers, and single hyphens.";
	}
	return errors;
}
