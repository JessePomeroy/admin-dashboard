export type BlogSupportingKind = "author" | "category";
export type BlogDocumentKind = BlogSupportingKind | "post";

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

export type PostFormat = "essay" | "projectStory" | "technicalNote";
export type PostPresentation =
	| "standard"
	| "behindTheScenes"
	| "caseStudy"
	| "clientStory"
	| "technical";

export interface PostTechnicalItem {
	key: string;
	label?: string;
	details?: string;
}

export interface PostCategoryReferenceDraft {
	key: string;
	documentId: string;
}

export interface PostMainImageDraft {
	key: string;
	assetId: string;
	altText?: string;
	caption?: string;
}

export interface PostRichTextDocument {
	version: 1;
	blocks: Array<Record<string, unknown>>;
}

export interface PostDraft {
	kind: "post";
	title?: string;
	slug?: string;
	format?: PostFormat;
	presentation?: PostPresentation;
	displayPublishedAt?: number;
	summary?: string;
	seoTitle?: string;
	seoDescription?: string;
	brief?: string;
	approach?: string;
	outcome?: string;
	credits?: string;
	equipment: PostTechnicalItem[];
	materials: PostTechnicalItem[];
	authorDocumentId?: string;
	categories: PostCategoryReferenceDraft[];
	mainImage?: PostMainImageDraft;
	body: PostRichTextDocument;
}

