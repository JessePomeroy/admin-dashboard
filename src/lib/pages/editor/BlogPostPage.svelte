<script lang="ts">
import EditorDocumentHeader from "./EditorDocumentHeader.svelte";
import EditorSlugField from "./EditorSlugField.svelte";
import PublishedSlugChange from "./PublishedSlugChange.svelte";
import PublicationControl from "./PublicationControl.svelte";
import { goto } from "$app/navigation";
import { useQuery } from "convex-svelte";
import { onMount } from "svelte";
import { useAdminClient } from "../../adminClient";
import {
	blogDocumentLabel,
	blogSupportingReferenceOptions,
	copyPostDraft,
	defaultPresentationForFormat,
	hasPostErrors,
	postMediaReviewPlacements,
	postBodyExcerpt,
	serializePostDraft,
	slugifyBlogTitle,
	updatePostMediaAltText,
	validatePostMediaForPublish,
	validatePostMetadataForPublish,
	type BlogSupportingEditorSummary,
	type PostDraft,
	type PostEditorState,
	type PostFieldErrors,
	type PostFormat,
	type PostMediaPublishIssue,
} from "../../blogEditor";
import { getAdminConfig } from "../../config";
import { createEditorMedia } from "../../editorMedia.svelte";
import type { PortfolioMediaAsset } from "../../portfolioEditor";
import "../../styles/editorial-page.css";
import BlogMediaReview from "./BlogMediaReview.svelte";
import BlogWorkbench from "./BlogWorkbench.svelte";
import { createBlogDocumentLifecycle } from "./blogDocumentLifecycle.svelte";

let { documentId }: { documentId: string } = $props();
type RichBodyEditorComponent = typeof import("./RichBodyEditor.svelte").default;
let RichBodyEditor = $state<RichBodyEditorComponent>();
let richEditorLoadError = $state(false);

onMount(() => {
	void import("./RichBodyEditor.svelte")
		.then((module) => {
			RichBodyEditor = module.default;
		})
		.catch(() => {
			richEditorLoadError = true;
		});
});

const config = getAdminConfig();
const blogApi = config.api.blogContent;
const postApi = config.api.postContent;
const blogConfig = config.editor?.blog;
if (!blogApi || !postApi || !blogConfig) {
	throw new Error("Blog editor is not configured for this host");
}

const baseHref = blogConfig.baseHref ?? "/admin/editor/blog";
const compactMode = blogConfig.mode === "compact";
const mediaBaseUrl = blogConfig.mediaBaseUrl;
const getManyMediaAssets = mediaBaseUrl ? config.api.mediaAssets?.getManyForEditor : undefined;
const listMediaAssets = mediaBaseUrl ? config.api.mediaAssets?.listForEditor : undefined;
if (mediaBaseUrl && !getManyMediaAssets) {
	throw new Error("Blog media review API is incomplete for this host");
}
const postEditorApi = postApi;
const client = useAdminClient();
const editorQuery = useQuery(postEditorApi.getEditorState, () => ({ documentId }));
const authorsQuery = compactMode ? null : useQuery(blogApi.listForEditor, {
	siteUrl: config.siteUrl,
	kind: "author",
});
const categoriesQuery = compactMode ? null : useQuery(blogApi.listForEditor, {
	siteUrl: config.siteUrl,
	kind: "category",
});

