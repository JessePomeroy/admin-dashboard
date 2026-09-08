import { emptyPostDraft, type PostEditorState } from "../../../src/lib/blogEditor";
import type { PortfolioMediaAsset, PortfolioMediaPage } from "../../../src/lib/portfolioEditor";

export function mediaAsset(id: string, status: PortfolioMediaAsset["status"] = "ready"): PortfolioMediaAsset {
	return {
		_id: id, assetId: id, originalFilename: `${id}.jpg`, status, createdAt: 1,
		source: { contentType: "image/jpeg", sizeBytes: 100, width: 1200, height: 800 },
		derivatives: {
			thumb: { key: `${id}/thumb.jpg`, width: 160, height: 107 },
			card: { key: `${id}/card.jpg`, width: 800, height: 533 },
		},
	};
}

export function mediaPage(assets: PortfolioMediaAsset[], continueCursor = ""): PortfolioMediaPage {
	return { page: assets, continueCursor, isDone: !continueCursor };
}

export function postEditorState(): PostEditorState {
	return {
		documentId: "post-1", documentKey: "post-1", kind: "post", slug: "post-one", rank: 0,
		draft: {
			revisionId: "revision-1", schemaVersion: 1, source: "admin", createdAt: 1,
			draft: {
				...emptyPostDraft(), title: "Post one", slug: "post-one",
				body: {
					version: 1,
					blocks: [
						{ type: "paragraph", key: "intro", children: [{ type: "text", key: "intro-text", text: "Keep this draft.", marks: [] }] },
						{ type: "image", key: "linked-image", assetId: "attached", altText: "Original alt", caption: "Original caption" },
					],
				},
			},
		},
		published: null, updatedAt: 1, publishedAt: null, archivedAt: null,
	};
}
