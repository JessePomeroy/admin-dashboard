export type BlogSupportingKind = "author" | "category";

export interface RichTextDocument {
	version: 1;
	blocks: Array<{
		type: "paragraph";
		key: string;
		children: Array<{
			type: "text";
			key: string;
			text: string;
			marks: [];
		}>;
	}>;
}

export interface AuthorDraft {
	kind: "author";
	name?: string;
	slug?: string;
	bio?: RichTextDocument;
}

export interface CategoryDraft {
	kind: "category";
	title?: string;
	slug?: string;
	description?: string;
}

export type BlogSupportingDraft = AuthorDraft | CategoryDraft;

export interface BlogSupportingRevisionState {
	revisionId: string;
	schemaVersion: 1;
	draft: BlogSupportingDraft;
	source: "admin" | "sanityImport" | "restore";
	createdAt: number;
}

export interface BlogSupportingEditorState {
	documentId: string;
	documentKey: string;
	kind: BlogSupportingKind;
	slug: string | null;
	rank: number;
	draft: BlogSupportingRevisionState | null;
	published: BlogSupportingRevisionState | null;
	updatedAt: number;
	publishedAt: number | null;
	archivedAt: number | null;
}

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

export function slugifyBlogTitle(value: string) {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 96);
}

export function newBlogDocumentKey(kind: BlogSupportingKind) {
	const random = Math.random().toString(36).slice(2, 8);
	return `${kind}-${Date.now().toString(36)}-${random}`;
}

export function emptyBlogSupportingDraft(kind: BlogSupportingKind): BlogSupportingDraft {
	return kind === "author"
		? { kind, name: "", slug: "", bio: emptyAuthorBio() }
		: { kind, title: "", slug: "", description: "" };
}

export function emptyAuthorBio(): RichTextDocument {
	return { version: 1, blocks: [] };
}

export function authorBioFromText(value: string): RichTextDocument | undefined {
	const text = value.trim();
	if (!text) return undefined;
	return {
		version: 1,
		blocks: [{
			type: "paragraph",
			key: "bio-paragraph",
			children: [{
				type: "text",
				key: "bio-text",
				text,
				marks: [],
			}],
		}],
	};
}

export function authorBioToText(value: RichTextDocument | undefined) {
	return (value?.blocks ?? [])
		.flatMap((block) => block.children.map((child) => child.text))
		.join("\n\n");
}

export function copyBlogSupportingDraft(
	payload: BlogSupportingDraft | undefined,
	kind: BlogSupportingKind,
): BlogSupportingDraft {
	if (!payload) return emptyBlogSupportingDraft(kind);
	if (payload.kind === "author") {
		return {
			kind: "author",
			name: payload.name ?? "",
			slug: payload.slug ?? "",
			bio: payload.bio
				? {
					version: 1,
					blocks: payload.bio.blocks.map((block) => ({
						type: "paragraph",
						key: block.key,
						children: block.children.map((child) => ({ ...child, marks: [] })),
					})),
				}
				: emptyAuthorBio(),
		};
	}
	return {
		kind: "category",
		title: payload.title ?? "",
		slug: payload.slug ?? "",
		description: payload.description ?? "",
	};
}

export function serializeBlogSupportingDraft(payload: BlogSupportingDraft) {
	if (payload.kind === "author") {
		return JSON.stringify({
			kind: "author",
			name: payload.name ?? null,
			slug: payload.slug ?? null,
			bio: payload.bio ?? null,
		});
	}
	return JSON.stringify({
		kind: "category",
		title: payload.title ?? null,
		slug: payload.slug ?? null,
		description: payload.description ?? null,
	});
}

export type BlogSupportingFieldErrors = Partial<Record<
	"name" | "title" | "slug" | "bio" | "description",
	string
>>;

export function validateBlogSupportingForPublish(
	payload: BlogSupportingDraft,
): BlogSupportingFieldErrors {
	const errors: BlogSupportingFieldErrors = {};
	const slug = payload.slug?.trim() ?? "";
	if (!slug) errors.slug = "URL name is required.";
	else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
		errors.slug = "Use lowercase words separated by hyphens.";
	}
	if (payload.kind === "author") {
		if (!payload.name?.trim()) errors.name = "Author name is required.";
		if ((payload.name?.length ?? 0) > 120) errors.name = "Author name must be 120 characters or fewer.";
		if (authorBioToText(payload.bio).length > 20_000) {
			errors.bio = "Author bio is too long.";
		}
	} else {
		if (!payload.title?.trim()) errors.title = "Category title is required.";
		if ((payload.title?.length ?? 0) > 120) errors.title = "Category title must be 120 characters or fewer.";
		if ((payload.description?.length ?? 0) > 500) {
			errors.description = "Category description must be 500 characters or fewer.";
		}
	}
	return errors;
}

export function hasBlogSupportingErrors(errors: BlogSupportingFieldErrors) {
	return Object.keys(errors).length > 0;
}