export interface PostEditorRevisionState {
	revisionId: string;
	schemaVersion: 1;
	draft: PostDraft;
	source: "admin" | "sanityImport" | "restore";
	createdAt: number;
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

export interface PostEditorState {
	documentId: string;
	documentKey: string;
	kind: "post";
	slug: string | null;
	rank: number;
	draft: PostEditorRevisionState | null;
	published: PostEditorRevisionState | null;
	updatedAt: number;
	publishedAt: number | null;
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

export function newBlogDocumentKey(kind: BlogDocumentKind) {
	const random = Math.random().toString(36).slice(2, 8);
	return `${kind}-${Date.now().toString(36)}-${random}`;
}

export function emptyPostBody(): PostRichTextDocument {
	return { version: 1, blocks: [] };
}

export function postBodyToPlainText(body: PostRichTextDocument | undefined) {
	return (body?.blocks ?? [])
		.map((block) => {
			if (
				typeof block === "object"
				&& block
				&& "children" in block
				&& Array.isArray(block.children)
			) {
				return block.children
					.map((child) =>
						typeof child === "object"
						&& child
						&& "text" in child
						&& typeof child.text === "string"
							? child.text
							: ""
					)
					.join("");
			}
			return "";
		})
		.filter(Boolean)
		.join("\n\n");
}

export function postBodyFromPlainText(value: string): PostRichTextDocument {
	const paragraphs = value
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);
	return {
		version: 1,
		blocks: paragraphs.map((paragraph, index) => ({
			type: "paragraph",
			key: `paragraph-${index + 1}`,
			children: [{
				type: "text",
				key: `paragraph-${index + 1}-text`,
				text: paragraph,
				marks: [],
			}],
		})),
	};
}

export function emptyPostDraft(): PostDraft {
	return {
		kind: "post",
		title: "",
		slug: "",
		format: "essay",
		presentation: "standard",
		displayPublishedAt: Date.now(),
		summary: "",
		seoTitle: "",
		seoDescription: "",
		brief: "",
		approach: "",
		outcome: "",
		credits: "",
		equipment: [],
		materials: [],
		categories: [],
		body: emptyPostBody(),
	};
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

function copyPostTechnicalItems(items: PostTechnicalItem[] | undefined) {
	return (items ?? []).map((item) => ({
		key: item.key,
		label: item.label ?? "",
		details: item.details ?? "",
	}));
}

function copyPostCategories(items: PostCategoryReferenceDraft[] | undefined) {
	return (items ?? []).map((item) => ({
		key: item.key,
		documentId: item.documentId,
	}));
}

function copyPostBody(body: PostRichTextDocument | undefined): PostRichTextDocument {
	if (!body) return emptyPostBody();
	return {
		version: 1,
		blocks: body.blocks.map((block) => ({ ...block })),
	};
}

export function copyPostDraft(payload: PostDraft | undefined): PostDraft {
	if (!payload) return emptyPostDraft();
	return {
		kind: "post",
		title: payload.title ?? "",
		slug: payload.slug ?? "",
		format: payload.format ?? "essay",
		presentation: payload.presentation ?? "standard",
		displayPublishedAt: payload.displayPublishedAt ?? Date.now(),
		summary: payload.summary ?? "",
		seoTitle: payload.seoTitle ?? "",
		seoDescription: payload.seoDescription ?? "",
		brief: payload.brief ?? "",
		approach: payload.approach ?? "",
		outcome: payload.outcome ?? "",
		credits: payload.credits ?? "",
		equipment: copyPostTechnicalItems(payload.equipment),
		materials: copyPostTechnicalItems(payload.materials),
		authorDocumentId: payload.authorDocumentId,
		categories: copyPostCategories(payload.categories),
		mainImage: payload.mainImage ? { ...payload.mainImage } : undefined,
		body: copyPostBody(payload.body),
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

export function serializePostDraft(payload: PostDraft) {
	return JSON.stringify({
		kind: "post",
		title: payload.title ?? null,
		slug: payload.slug ?? null,
		format: payload.format ?? null,
		presentation: payload.presentation ?? null,
		displayPublishedAt: payload.displayPublishedAt ?? null,
		summary: payload.summary ?? null,
		seoTitle: payload.seoTitle ?? null,
		seoDescription: payload.seoDescription ?? null,
		brief: payload.brief ?? null,
		approach: payload.approach ?? null,
		outcome: payload.outcome ?? null,
		credits: payload.credits ?? null,
		equipment: copyPostTechnicalItems(payload.equipment),
		materials: copyPostTechnicalItems(payload.materials),
		authorDocumentId: payload.authorDocumentId ?? null,
		categories: copyPostCategories(payload.categories),
		mainImage: payload.mainImage ?? null,
		body: payload.body ?? emptyPostBody(),
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

export type PostFieldErrors = Partial<Record<
	| "title"
	| "slug"
	| "format"
	| "presentation"
	| "displayPublishedAt"
	| "summary"
	| "seoTitle"
	| "seoDescription"
	| "authorDocumentId"
	| "body",
	string
>>;

const compatiblePostPresentations: Record<PostFormat, PostPresentation[]> = {
	essay: ["standard", "behindTheScenes"],
	projectStory: ["caseStudy", "clientStory"],
	technicalNote: ["technical"],
};

export function presentationMatchesFormat(
	format: PostFormat | undefined,
	presentation: PostPresentation | undefined,
) {
	if (!format || !presentation) return false;
	return compatiblePostPresentations[format]?.includes(presentation) ?? false;
}

export function defaultPresentationForFormat(format: PostFormat): PostPresentation {
	return compatiblePostPresentations[format][0];
}

export function validatePostMetadataForPublish(payload: PostDraft): PostFieldErrors {
	const errors: PostFieldErrors = {};
	const slug = payload.slug?.trim() ?? "";
	if (!payload.title?.trim()) errors.title = "Post title is required.";
	else if (payload.title.length > 200) errors.title = "Post title must be 200 characters or fewer.";
	if (!slug) errors.slug = "URL name is required.";
	else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
		errors.slug = "Use lowercase words separated by hyphens.";
	}
	if (!payload.format) errors.format = "Choose a Post format.";
	if (!payload.presentation) errors.presentation = "Choose a presentation.";
	else if (!presentationMatchesFormat(payload.format, payload.presentation)) {
		errors.presentation = "Presentation must match the selected format.";
	}
	if (
		payload.displayPublishedAt === undefined
		|| !Number.isSafeInteger(payload.displayPublishedAt)
		|| payload.displayPublishedAt < 0
	) errors.displayPublishedAt = "Choose a valid public date.";
	if (!payload.summary?.trim()) errors.summary = "Post summary is required.";
	else if (payload.summary.length > 320) errors.summary = "Post summary must be 320 characters or fewer.";
	if ((payload.seoTitle?.length ?? 0) > 200) errors.seoTitle = "SEO title must be 200 characters or fewer.";
	if ((payload.seoDescription?.length ?? 0) > 320) {
		errors.seoDescription = "SEO description must be 320 characters or fewer.";
	}
	if (!payload.authorDocumentId) errors.authorDocumentId = "Choose an author before publishing.";
	if ((payload.body?.blocks.length ?? 0) === 0) {
		errors.body = "Add body text before publishing.";
	}
	return errors;
}

export function hasPostErrors(errors: PostFieldErrors) {
	return Object.keys(errors).length > 0;
}
