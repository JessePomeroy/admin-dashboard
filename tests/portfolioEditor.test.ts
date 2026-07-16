import { describe, expect, it } from "vitest";
import {
	portfolioGalleryLabel,
	portfolioGalleryStatus,
	mergePortfolioMediaAssets,
	portfolioMediaUrl,
	newPortfolioPlacement,
	slugifyPortfolioTitle,
	shouldLoadPortfolioServerRevision,
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

	it("builds encoded immutable media URLs and stable placement keys", () => {
		const asset = {
			_id: "convex-media-id",
			assetId: "123e4567-e89b-42d3-a456-426614174000",
			originalFilename: "portrait.jpg",
			status: "ready" as const,
			source: { contentType: "image/jpeg", sizeBytes: 10, width: 100, height: 80 },
			derivatives: {
				thumb: { key: "sites/maggie/web/image 1/thumb.webp", width: 100, height: 80 },
				card: { key: "sites/maggie/web/image 1/card.webp", width: 100, height: 80 },
			},
			createdAt: 1,
		};
		expect(portfolioMediaUrl("https://media.example/", asset.derivatives.thumb.key)).toBe(
			"https://media.example/sites/maggie/web/image%201/thumb.webp",
		);
		expect(newPortfolioPlacement(asset)).toMatchObject({
			key: `asset-${asset.assetId}`,
			assetId: "convex-media-id",
			decorative: false,
		});
	});

	it("does not let an old reactive query overwrite a just-saved draft", () => {
		expect(shouldLoadPortfolioServerRevision({
			initialized: true,
			dirty: false,
			serverRevisionId: "old-server-revision",
			loadedServerRevisionId: "old-server-revision",
		})).toBe(false);
		expect(shouldLoadPortfolioServerRevision({
			initialized: true,
			dirty: false,
			serverRevisionId: "new-server-revision",
			loadedServerRevisionId: "old-server-revision",
		})).toBe(true);
		expect(shouldLoadPortfolioServerRevision({
			initialized: true,
			dirty: true,
			serverRevisionId: "new-server-revision",
			loadedServerRevisionId: "old-server-revision",
		})).toBe(false);
	});

	it("keeps placed assets visible when they fall outside the newest library page", () => {
		const asset = {
			_id: "older-asset",
			assetId: "asset-uuid",
			originalFilename: "older.jpg",
			status: "ready" as const,
			source: { contentType: "image/jpeg", sizeBytes: 10, width: 100, height: 80 },
			derivatives: {
				thumb: { key: "older/thumb.webp", width: 100, height: 80 },
				card: { key: "older/card.webp", width: 100, height: 80 },
			},
			createdAt: 1,
		};
		const merged = mergePortfolioMediaAssets([], [asset]);
		expect(merged.get("older-asset")?.originalFilename).toBe("older.jpg");
	});
});
