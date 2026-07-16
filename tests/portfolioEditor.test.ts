import { describe, expect, it } from "vitest";
import {
	portfolioGalleryLabel,
	portfolioGalleryStatus,
	slugifyPortfolioTitle,
	type PortfolioGalleryEditorSummary,
	validateNewPortfolioGallery,
} from "../src/lib/portfolioEditor";

function gallery(
	overrides: Partial<PortfolioGalleryEditorSummary> = {},
): PortfolioGalleryEditorSummary {
	return {
		galleryId: "gallery-1",
		slug: "selected-work",
		portfolioOrder: 0,
		isPublished: false,
		draft: {
			revisionId: "draft-1",
			title: "Selected work",
			description: null,
			slug: "selected-work",
			placementCount: 3,
			checksum: "draft",
			createdAt: 1,
		},
		published: null,
		updatedAt: 1,
		...overrides,
	};
}

describe("portfolio editor presentation", () => {
	it("creates bounded lowercase gallery slugs from human titles", () => {
		expect(slugifyPortfolioTitle("  Café Portraits & Motion  ")).toBe(
			"cafe-portraits-motion",
		);
		expect(slugifyPortfolioTitle("---")).toBe("");
	});

	it("validates a named gallery and its public path", () => {
		expect(validateNewPortfolioGallery("Selected work", "selected-work")).toEqual({});
		expect(validateNewPortfolioGallery("", "Selected Work")).toEqual({
			title: "Give this gallery a name.",
			slug: "Use lowercase letters, numbers, and single hyphens.",
		});
	});

	it("distinguishes unpublished, changed, and current published revisions", () => {
		const unpublished = gallery();
		expect(portfolioGalleryStatus(unpublished)).toBe("unpublished");
		expect(portfolioGalleryLabel(unpublished)).toBe("Selected work");

		const publishedRevision = { ...unpublished.draft!, revisionId: "published-1" };
		expect(portfolioGalleryStatus(gallery({ isPublished: true, published: publishedRevision }))).toBe(
			"draft changes",
		);
		expect(portfolioGalleryStatus(gallery({
			isPublished: true,
			draft: publishedRevision,
			published: publishedRevision,
		}))).toBe("published");
	});
});