let editorState = $derived(editorQuery.data as PostEditorState | undefined);
let editorError = $derived(editorQuery.error);
let form = $state<PostDraft>(copyPostDraft(undefined));
let authorDocuments = $derived(
	((authorsQuery?.data as BlogSupportingEditorSummary[] | undefined) ?? []),
);
let categoryDocuments = $derived(
	((categoriesQuery?.data as BlogSupportingEditorSummary[] | undefined) ?? []),
);
let referenceError = $derived(authorsQuery?.error || categoriesQuery?.error);
let referenceLoading = $derived(authorsQuery?.isLoading || categoriesQuery?.isLoading);
let authors = $derived(
	blogSupportingReferenceOptions(
		authorDocuments,
		form.authorDocumentId ? [form.authorDocumentId] : [],
	),
);
let categories = $derived(
	blogSupportingReferenceOptions(
		categoryDocuments,
		form.categories.map((category) => category.documentId),
	),
);
let fieldErrors = $state<PostFieldErrors>({});
let mediaIssues = $state<PostMediaPublishIssue[]>([]);
let publishedDraft = $derived(editorState?.published?.draft);
let publishedSlug = $derived(publishedDraft?.slug?.trim() || "");
let draftSlug = $derived(form.slug?.trim() || "");
let slugChanged = $derived(Boolean(publishedSlug && draftSlug && publishedSlug !== draftSlug));
let archived = $derived(Boolean(editorState?.archivedAt));
let mediaPlacements = $derived(postMediaReviewPlacements(form));
let mediaAssetIds = $derived([...new Set(mediaPlacements.map((placement) => placement.assetId))]);
const mediaQuery = getManyMediaAssets
	? useQuery(getManyMediaAssets, () => ({ siteUrl: config.siteUrl, ids: mediaAssetIds }))
	: null;
// Linked-image loading/review stays independent of the current library page.
const mediaLibrary = createEditorMedia({
	siteUrl: config.siteUrl,
	list: listMediaAssets,
	placed: undefined,
	references: () => [],
});
let mediaById = $derived(new Map(
	((mediaQuery?.data ?? []) as PortfolioMediaAsset[]).map((asset) => [asset._id, asset]),
));
let readyMediaLibraryAssets = $derived(mediaLibrary.ready);
let readyMediaAssets = $derived([
	...new Map([
		...readyMediaLibraryAssets,
		...((mediaQuery?.data ?? []) as PortfolioMediaAsset[]),
	].map((asset) => [asset._id, asset])).values(),
].filter((asset) => asset.status === "ready"));
let linkedBodyAssetIds = $derived(new Set(
	mediaPlacements
		.filter((placement) => placement.kind === "body")
		.map((placement) => placement.assetId),
));
let mediaLibraryError = $derived(mediaLibrary.pagination?.error);
let mediaLibraryLoading = $derived(Boolean(mediaLibrary.pagination?.loading));
let addableReadyMediaAssets = $derived(
	mediaLibraryLoading || mediaLibraryError
		? []
		: readyMediaLibraryAssets.filter((asset) => !linkedBodyAssetIds.has(asset._id)),
);
let mediaError = $derived(mediaQuery?.error);
let mediaLoading = $derived(mediaPlacements.length > 0 && Boolean(mediaQuery?.isLoading));
let mediaReviewItems = $derived(mediaPlacements
	.filter((placement) => placement.kind === "main")
	.map((placement) => ({
	id: placement.fieldId,
	assetId: placement.assetId,
	label: placement.kind === "main"
		? "main image"
		: `body image ${(placement.bodyImageIndex ?? 0) + 1}`,
	altText: placement.altText,
	caption: placement.caption,
	error: mediaIssues.find((issue) => issue.fieldId === placement.fieldId)?.message,
})));

function normalizedDraft(publishing = false): PostDraft {
	const draft = copyPostDraft(form);
	if (compactMode) {
		if (!draft.authorDocumentId) draft.authorSource = "siteSettings";
		if (!draft.summary?.trim()) draft.summarySource = "body";
	}
	// Persist ownership so a failed publication or reload cannot freeze an automatic excerpt.
	if (publishing && draft.summarySource === "body") {
		draft.summary = postBodyExcerpt(draft.body) || draft.title?.trim().slice(0, 320) || "";
	}
	return {
		...draft,
		authorDocumentId: draft.authorDocumentId || undefined,
		categories: draft.categories.filter((category) => category.documentId),
	};
}

function supportingOptionLabel(document: BlogSupportingEditorSummary) {
	const label = blogDocumentLabel(document);
	if (document.archivedAt) return `${label} — archived, currently linked`;
	if (!document.publishedRevisionId) return `${label} — draft, currently linked`;
	return label;
}

function updateMediaAltText(item: { id: string }, value: string) {
	form = updatePostMediaAltText(form, item.id, value);
	mediaIssues = mediaIssues.filter((issue) => issue.fieldId !== item.id);
}

