import { describe, expect, it } from "vitest";
import {
	copyModelingPageDraft,
	moveModelingItem,
	newModelingGallery,
	newModelingImage,
	serializeModelingPageDraft,
	slugifyModelingTitle,
	validateModelingPageForPublish,
} from "../src/lib/modelingPage";

const asset = {
	_id: "media-1",
	assetId: "external-1",
	originalFilename: "portrait.jpg",
	status: "ready" as const,
	source: { contentType: "image/jpeg", sizeBytes: 100, width: 800, height: 600 },
	derivatives: {
		thumb: { key: "thumb.webp", width: 320, height: 240 },
		card: { key: "card.webp", width: 800, height: 600 },
	},
	createdAt: 1,
};

const complete = {
	heading: "Modeling & acting",
	intro: "Selected modeling and portrait work.",
	galleries: [{
		key: "fashion",
		title: "Fashion Editorial",
		slug: "fashion-editorial",
		isVisible: true,
		images: [{
			key: "image-1",
			assetId: "media-1",
			altText: "Margaret in an editorial portrait.",
			decorative: false,
		}],
	}],
	seoDescription: "Modeling, acting, and portrait work by Margaret Helena.",
};

describe("Modeling editor helpers", () => {
	it("deep-copies ordered categories and serializes them stably", () => {
		const copied = copyModelingPageDraft(complete);
		copied.galleries?.[0].images?.push(newModelingImage(asset));
		expect(complete.galleries[0].images).toHaveLength(1);
		expect(serializeModelingPageDraft(complete)).toBe(
			serializeModelingPageDraft({ intro: complete.intro, ...complete }),
		);
	});

	it("creates hidden categories and accessible image drafts", () => {
		expect(newModelingGallery()).toMatchObject({ isVisible: false, images: [] });
		expect(newModelingImage(asset)).toMatchObject({
			assetId: "media-1",
			decorative: false,
		});
		expect(slugifyModelingTitle(" Comp Card Digitals ")).toBe("comp-card-digitals");
	});

	it("matches visible-category, slug, image, and accessibility publication gates", () => {
		expect(validateModelingPageForPublish(complete)).toEqual([]);
		expect(validateModelingPageForPublish({
			...complete,
			galleries: [{
				...complete.galleries[0],
				slug: "Bad Slug",
				images: [{ ...complete.galleries[0].images[0], altText: "" }],
			}],
			seoDescription: "",
		})).toEqual(expect.arrayContaining([
			expect.objectContaining({ fieldId: "modeling-seo-description" }),
			expect.objectContaining({ fieldId: "modeling-category-fashion-slug" }),
			expect.objectContaining({ fieldId: "modeling-image-image-1-alt" }),
		]));
		expect(validateModelingPageForPublish({
			...complete,
			galleries: [{ key: "later", isVisible: false }],
		})).toEqual(expect.arrayContaining([
			expect.objectContaining({ fieldId: "modeling-categories-heading" }),
		]));
	});

	it("preserves bounded category and image ordering", () => {
		expect(moveModelingItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
		expect(moveModelingItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
	});
});
