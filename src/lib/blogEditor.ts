export type BlogSupportingKind = "author" | "category";
export type BlogDocumentKind = BlogSupportingKind | "post";

export type RichTextMark =
	| { type: "strong" }
	| { type: "emphasis" }
	| { type: "link"; key: string; href: string };

export interface RichTextSpan {
	type: "text";
	key: string;
	text: string;
	marks: RichTextMark[];
}

export interface RichTextListItem {
	key: string;
	children: RichTextSpan[];
}

export type RichTextTextBlock = {
	key: string;
	children: RichTextSpan[];
} & (
	| { type: "paragraph" }
	| { type: "heading"; level: 2 | 3 | 4 }
	| { type: "quote" }
);

export interface RichTextListBlock {
	type: "list";
	key: string;
	style: "bullet" | "number";
	items: RichTextListItem[];
}

export interface RichTextDocument {
	version: 1;
	blocks: Array<RichTextTextBlock | RichTextListBlock>;
}

export interface BlogImageDraft {
	key: string;
	assetId: string;
	altText?: string;
	caption?: string;
}

export interface AuthorDraft {
	kind: "author";
	name?: string;
	slug?: string;
	bio?: RichTextDocument;
	portrait?: BlogImageDraft;
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

export interface PostMainImageDraft extends BlogImageDraft {}

export interface PostImageBlockDraft extends BlogImageDraft {
	type: "image";
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

export interface PostMediaReviewPlacement extends BlogImageDraft {
	fieldId: string;
	kind: "main" | "body";
	/** Zero-based index among body image blocks; omitted for the main image. */
	bodyImageIndex?: number;
	/** Exact block index in the rich body; omitted for the main image. */
	blockIndex?: number;
}

export interface PostMediaPublishIssue {
	fieldId: string;
	message: string;
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

/**
 * Offer published supporting content plus records already linked by the Post.
 * This keeps imported draft relationships visible without exposing unrelated
 * unpublished or archived records as new choices.
 */
export function blogSupportingReferenceOptions(
	documents: readonly BlogSupportingEditorSummary[],
	referencedDocumentIds: Iterable<string>,
) {
	const referenced = new Set(referencedDocumentIds);
	return documents.filter((document) =>
		referenced.has(document.documentId)
		|| Boolean(document.publishedRevisionId && !document.archivedAt)
	);
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Clone JSON-compatible editor values without invoking structuredClone on Svelte proxies. */
function cloneJsonValue<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((item) => cloneJsonValue(item)) as T;
	}
	if (isRecord(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)]),
		) as T;
	}
	return value;
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]) {
	const allowed = new Set(allowedKeys);
	return Object.keys(value).every((key) => allowed.has(key));
}

function isExactlyPlainTextParagraphBlock(block: unknown) {
	if (
		!isRecord(block)
		|| block.type !== "paragraph"
		|| typeof block.key !== "string"
		|| !Array.isArray(block.children)
		|| !hasOnlyKeys(block, ["type", "key", "children"])
	) return false;
	return block.children.every((child) =>
		isRecord(child)
		&& child.type === "text"
		&& typeof child.key === "string"
		&& typeof child.text === "string"
		&& Array.isArray(child.marks)
		&& child.marks.length === 0
		&& hasOnlyKeys(child, ["type", "key", "text", "marks"])
	);
}

function copyPostBody(body: PostRichTextDocument | undefined): PostRichTextDocument {
	if (!body) return emptyPostBody();
	return cloneJsonValue(body);
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
		.flatMap((block) =>
			block.type === "list"
				? block.items.map((item) => item.children.map((child) => child.text).join(""))
				: [block.children.map((child) => child.text).join("")]
		)
		.filter(Boolean)
		.join("\n\n");
}

/** Author bios use the full text-only rich contract, but this form edits paragraphs only. */
export function authorBioSupportsPlainTextEditing(value: RichTextDocument | undefined) {
	return (value?.blocks ?? []).every(isExactlyPlainTextParagraphBlock);
}

/** Preserve original block keys until the editor actually changes the text. */
export function resolveAuthorBioPlainTextEdit(
	bio: RichTextDocument | undefined,
	initializedText: string,
	nextText: string,
): RichTextDocument | undefined {
	if (nextText === initializedText || !authorBioSupportsPlainTextEditing(bio)) {
		return bio ? cloneJsonValue(bio) : undefined;
	}
	return authorBioFromText(nextText);
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
			bio: payload.bio ? cloneJsonValue(payload.bio) : emptyAuthorBio(),
			portrait: payload.portrait ? { ...payload.portrait } : undefined,
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
			portrait: payload.portrait ?? null,
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
	"name" | "title" | "slug" | "bio" | "portraitAltText" | "description",
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
		if (payload.portrait) {
			const altText = payload.portrait.altText?.trim() ?? "";
			if (!altText) errors.portraitAltText = "Author portrait needs alt text.";
			else if (altText.length > 500) {
				errors.portraitAltText = "Author portrait alt text must be 500 characters or fewer.";
			}
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

export function isPostImageBlock(block: unknown): block is PostImageBlockDraft {
	return isRecord(block)
		&& block.type === "image"
		&& typeof block.key === "string"
		&& typeof block.assetId === "string";
}

/** Main image first, followed by rich-body images in exact block order. */
export function postMediaReviewPlacements(payload: PostDraft): PostMediaReviewPlacement[] {
	const placements: PostMediaReviewPlacement[] = [];
	if (payload.mainImage) {
		placements.push({
			...payload.mainImage,
			fieldId: "post-main-image-alt",
			kind: "main",
		});
	}
	let bodyImageIndex = 0;
	for (const [blockIndex, block] of payload.body.blocks.entries()) {
		if (!isPostImageBlock(block)) continue;
		placements.push({
			key: block.key,
			assetId: block.assetId,
			...(typeof block.altText === "string" ? { altText: block.altText } : {}),
			...(typeof block.caption === "string" ? { caption: block.caption } : {}),
			fieldId: `post-body-image-${block.key}-alt`,
			kind: "body",
			bodyImageIndex,
			blockIndex,
		});
		bodyImageIndex += 1;
	}
	return placements;
}

/** Update one placement while preserving every key, relationship, and block. */
export function updatePostMediaAltText(
	payload: PostDraft,
	fieldId: string,
	altText: string,
): PostDraft {
	const draft = copyPostDraft(payload);
	if (fieldId === "post-main-image-alt") {
		if (draft.mainImage) draft.mainImage = { ...draft.mainImage, altText };
		return draft;
	}
	draft.body = {
		...draft.body,
		blocks: draft.body.blocks.map((block) =>
			isPostImageBlock(block)
			&& `post-body-image-${block.key}-alt` === fieldId
				? { ...block, altText }
				: block
		),
	};
	return draft;
}

export function validatePostMediaForPublish(payload: PostDraft): PostMediaPublishIssue[] {
	return postMediaReviewPlacements(payload).flatMap((placement) => {
		const altText = placement.altText?.trim() ?? "";
		const label = placement.kind === "main"
			? "Main image"
			: `Body image ${(placement.bodyImageIndex ?? 0) + 1}`;
		if (!altText) {
			return [{ fieldId: placement.fieldId, message: `${label} needs alt text.` }];
		}
		if (altText.length > 500) {
			return [{
				fieldId: placement.fieldId,
				message: `${label} alt text must be 500 characters or fewer.`,
			}];
		}
		return [];
	});
}
