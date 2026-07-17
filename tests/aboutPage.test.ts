import { describe, expect, it } from "vitest";
import {
	copyAboutPageDraft,
	moveAboutItem,
	newAboutPortrait,
	resolveAboutPagePreviewUrl,
	serializeAboutPageDraft,
	validateAboutPageForPublish,
} from "../src/lib/aboutPage";

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
	heading: "About",
	displayName: "Margaret Helena",
	introduction: "Photographer, director, model, and musician.",
	portraits: [{
		key: "portrait-1",
		assetId: "media-1",
		altText: "Margaret standing in soft window light.",
		decorative: false,
	}],
	sections: [{ key: "section-1", title: "Disciplines", items: ["Photography"] }],
	highlights: [{ key: "highlight-1", label: "Based in", value: "Michigan" }],
	seoDescription: "About Margaret Helena and her multidisciplinary photographic practice.",
};

describe("About editor helpers", () => {
	it("deep-copies nested ordered fields and serializes them stably", () => {
		const copied = copyAboutPageDraft(complete);
		copied.sections?.[0].items.push("Direction");
		expect(complete.sections[0].items).toEqual(["Photography"]);
		expect(serializeAboutPageDraft(complete)).toBe(
			serializeAboutPageDraft({ highlights: complete.highlights, ...complete }),
		);
	});

	it("strips retired focal-point data from an existing draft", () => {
		const legacy = {
			...complete,
			portraits: [{ ...complete.portraits[0], focalPoint: { x: 0.25, y: 0.75 } }],
		};
		expect(copyAboutPageDraft(legacy).portraits?.[0]).not.toHaveProperty("focalPoint");
	});

	it("matches the publication boundary for content, portraits, and accessibility", () => {
		expect(validateAboutPageForPublish(complete)).toEqual([]);
		expect(validateAboutPageForPublish({
			...complete,
			introduction: "",
			sections: [],
			portraits: [{ ...complete.portraits[0], altText: "" }],
			seoDescription: "",
		})).toEqual(expect.arrayContaining([
			expect.objectContaining({ fieldId: "about-seo-description" }),
			expect.objectContaining({ fieldId: "about-portrait-portrait-1-alt" }),
			expect.objectContaining({ fieldId: "about-introduction" }),
		]));
	});

	it("creates accessible portrait drafts and preserves bounded ordering", () => {
		const portrait = newAboutPortrait(asset);
		expect(portrait).toMatchObject({
			assetId: "media-1",
			decorative: false,
		});
		expect(moveAboutItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
		expect(moveAboutItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
	});

	it("accepts only same-origin About preview URLs", () => {
		expect(resolveAboutPagePreviewUrl(
			"/preview/about-page",
			"https://tenant.example/admin/editor/pages/about",
		)).toBe("https://tenant.example/preview/about-page");
		expect(() => resolveAboutPagePreviewUrl(
			"https://attacker.example/collect",
			"https://tenant.example",
		)).toThrow(/unsafe/);
		expect(() => resolveAboutPagePreviewUrl(null, "https://tenant.example")).toThrow(/invalid/);
	});
});
