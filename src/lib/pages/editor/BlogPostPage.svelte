<script lang="ts">
import { goto } from "$app/navigation";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import {
	blogDocumentLabel,
	blogSupportingReferenceOptions,
	copyPostDraft,
	defaultPresentationForFormat,
	hasPostErrors,
	postBodySupportsPlainTextEditing,
	postBodyToPlainText,
	postMediaReviewPlacements,
	resolvePostBodyPlainTextEdit,
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
import { type PortfolioMediaAsset } from "../../portfolioEditor";
import "../../styles/editorial-page.css";
import BlogMediaReview from "./BlogMediaReview.svelte";

let { documentId }: { documentId: string } = $props();

const config = getAdminConfig();
const blogApi = config.api.blogContent;
const postApi = config.api.postContent;
const blogConfig = config.editor?.blog;
if (!blogApi || !postApi || !blogConfig) {
	throw new Error("Blog editor is not configured for this host");
}

const baseHref = blogConfig.baseHref ?? "/admin/editor/blog";
const mediaBaseUrl = blogConfig.mediaBaseUrl;
const getManyMediaAssets = mediaBaseUrl ? config.api.mediaAssets?.getManyForEditor : undefined;
if (mediaBaseUrl && !getManyMediaAssets) {
	throw new Error("Blog media review API is incomplete for this host");
}
const postEditorApi = postApi;
const client = useAdminClient();
const editorQuery = useQuery(postEditorApi.getEditorState, () => ({ documentId }));
const authorsQuery = useQuery(blogApi.listForEditor, {
	siteUrl: config.siteUrl,
	kind: "author",
});
const categoriesQuery = useQuery(blogApi.listForEditor, {
	siteUrl: config.siteUrl,
	kind: "category",
});

let editorState = $derived(editorQuery.data as PostEditorState | undefined);
let form = $state<PostDraft>(copyPostDraft(undefined));
let authorDocuments = $derived(
	((authorsQuery.data as BlogSupportingEditorSummary[] | undefined) ?? []),
);
let categoryDocuments = $derived(
	((categoriesQuery.data as BlogSupportingEditorSummary[] | undefined) ?? []),
);
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
let bodyText = $state("");
let initializedBodyText = $state("");
let initializedRevisionId = $state<string | null>(null);
let saveState = $state<"loading" | "saved" | "dirty" | "saving" | "error">("loading");
let saveError = $state("");
let canSave = $derived(saveState === "dirty" || saveState === "error");
let publishState = $state<"idle" | "publishing" | "error">("idle");
let publishError = $state("");
let lifecycleState = $state<"idle" | "working" | "error">("idle");
let lifecycleError = $state("");
let fieldErrors = $state<PostFieldErrors>({});
let mediaIssues = $state<PostMediaPublishIssue[]>([]);
let acknowledgeSlugChange = $state(false);
let currentJson = $derived(serializePostDraft(normalizedDraft()));
let lastSavedJson = $state("");
let publishedDraft = $derived(editorState?.published?.draft);
let activeRevision = $derived(editorState?.draft ?? editorState?.published ?? null);
let publishedSlug = $derived(publishedDraft?.slug?.trim() || "");
let draftSlug = $derived(form.slug?.trim() || "");
let slugChanged = $derived(Boolean(publishedSlug && draftSlug && publishedSlug !== draftSlug));
let archived = $derived(Boolean(editorState?.archivedAt));
let bodyPlainTextEditable = $derived(postBodySupportsPlainTextEditing(form.body));
let mediaPlacements = $derived(postMediaReviewPlacements(form));
let mediaAssetIds = $derived([...new Set(mediaPlacements.map((placement) => placement.assetId))]);
const mediaQuery = getManyMediaAssets
	? useQuery(getManyMediaAssets, () => ({ siteUrl: config.siteUrl, ids: mediaAssetIds }))
	: null;
let mediaById = $derived(new Map(
	((mediaQuery?.data ?? []) as PortfolioMediaAsset[]).map((asset) => [asset._id, asset]),
));
let mediaReviewItems = $derived(mediaPlacements.map((placement) => ({
	id: placement.fieldId,
	assetId: placement.assetId,
	label: placement.kind === "main"
		? "main image"
		: `body image ${(placement.bodyImageIndex ?? 0) + 1}`,
	altText: placement.altText,
	caption: placement.caption,
	error: mediaIssues.find((issue) => issue.fieldId === placement.fieldId)?.message,
})));

$effect(() => {
	if (!activeRevision || initializedRevisionId === activeRevision.revisionId) return;
	form = copyPostDraft(activeRevision.draft);
	bodyText = postBodyToPlainText(form.body);
	initializedBodyText = bodyText;
	initializedRevisionId = activeRevision.revisionId;
	lastSavedJson = serializePostDraft(form);
	saveState = "saved";
	fieldErrors = {};
	mediaIssues = [];
	acknowledgeSlugChange = false;
});

$effect(() => {
	if (saveState === "loading") return;
	saveState = currentJson === lastSavedJson ? "saved" : "dirty";
});

function normalizedDraft(): PostDraft {
	const draft = copyPostDraft(form);
	return {
		...draft,
		body: resolvePostBodyPlainTextEdit(draft.body, initializedBodyText, bodyText),
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

async function saveDraft() {
	if (!editorState || archived || !canSave) return;
	const draft = normalizedDraft();
	saveState = "saving";
	saveError = "";
	try {
		const result = await client.mutation(postEditorApi.saveDraft, {
			documentId,
			expectedDraftRevisionId: editorState.draft?.revisionId,
			draft,
		}) as { revisionId: string };
		lastSavedJson = serializePostDraft(draft);
		initializedRevisionId = result.revisionId;
		saveState = "saved";
	} catch (error) {
		saveState = "error";
		saveError = error instanceof Error ? error.message : "Could not save this draft.";
	}
}

async function publishDraft() {
	if (!editorState || archived) return;
	const draft = normalizedDraft();
	fieldErrors = validatePostMetadataForPublish(draft);
	mediaIssues = validatePostMediaForPublish(draft);
	if (hasPostErrors(fieldErrors) || mediaIssues.length > 0) return;
	if (slugChanged && !acknowledgeSlugChange) {
		publishError = "Confirm the public URL change before publishing.";
		publishState = "error";
		return;
	}
	publishState = "publishing";
	publishError = "";
	try {
		let draftRevisionId = editorState.draft?.revisionId;
		if (serializePostDraft(draft) !== lastSavedJson || !draftRevisionId) {
			const saved = await client.mutation(postEditorApi.saveDraft, {
				documentId,
				expectedDraftRevisionId: editorState.draft?.revisionId,
				draft,
			}) as { revisionId: string };
			draftRevisionId = saved.revisionId;
			lastSavedJson = serializePostDraft(draft);
		}
		await client.mutation(postEditorApi.publish, {
			documentId,
			draftRevisionId,
			...(slugChanged ? { publishedSlugChange: { fromSlug: publishedSlug, toSlug: draftSlug } } : {}),
		});
		publishState = "idle";
		acknowledgeSlugChange = false;
	} catch (error) {
		publishState = "error";
		publishError = error instanceof Error ? error.message : "Could not publish this draft.";
	}
}

async function discardDraft() {
	if (!editorState?.draft || archived) return;
	saveError = "";
	try {
		await client.mutation(postEditorApi.discardDraft, {
			documentId,
			draftRevisionId: editorState.draft.revisionId,
		});
		if (editorState.published) {
			form = copyPostDraft(editorState.published.draft);
			bodyText = postBodyToPlainText(form.body);
			initializedBodyText = bodyText;
			lastSavedJson = serializePostDraft(form);
		}
	} catch (error) {
		saveState = "error";
		saveError = error instanceof Error ? error.message : "Could not discard this draft.";
	}
}

async function unpublishDocument() {
	if (!editorState?.published || archived) return;
	lifecycleState = "working";
	lifecycleError = "";
	try {
		await client.mutation(postEditorApi.unpublish, { documentId });
		lifecycleState = "idle";
	} catch (error) {
		lifecycleState = "error";
		lifecycleError = error instanceof Error ? error.message : "Could not unpublish this Post.";
	}
}

async function archiveDocument() {
	if (!editorState || archived) return;
	if (saveState === "dirty") {
		lifecycleState = "error";
		lifecycleError = "Save or discard draft changes before archiving.";
		return;
	}
	lifecycleState = "working";
	lifecycleError = "";
	try {
		await client.mutation(postEditorApi.archive, { documentId });
		lifecycleState = "idle";
	} catch (error) {
		lifecycleState = "error";
		lifecycleError = error instanceof Error ? error.message : "Could not archive this Post.";
	}
}

async function restoreDocument() {
	if (!editorState?.archivedAt) return;
	lifecycleState = "working";
	lifecycleError = "";
	try {
		await client.mutation(postEditorApi.restore, { documentId });
		lifecycleState = "idle";
	} catch (error) {
		lifecycleState = "error";
		lifecycleError = error instanceof Error ? error.message : "Could not restore this Post.";
	}
}
</script>

<svelte:head><title>post — {config.siteName}</title></svelte:head>

{#if editorState === undefined}
	<p class="loading" role="status">loading post…</p>
{:else}
	<div class="settings-page">
		<header class="settings-header">
			<div>
				<a class="back" href={baseHref}>← blog</a>
				<h1>post</h1>
				<p class="description">Edit the Post identity, references, body text, and factual descriptions for its existing images.</p>
			</div>
			<div class="header-actions">
				<span class="save-status">{saveState}</span>
				<button type="button" onclick={() => void saveDraft()} disabled={!canSave || archived}>
					save draft
				</button>
				<button type="button" class="primary" onclick={() => void publishDraft()} disabled={publishState === "publishing" || archived}>
					{publishState === "publishing" ? "publishing…" : "publish"}
				</button>
			</div>
		</header>

		{#if saveError}<p class="error" role="alert">{saveError}</p>{/if}
		{#if publishError}<p class="error" role="alert">{publishError}</p>{/if}
		{#if lifecycleError}<p class="error" role="alert">{lifecycleError}</p>{/if}
		{#if archived}
			<p class="notice" role="status">This Post is archived. Restore it before editing or publishing.</p>
		{/if}

		<section aria-labelledby="identity-heading">
			<div class="section-heading">
				<span>01</span>
				<div>
					<h2 id="identity-heading">identity</h2>
					<p>Public title, URL, date, and summary for this journal entry.</p>
				</div>
			</div>
			<div class="fields two">
				<label>
					post title
					<input maxlength="200" bind:value={form.title} aria-invalid={Boolean(fieldErrors.title)} onblur={updateSlugFromTitle} />
					{#if fieldErrors.title}<small class="field-error">{fieldErrors.title}</small>{/if}
				</label>
				<label>
					URL name
					<input maxlength="96" bind:value={form.slug} aria-invalid={Boolean(fieldErrors.slug)} />
					<small>Lowercase words separated by hyphens.</small>
					{#if fieldErrors.slug}<small class="field-error">{fieldErrors.slug}</small>{/if}
				</label>
				<label>
					public date
					<input type="date" value={formatDateForInput(form.displayPublishedAt)} aria-invalid={Boolean(fieldErrors.displayPublishedAt)} onchange={(event) => updateDisplayDate(event.currentTarget.value)} />
					{#if fieldErrors.displayPublishedAt}<small class="field-error">{fieldErrors.displayPublishedAt}</small>{/if}
				</label>
			</div>
			<div class="fields">
				<label>
					summary
					<textarea rows="4" maxlength="320" bind:value={form.summary} aria-invalid={Boolean(fieldErrors.summary)}></textarea>
					<small>Used as the public excerpt on Blog lists and link previews.</small>
					{#if fieldErrors.summary}<small class="field-error">{fieldErrors.summary}</small>{/if}
				</label>
			</div>
		</section>

		<section aria-labelledby="structure-heading">
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

		<section aria-labelledby="references-heading">
			<div class="section-heading">
				<span>03</span>
				<div>
					<h2 id="references-heading">author and categories</h2>
					<p>Published records are available for new links. Existing draft links remain visible so imported relationships are never silently removed.</p>
				</div>
			</div>
			<div class="fields two">
				<label>
					author
					<select bind:value={form.authorDocumentId} aria-invalid={Boolean(fieldErrors.authorDocumentId)}>
						<option value="">choose an author</option>
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
		</section>

		<section aria-labelledby="seo-heading">
			<div class="section-heading">
				<span>04</span>
				<div>
					<h2 id="seo-heading">search preview text</h2>
					<p>Optional overrides. If left blank, the public site can fall back to the Post title and summary.</p>
				</div>
			</div>
			<div class="fields">
				<label>
					SEO title
					<input maxlength="200" bind:value={form.seoTitle} aria-invalid={Boolean(fieldErrors.seoTitle)} />
					<small>Example: “A quiet wedding morning in Detroit — Margaret Helena”.</small>
					{#if fieldErrors.seoTitle}<small class="field-error">{fieldErrors.seoTitle}</small>{/if}
				</label>
				<label>
					SEO description
					<textarea rows="3" maxlength="320" bind:value={form.seoDescription} aria-invalid={Boolean(fieldErrors.seoDescription)}></textarea>
					<small>One or two plain-language sentences describing what the reader will find.</small>
					{#if fieldErrors.seoDescription}<small class="field-error">{fieldErrors.seoDescription}</small>{/if}
				</label>
			</div>
		</section>

		<section aria-labelledby="body-heading">
			<div class="section-heading">
				<span>05</span>
				<div>
					<h2 id="body-heading">body</h2>
					<p>Simple paragraph-only Posts can be edited here. Rich imported structure remains protected until the full rich editor is available.</p>
				</div>
			</div>
			<div class="fields">
				<label>
					body text
					<textarea rows="12" bind:value={bodyText} readonly={!bodyPlainTextEditable || archived} aria-readonly={!bodyPlainTextEditable || archived} aria-invalid={Boolean(fieldErrors.body)}></textarea>
					{#if bodyPlainTextEditable}
						<small>Separate paragraphs with a blank line.</small>
					{:else}
						<small>This body contains images, marks, or other rich structure. It is read-only here and will be saved unchanged.</small>
					{/if}
					{#if fieldErrors.body}<small class="field-error">{fieldErrors.body}</small>{/if}
				</label>
			</div>
		</section>

		<section aria-labelledby="media-heading">
			<div class="section-heading">
				<span>06</span>
				<div>
					<h2 id="media-heading">image review</h2>
					<p>Images remain in their exact main/body order. This review changes alt text only.</p>
				</div>
			</div>
			{#if mediaReviewItems.length > 0}
				<BlogMediaReview
					items={mediaReviewItems}
					{mediaById}
					mediaBaseUrl={mediaBaseUrl}
					disabled={archived}
					onAltTextChange={updateMediaAltText}
				/>
			{:else}
				<p class="empty-inline">This Post has no linked images.</p>
			{/if}
		</section>

		{#if slugChanged}
			<section aria-labelledby="slug-change-heading">
				<div class="section-heading">
					<span>07</span>
					<div>
						<h2 id="slug-change-heading">public URL change</h2>
						<p>Publishing will retain the old URL and point it at the new slug.</p>
					</div>
				</div>
				<label class="check">
					<input type="checkbox" bind:checked={acknowledgeSlugChange} />
					<span>I understand this changes the public URL from /{publishedSlug} to /{draftSlug}.</span>
				</label>
			</section>
		{/if}

		{#if editorState.draft}
			<section aria-labelledby="draft-actions-heading">
				<div class="section-heading">
					<span>{slugChanged ? "08" : "07"}</span>
					<div>
						<h2 id="draft-actions-heading">draft actions</h2>
						<p>Discard only clears the current draft pointer; immutable history stays available server-side.</p>
					</div>
				</div>
				<button type="button" onclick={() => void discardDraft()} disabled={archived}>discard draft</button>
			</section>
		{/if}

		<section aria-labelledby="lifecycle-heading">
			<div class="section-heading">
				<span>{slugChanged ? "09" : editorState.draft ? "08" : "07"}</span>
				<div>
					<h2 id="lifecycle-heading">visibility and recovery</h2>
					<p>Unpublish removes the public version. Archive hides this Post from editor lists while keeping it recoverable.</p>
				</div>
			</div>
			<div class="action-row">
				{#if archived}
					<button type="button" onclick={() => void restoreDocument()} disabled={lifecycleState === "working"}>restore</button>
				{:else}
					<button type="button" onclick={() => void unpublishDocument()} disabled={!editorState.published || lifecycleState === "working"}>unpublish</button>
					<button type="button" class="danger" onclick={() => void archiveDocument()} disabled={lifecycleState === "working"}>archive</button>
				{/if}
			</div>
		</section>
	</div>
{/if}

<style>
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

	.header-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.save-status {
		color: var(--admin-text-subtle);
		font-size: 0.85rem;
	}

	.fields.two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	button {
		border: 1px solid var(--admin-border);
		border-radius: 8px;
		padding: 10px 14px;
		background: transparent;
		color: var(--admin-heading);
		font: inherit;
		cursor: pointer;
	}

	button.primary {
		background: var(--admin-heading);
		color: var(--admin-bg);
	}

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
