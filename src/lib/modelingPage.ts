import type {
	ModelingGalleryDraft,
	ModelingImageDraft,
	ModelingPageDraftPayload,
} from "./config";
import type { PortfolioMediaAsset } from "./portfolioEditor";

export const MODELING_GALLERY_MAX = 12;
export const MODELING_CATEGORY_IMAGE_MAX = 10;

export interface ModelingPublishIssue {
	fieldId: string;
	message: string;
}

export function emptyModelingPageDraft(): ModelingPageDraftPayload {
	return { galleries: [] };
}

export function copyModelingPageDraft(
	payload: ModelingPageDraftPayload | undefined,
): ModelingPageDraftPayload {
	const legacy = payload as (ModelingPageDraftPayload & { seoImageAssetId?: string }) | undefined;
	const { seoImageAssetId: _seoImageAssetId, ...content } = legacy ?? {};
	return {
		...emptyModelingPageDraft(),
		...content,
		galleries: (payload?.galleries ?? []).map((gallery) => ({
			key: gallery.key,
			title: gallery.title,
			slug: gallery.slug,
			description: gallery.description,
			isVisible: gallery.isVisible,
			images: (gallery.images ?? []).map((image) => ({
				key: image.key,
				assetId: image.assetId,
				altText: image.altText,
			})),
		})),
	};
}

export function serializeModelingPageDraft(payload: ModelingPageDraftPayload) {
	return JSON.stringify({
		heading: payload.heading ?? null,
		intro: payload.intro ?? null,
		galleries: (payload.galleries ?? []).map((gallery) => ({
			key: gallery.key,
			title: gallery.title ?? null,
			slug: gallery.slug ?? null,
			description: gallery.description ?? null,
			isVisible: gallery.isVisible,
			images: gallery.images ?? [],
		})),
		seoDescription: payload.seoDescription ?? null,
	});
}

function key(prefix: string) {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function slugifyModelingTitle(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function newModelingGallery(): ModelingGalleryDraft {
	return {
		key: key("category"),
		title: "",
		slug: "",
		description: "",
		isVisible: false,
		images: [],
	};
}

export function newModelingImage(asset: PortfolioMediaAsset): ModelingImageDraft {
	return {
		key: key("image"),
		assetId: asset._id,
		altText: "",
	};
}

export function moveModelingItem<T>(items: T[], index: number, direction: -1 | 1) {
	const target = index + direction;
	if (target < 0 || target >= items.length) return items;
	const next = [...items];
	[next[index], next[target]] = [next[target], next[index]];
	return next;
}

export function resolveModelingPagePreviewUrl(value: unknown, currentOrigin: string) {
	if (typeof value !== "string" || !value) {
		throw new Error("The preview endpoint returned an invalid URL.");
	}
	const origin = new URL(currentOrigin).origin;
	const url = new URL(value, `${origin}/`);
	if (url.origin !== origin) {
		throw new Error("The preview endpoint returned an unsafe URL.");
	}
	return url.toString();
}

function required(
	issues: ModelingPublishIssue[],
	fieldId: string,
	value: string | undefined,
	message: string,
) {
	if (!value?.trim()) issues.push({ fieldId, message });
}

export function validateModelingPageForPublish(payload: ModelingPageDraftPayload) {
	const issues: ModelingPublishIssue[] = [];
	required(issues, "modeling-heading", payload.heading, "Add the page heading.");
	required(
		issues,
		"modeling-seo-description",
		payload.seoDescription,
		"Add a search description.",
	);
	const galleries = payload.galleries ?? [];
	if (galleries.length > MODELING_GALLERY_MAX) {
		issues.push({
			fieldId: "modeling-categories-heading",
			message: `Use no more than ${MODELING_GALLERY_MAX} categories.`,
		});
	}
	const visible = galleries.filter((gallery) => gallery.isVisible);
	if (visible.length === 0) {
		issues.push({
			fieldId: "modeling-categories-heading",
			message: "Make at least one complete category visible.",
		});
	}
	const slugs = new Set<string>();
	for (const [index, gallery] of galleries.entries()) {
		const images = gallery.images ?? [];
		if (images.length > MODELING_CATEGORY_IMAGE_MAX) {
			issues.push({
				fieldId: `modeling-category-${gallery.key}-images`,
				message: `Category ${index + 1} cannot exceed ${MODELING_CATEGORY_IMAGE_MAX} images.`,
			});
		}
		if (!gallery.isVisible) continue;
		required(
			issues,
			`modeling-category-${gallery.key}-title`,
			gallery.title,
			`Visible category ${index + 1} needs a title.`,
		);
		const slug = gallery.slug?.trim() ?? "";
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
			issues.push({
				fieldId: `modeling-category-${gallery.key}-slug`,
				message: `Visible category ${index + 1} needs a lowercase hyphenated URL name.`,
			});
		} else if (slugs.has(slug)) {
			issues.push({
				fieldId: `modeling-category-${gallery.key}-slug`,
				message: `Visible category ${index + 1} uses a duplicate URL name.`,
			});
		} else {
			slugs.add(slug);
		}
		if (images.length === 0) {
			issues.push({
				fieldId: `modeling-category-${gallery.key}-images`,
				message: `Visible category ${index + 1} needs at least one image.`,
			});
		}
		for (const [imageIndex, image] of images.entries()) {
			if (!image.altText?.trim()) {
				issues.push({
					fieldId: `modeling-image-${image.key}-alt`,
					message: `Category ${index + 1}, image ${imageIndex + 1} needs alt text.`,
				});
			}
		}
	}
	return issues;
}