function updateSlugFromTitle() {
	if (archived || lifecycle.saveState === "saving" || lifecycle.publishState === "publishing" || lifecycle.lifecycleState === "working" || !form.title?.trim()) return;
	form.slug = slugifyBlogTitle(form.title ?? "");
}

function updateFormat() {
	if (!form.format) return;
	form.presentation = defaultPresentationForFormat(form.format);
}

function formatDateForInput(value: number | undefined) {
	if (!value) return "";
	return new Date(value).toISOString().slice(0, 10);
}

function updateDisplayDate(value: string) {
	if (!value) {
		form.displayPublishedAt = undefined;
		return;
	}
	const parsed = new Date(`${value}T12:00:00.000Z`).getTime();
	form.displayPublishedAt = Number.isNaN(parsed) ? undefined : parsed;
}

function categoryChecked(categoryId: string) {
	return form.categories.some((category) => category.documentId === categoryId);
}

function toggleCategory(categoryId: string, checked: boolean) {
	if (checked) {
		if (categoryChecked(categoryId)) return;
		form.categories = [
			...form.categories,
			{ key: `category-${categoryId}`, documentId: categoryId },
		];
		return;
	}
	form.categories = form.categories.filter((category) => category.documentId !== categoryId);
}

const lifecycle = createBlogDocumentLifecycle<PostDraft>({
	state: () => editorState,
	draft: (publishing) => normalizedDraft(publishing),
	setDraft: (draft) => { form = draft; },
	copy: (draft) => copyPostDraft(draft),
	serialize: serializePostDraft,
	validatePublish: (draft) => {
		fieldErrors = validatePostMetadataForPublish(draft);
		mediaIssues = validatePostMediaForPublish(draft);
		return !hasPostErrors(fieldErrors) && mediaIssues.length === 0;
	},
	slugChange: () => slugChanged ? { fromSlug: publishedSlug, toSlug: draftSlug } : null,
	onInitialize: () => { fieldErrors = {}; mediaIssues = []; },
	label: "Post",
	actions: {
		save: (draft, expectedDraftRevisionId) => client.mutation(postEditorApi.saveDraft, { documentId, expectedDraftRevisionId, draft }) as Promise<{ revisionId: string }>,
		publish: (draftRevisionId, slugChange) => client.mutation(postEditorApi.publish, { documentId, draftRevisionId, ...(slugChange ? { publishedSlugChange: slugChange } : {}) }),
		discard: (draftRevisionId) => client.mutation(postEditorApi.discardDraft, { documentId, draftRevisionId }),
		unpublish: () => client.mutation(postEditorApi.unpublish, { documentId }),
		archive: () => client.mutation(postEditorApi.archive, { documentId }),
		restore: () => client.mutation(postEditorApi.restore, { documentId }),
	},
});
</script>

<svelte:head><title>{form.title?.trim() || "Untitled post"} — {config.siteName}</title></svelte:head>

