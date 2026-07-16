export interface PortfolioRevisionSummary {
	revisionId: string;
	title: string | null;
	description: string | null;
	slug: string;
	placementCount: number;
	checksum: string;
	createdAt: number;
}

export interface PortfolioPlacementDraft {
	key: string;
	assetId: string;
	order?: number;
	altText?: string | null;
	decorative: boolean;
	caption?: string | null;
	focalPoint?: { x: number; y: number } | null;
}

export interface PortfolioRevisionEditorState extends PortfolioRevisionSummary {
	placements: PortfolioPlacementDraft[];
}

export interface PortfolioGalleryEditorState {
	galleryId: string;
	slug: string;
	portfolioOrder: number;
	isPublished: boolean;
	draft: PortfolioRevisionEditorState | null;
	published: PortfolioRevisionEditorState | null;
	updatedAt: number;
	publishedAt: number | null;
}

export interface PortfolioMediaAsset {
	_id: string;
	assetId: string;
	originalFilename: string;
	status: "ready" | "deleting";
	source: { contentType: string; sizeBytes: number; width: number; height: number };
	derivatives: {
		thumb: { key: string; width: number; height: number };
		card: { key: string; width: number; height: number };
	};
	createdAt: number;
}

export interface PortfolioMediaPage {
	page: PortfolioMediaAsset[];
	isDone: boolean;
	continueCursor: string;
}

export function mergePortfolioMediaAssets(
	libraryAssets: PortfolioMediaAsset[],
	placedAssets: PortfolioMediaAsset[],
) {
	return new Map(
		[...libraryAssets, ...placedAssets].map((asset) => [asset._id, asset]),
	);
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

export function portfolioMediaUrl(baseUrl: string, key: string) {
	const base = baseUrl.replace(/\/+$/, "");
	const path = key.split("/").map(encodeURIComponent).join("/");
	return `${base}/${path}`;
}

export function newPortfolioPlacement(asset: PortfolioMediaAsset): PortfolioPlacementDraft {
	return {
		key: `asset-${asset.assetId}`,
		assetId: asset._id,
		altText: "",
		decorative: false,
		caption: "",
		focalPoint: null,
	};
}

export function shouldLoadPortfolioServerRevision(input: {
	initialized: boolean;
	dirty: boolean;
	serverRevisionId: string | undefined;
	loadedServerRevisionId: string | undefined;
}) {
	if (input.initialized && input.dirty) return false;
	return !input.initialized || input.serverRevisionId !== input.loadedServerRevisionId;
}
