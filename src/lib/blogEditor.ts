export type BlogSupportingKind = "author" | "category";

export interface BlogSupportingEditorSummary {
	documentId: string;
	documentKey: string;
	kind: BlogSupportingKind;
	slug: string | null;
	rank: number;
	label: string;
	draftRevisionId: string | null;
	publishedRevisionId: string | null;
	updatedAt: number;
	archivedAt: number | null;
}

export interface PostEditorRevisionHeader {
	revisionId: string;
	title: string;
	format: string | null;
	presentation: string | null;
	displayPublishedAt: number | null;
}

export interface PostEditorSummary {
	documentId: string;
	documentKey: string;
	kind: "post";
	slug: string | null;
	rank: number;
	draft: PostEditorRevisionHeader | null;
	published: PostEditorRevisionHeader | null;
	updatedAt: number;
	archivedAt: number | null;
}

export function blogDocumentStatus(
	document:
		| BlogSupportingEditorSummary
		| PostEditorSummary,
): "draft" | "published" | "changed" {
	if ("publishedRevisionId" in document) {
		if (!document.publishedRevisionId) return "draft";
		if (document.draftRevisionId && document.draftRevisionId !== document.publishedRevisionId) {
			return "changed";
		}
		return "published";
	}
	if (!document.published) return "draft";
	if (document.draft && document.draft.revisionId !== document.published.revisionId) {
		return "changed";
	}
	return "published";
}

export function blogDocumentLabel(
	document: BlogSupportingEditorSummary | PostEditorSummary,
) {
	if ("label" in document) return document.label || "untitled";
	return document.draft?.title || document.published?.title || "untitled";
}