<BlogWorkbench selectedDocumentId={documentId} selectedKind="post">
{#if editorError}
	<div class="settings-page"><p class="error" role="alert">Could not load this post.</p></div>
{:else if editorState === undefined}
	<p class="loading" role="status">loading post…</p>
{:else}
	<div class="settings-page editor-document">
		<EditorDocumentHeader variant="blog" saveState={lifecycle.saveState}>
		{#snippet title()}<div>
				<a class="back" href={baseHref}>← blog</a>
				<h1>{form.title?.trim() || "untitled post"}</h1>
			</div>{/snippet}
		{#snippet actions()}
				{#if !archived && (lifecycle.canSave || lifecycle.saveState === "saving")}
					<button type="button" onclick={() => void lifecycle.saveDraft()} disabled={!lifecycle.canSave || lifecycle.publicationBusy}>save draft</button>
				{/if}
				<PublicationControl published={Boolean(editorState.published)} hasChanges={lifecycle.publicationHasChanges} {archived} item={"post"} onpublish={lifecycle.publishDraft} onunpublish={lifecycle.unpublishDocument} busy={lifecycle.publicationBusy} />
		{/snippet}
	</EditorDocumentHeader>

		{#if lifecycle.saveError}<p class="error" role="alert">{lifecycle.saveError}</p>{/if}
		{#if lifecycle.publishError}<p class="error" role="alert">{lifecycle.publishError}</p>{/if}
		{#if lifecycle.lifecycleError}<p class="error" role="alert">{lifecycle.lifecycleError}</p>{/if}
		{#if archived}
			<p class="notice" role="status">This Post is archived. Restore it before editing or publishing.</p>
		{/if}

		<section class="document-section" aria-labelledby="identity-heading">
			<div class="section-heading">
				<span>01</span>
				<div>
					<h2 id="identity-heading">identity</h2>
					<p>{compactMode ? "Public title and URL for this journal entry." : "Public title, URL, date, and summary for this journal entry."}</p>
				</div>
			</div>
			<div class="fields two">
				<label>
					<span class="field-heading">post title</span>
					<input maxlength="200" bind:value={form.title} aria-invalid={Boolean(fieldErrors.title)} disabled={archived} />
					{#if fieldErrors.title}<small class="field-error">{fieldErrors.title}</small>{/if}
				</label>
				<EditorSlugField id="post-slug" value={form.slug ?? ""} maxLength={96} onChange={(value) => form.slug = value} onGenerate={updateSlugFromTitle} generateDisabled={archived || lifecycle.saveState === "saving" || lifecycle.publishState === "publishing" || lifecycle.lifecycleState === "working" || !form.title?.trim()} disabled={archived} error={fieldErrors.slug} />
				{#if !compactMode}
				<label>
					public date
					<input type="date" value={formatDateForInput(form.displayPublishedAt)} aria-invalid={Boolean(fieldErrors.displayPublishedAt)} onchange={(event) => updateDisplayDate(event.currentTarget.value)} />
					{#if fieldErrors.displayPublishedAt}<small class="field-error">{fieldErrors.displayPublishedAt}</small>{/if}
				</label>
				{/if}
			</div>
			{#if !compactMode}
			<div class="fields">
				<label>
					summary
					<textarea rows="4" maxlength="320" bind:value={form.summary} aria-invalid={Boolean(fieldErrors.summary)} oninput={() => { form.summarySource = undefined; }}></textarea>
					<small>Used as the public excerpt on Blog lists and link previews.</small>
					{#if fieldErrors.summary}<small class="field-error">{fieldErrors.summary}</small>{/if}
				</label>
			</div>
			{:else}
				<p class="metadata-note empty-inline">New posts use your published Site Settings name, an automatic date, and an excerpt from the body. Existing metadata is preserved.</p>
				{#each [fieldErrors.format, fieldErrors.presentation, fieldErrors.displayPublishedAt, fieldErrors.summary, fieldErrors.authorDocumentId].filter(Boolean) as message}
					<p class="error" role="alert">{message}</p>
				{/each}
			{/if}
		</section>

		{#if !compactMode}
		<section class="document-section" aria-labelledby="structure-heading">
			<div class="section-heading">
				<span>02</span>
				<div>
					<h2 id="structure-heading">structure</h2>
					<p>Choose the intended editorial shape. Each format keeps its compatible presentations.</p>
				</div>
			</div>
			<div class="fields two">
				<label>
					format
					<select bind:value={form.format} aria-invalid={Boolean(fieldErrors.format)} onchange={updateFormat}>
						<option value="essay">essay</option>
						<option value="projectStory">project story</option>
						<option value="technicalNote">technical note</option>
					</select>
					{#if fieldErrors.format}<small class="field-error">{fieldErrors.format}</small>{/if}
				</label>
				<label>
					presentation
					<select bind:value={form.presentation} aria-invalid={Boolean(fieldErrors.presentation)}>
						{#if form.format === "essay"}
							<option value="standard">standard</option>
							<option value="behindTheScenes">behind the scenes</option>
						{:else if form.format === "projectStory"}
							<option value="caseStudy">case study</option>
							<option value="clientStory">client story</option>
						{:else}
							<option value="technical">technical</option>
						{/if}
					</select>
					{#if fieldErrors.presentation}<small class="field-error">{fieldErrors.presentation}</small>{/if}
				</label>
			</div>
		</section>

		<section class="document-section" aria-labelledby="references-heading">
			<div class="section-heading">
				<span>03</span>
				<div>
					<h2 id="references-heading">author and categories</h2>
					<p>Published records are available for new links. Existing draft links remain visible so imported relationships are never silently removed.</p>
				</div>
			</div>
			{#if referenceLoading}
				<p class="empty-inline" role="status">loading author and category options…</p>
			{:else if referenceError}
				<p class="error" role="alert">Could not load author and category options.</p>
			{:else}
				<div class="fields two">
					<label>
						author
						<select bind:value={form.authorDocumentId} aria-invalid={Boolean(fieldErrors.authorDocumentId)} onchange={() => { if (form.authorDocumentId) form.authorSource = undefined; }}>
							<option value="">{form.authorSource === "siteSettings" ? "Site Settings author" : "choose an author"}</option>
							{#each authors as author}
								<option value={author.documentId}>{supportingOptionLabel(author)}</option>
							{/each}
						</select>
						{#if fieldErrors.authorDocumentId}<small class="field-error">{fieldErrors.authorDocumentId}</small>{/if}
					</label>
				</div>
				<div class="checkbox-list" aria-label="categories">
					{#if categories.length === 0}
						<p class="empty-inline">No published or currently linked categories.</p>
					{:else}
						{#each categories as category}
							<label class="check">
								<input
									type="checkbox"
									checked={categoryChecked(category.documentId)}
									onchange={(event) => toggleCategory(category.documentId, event.currentTarget.checked)}
								/>
								<span>{supportingOptionLabel(category)}</span>
							</label>
						{/each}
					{/if}
				</div>
			{/if}
		</section>
		{/if}

		<section class="document-section" aria-labelledby="seo-heading">
			<div class="section-heading">
				<span>{compactMode ? "02" : "04"}</span>
				<div>
					<h2 id="seo-heading">search preview text</h2>
					<p>Optional overrides. If left blank, the public site can fall back to the Post title and summary.</p>
				</div>
			</div>
			<div class="fields">
				<label>
					search title
					<input maxlength="200" bind:value={form.seoTitle} aria-invalid={Boolean(fieldErrors.seoTitle)} />
					<small>Example: “A quiet wedding morning in Detroit — Margaret Helena”.</small>
					{#if fieldErrors.seoTitle}<small class="field-error">{fieldErrors.seoTitle}</small>{/if}
				</label>
				<label>
					search description
					<textarea rows="3" maxlength="320" bind:value={form.seoDescription} aria-invalid={Boolean(fieldErrors.seoDescription)}></textarea>
					<small>One or two plain-language sentences describing what the reader will find.</small>
					{#if fieldErrors.seoDescription}<small class="field-error">{fieldErrors.seoDescription}</small>{/if}
				</label>
			</div>
		</section>

		<section aria-labelledby="body-heading">
			<div class="section-heading">
				<span>{compactMode ? "03" : "05"}</span>
				<div>
					<h2 id="body-heading">body</h2>
					<p>Write and format the article.</p>
				</div>
			</div>
			<p id="body-help" class="empty-inline">Use paragraphs, headings, quotes, lists, links, emphasis, and images.</p>
			{#if mediaLibraryLoading}
				<p class="empty-inline" role="status">loading the ready image library…</p>
			{:else if mediaLibraryError}
				<p class="error" role="alert">Could not load the ready image library. Existing linked images remain editable.</p>
			{/if}
			{#if richEditorLoadError}
				<p class="error" role="alert">Could not load the rich body editor. The existing body remains unchanged.</p>
			{:else if !RichBodyEditor}
				<p class="empty-inline" role="status">loading rich body editor…</p>
			{:else}
				{#key lifecycle.initializedRevisionId}
					<RichBodyEditor
						document={form.body}
						disabled={archived}
						labelledBy="body-heading"
						describedBy="body-help"
						mediaAssets={readyMediaAssets}
						addableMediaAssets={addableReadyMediaAssets}
						mediaPagination={mediaLibrary.pagination}
						{mediaBaseUrl}
						onDocumentChange={(body) => {
							form.body = body;
							fieldErrors = { ...fieldErrors, body: undefined };
						}}
					/>
				{/key}
			{/if}
			{#if fieldErrors.body}<small class="field-error">{fieldErrors.body}</small>{/if}
		</section>

		<section class="document-section" aria-labelledby="media-heading">
			<div class="section-heading">
				<span>{compactMode ? "04" : "06"}</span>
				<div>
					<h2 id="media-heading">image review</h2>
					<p>Review the main image alt text here. Body-image order, alt text, and captions are edited in the rich body above.</p>
				</div>
			</div>
			{#if mediaLoading}
				<p class="empty-inline" role="status">loading linked image details…</p>
			{:else if mediaError}
				<p class="error" role="alert">Could not load linked image details.</p>
			{:else if mediaReviewItems.length > 0}
				<BlogMediaReview
					items={mediaReviewItems}
					{mediaById}
					mediaBaseUrl={mediaBaseUrl}
					disabled={archived}
					onAltTextChange={updateMediaAltText}
				/>
			{:else}
				<p class="empty-inline">This Post has no main image.</p>
			{/if}
		</section>

		{#if slugChanged}
			<PublishedSlugChange step={compactMode ? "05" : "07"} fromSlug={publishedSlug} toSlug={draftSlug} bind:checked={lifecycle.acknowledgeSlugChange} />
		{/if}

		{#if editorState.draft}
			<section class="document-section" aria-labelledby="draft-actions-heading">
				<div class="section-heading">
					<span>{compactMode ? (slugChanged ? "06" : "05") : (slugChanged ? "08" : "07")}</span>
					<div>
						<h2 id="draft-actions-heading">draft actions</h2>
						<p>Discard the current draft and return to the published version.</p>
					</div>
				</div>
				<button type="button" onclick={() => void lifecycle.discardDraft()} disabled={archived}>discard draft</button>
			</section>
		{/if}

		<section class="document-section" aria-labelledby="lifecycle-heading">
			<div class="section-heading">
				<span>{String((compactMode ? 5 : 7) + (slugChanged ? 1 : 0) + (editorState.draft ? 1 : 0)).padStart(2, "0")}</span>
				<div>
					<h2 id="lifecycle-heading">archive and recovery</h2>
					<p>Archive removes this post from the public site and editor lists. You can restore it later.</p>
				</div>
			</div>
			<div class="action-row">
				{#if archived}
					<button type="button" onclick={() => void lifecycle.restoreDocument()} disabled={lifecycle.lifecycleState === "working"}>restore</button>
				{:else}
					<button type="button" class="danger" onclick={() => void lifecycle.archiveDocument()} disabled={lifecycle.lifecycleState === "working"}>archive</button>
				{/if}
			</div>
		</section>
	</div>
{/if}
</BlogWorkbench>

<style>
	.field-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 28px; }
		.metadata-note { margin-top: 14px; font-size: .72rem; line-height: 1.5; }
		.loading {
		padding: 48px 40px;
		color: var(--admin-text-muted);
	}

	.back {
		display: inline-block;
		margin-bottom: 14px;
		color: var(--admin-text-muted);
		text-decoration: none;
	}

	.fields.two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	button {
		border: 1px solid var(--admin-border-strong);
		border-radius: 3px;
		padding: 8px 11px;
		background: transparent;
		color: var(--admin-text);
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
	}


	button:hover:not(:disabled) { background: var(--admin-active); }
	button:active:not(:disabled) { transform: translateY(1px); }

	button.danger {
		border-color: color-mix(in srgb, var(--admin-danger, #ff8f8f) 55%, transparent);
		color: var(--admin-danger, #ff8f8f);
	}

	button:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	.checkbox-list {
		display: grid;
		gap: 10px;
		margin-top: 14px;
	}

	.check {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		color: var(--admin-text);
	}

	.check input {
		width: auto;
		margin-top: 5px;
	}

	.empty-inline {
		margin: 0;
		color: var(--admin-text-muted);
	}

	.notice {
		margin: 0 0 16px;
		color: var(--admin-text-muted);
	}

	.action-row {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	@media (max-width: 820px) {
		.fields.two {
			grid-template-columns: 1fr;
		}
	}
</style>
