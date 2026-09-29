<script lang="ts">
import EditorDocumentHeader from "./EditorDocumentHeader.svelte";
import EditorSlugField from "./EditorSlugField.svelte";
import PublishedSlugChange from "./PublishedSlugChange.svelte";
import PublicationControl from "./PublicationControl.svelte";
import { goto } from "$app/navigation";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import {
	authorBioSupportsPlainTextEditing,
	authorBioToText,
	copyBlogSupportingDraft,
	hasBlogSupportingErrors,
	resolveAuthorBioPlainTextEdit,
	serializeBlogSupportingDraft,
	slugifyBlogTitle,
	validateBlogSupportingForPublish,
	type BlogSupportingDraft,
	type BlogSupportingEditorState,
	type BlogSupportingFieldErrors,
	type BlogSupportingKind,
} from "../../blogEditor";
import { getAdminConfig } from "../../config";
import { type PortfolioMediaAsset } from "../../portfolioEditor";
import "../../styles/editorial-page.css";
import BlogMediaReview from "./BlogMediaReview.svelte";
import BlogWorkbench from "./BlogWorkbench.svelte";
import { createBlogDocumentLifecycle } from "./blogDocumentLifecycle.svelte";

let {
	documentId,
	kind,
}: {
	documentId: string;
	kind: BlogSupportingKind;
} = $props();

const config = getAdminConfig();
const blogApi = config.api.blogContent;
const blogConfig = config.editor?.blog;
if (!blogApi || !blogConfig) {
	throw new Error("Blog editor is not configured for this host");
}

const editorApi = blogApi;
const baseHref = blogConfig.baseHref ?? "/admin/editor/blog";
const mediaBaseUrl = blogConfig.mediaBaseUrl;
const getManyMediaAssets = mediaBaseUrl ? config.api.mediaAssets?.getManyForEditor : undefined;
if (mediaBaseUrl && !getManyMediaAssets) {
	throw new Error("Blog media review API is incomplete for this host");
}
const client = useAdminClient();
const editorQuery = useQuery(editorApi.getEditorState, () => ({ documentId }));

let editorState = $derived(editorQuery.data as BlogSupportingEditorState | undefined);
let editorError = $derived(editorQuery.error);
let form = $state<BlogSupportingDraft>({ kind: "author", name: "", slug: "" });
let bioText = $state("");
let initializedBioText = $state("");
let fieldErrors = $state<BlogSupportingFieldErrors>({});
let publishedDraft = $derived(editorState?.published?.draft);
let backHref = $derived(`${baseHref}`);
let publishedSlug = $derived(publishedDraft?.slug?.trim() || "");
let draftSlug = $derived(form.slug?.trim() || "");
let slugChanged = $derived(Boolean(publishedSlug && draftSlug && publishedSlug !== draftSlug));
let archived = $derived(Boolean(editorState?.archivedAt));
let bioPlainTextEditable = $derived(
	form.kind !== "author" || authorBioSupportsPlainTextEditing(form.bio),
);
let portraitItems = $derived(form.kind === "author" && form.portrait ? [{
	id: "author-portrait",
	assetId: form.portrait.assetId,
	label: "author portrait",
	altText: form.portrait.altText,
	caption: form.portrait.caption,
	error: fieldErrors.portraitAltText,
}] : []);
let supportingSectionOffset = $derived(portraitItems.length > 0 ? 1 : 0);
let portraitAssetIds = $derived(portraitItems.map((item) => item.assetId));
const mediaQuery = getManyMediaAssets
	? useQuery(getManyMediaAssets, () => ({ siteUrl: config.siteUrl, ids: portraitAssetIds }))
	: null;
let mediaById = $derived(new Map(
	((mediaQuery?.data ?? []) as PortfolioMediaAsset[]).map((asset) => [asset._id, asset]),
));
let mediaError = $derived(mediaQuery?.error);
let mediaLoading = $derived(portraitItems.length > 0 && Boolean(mediaQuery?.isLoading));

function normalizedDraft(): BlogSupportingDraft {
	if (form.kind === "author") {
		const draft = copyBlogSupportingDraft(form, "author");
		if (draft.kind !== "author") throw new Error("Expected an Author draft");
		return {
			...draft,
			bio: resolveAuthorBioPlainTextEdit(draft.bio, initializedBioText, bioText),
		};
	}
	return {
		kind: "category",
		title: form.title ?? "",
		slug: form.slug ?? "",
		description: form.description ?? "",
	};
}

function updatePortraitAltText(_item: { id: string }, value: string) {
	if (form.kind !== "author" || !form.portrait) return;
	form = {
		...form,
		portrait: { ...form.portrait, altText: value },
	};
	fieldErrors = { ...fieldErrors, portraitAltText: undefined };
}

function updateSlugFromTitle() {
	if (form.kind === "author") form.slug = slugifyBlogTitle(form.name ?? "");
	else form.slug = slugifyBlogTitle(form.title ?? "");
}

const lifecycle = createBlogDocumentLifecycle<BlogSupportingDraft>({
	state: () => editorState,
	draft: () => normalizedDraft(),
	setDraft: (draft) => {
		form = draft;
		bioText = draft.kind === "author" ? authorBioToText(draft.bio) : "";
		initializedBioText = bioText;
	},
	copy: (draft) => copyBlogSupportingDraft(draft, kind),
	serialize: serializeBlogSupportingDraft,
	validatePublish: (draft) => {
		fieldErrors = validateBlogSupportingForPublish(draft);
		return !hasBlogSupportingErrors(fieldErrors);
	},
	slugChange: () => slugChanged ? { fromSlug: publishedSlug, toSlug: draftSlug } : null,
	onInitialize: () => { fieldErrors = {}; },
	label: "document",
	actions: {
		save: (draft, expectedDraftRevisionId) => client.mutation(editorApi.saveDraft, { documentId, expectedDraftRevisionId, draft }) as Promise<{ revisionId: string }>,
		publish: (draftRevisionId, slugChange) => client.mutation(editorApi.publish, { documentId, draftRevisionId, ...(slugChange ? { publishedSlugChange: slugChange } : {}) }),
		discard: (draftRevisionId) => client.mutation(editorApi.discardDraft, { documentId, draftRevisionId }),
		unpublish: () => client.mutation(editorApi.unpublish, { documentId }),
		archive: () => client.mutation(editorApi.archive, { documentId }),
		restore: () => client.mutation(editorApi.restore, { documentId }),
	},
});
</script>

<svelte:head><title>{kind} — {config.siteName}</title></svelte:head>

<BlogWorkbench selectedDocumentId={documentId} selectedKind={kind}>
{#if editorError}
	<div class="settings-page"><p class="error" role="alert">Could not load this {kind}.</p></div>
{:else if editorState === undefined}
	<p class="loading" role="status">loading {kind}…</p>
{:else if editorState.kind !== kind}
	<section class="settings-page">
		<a class="back" href={backHref}>← blog</a>
		<h1>wrong document type</h1>
		<p class="description">This document is a {editorState.kind}, not a {kind}.</p>
	</section>
{:else}
	<div class="settings-page">
		<EditorDocumentHeader variant="blog" saveState={lifecycle.saveState}>
		{#snippet title()}<div>
				<a class="back" href={backHref}>← blog</a>
				<h1>{kind === "author" ? "author" : "category"}</h1>
			</div>{/snippet}
		{#snippet actions()}
				{#if !archived && (lifecycle.canSave || lifecycle.saveState === "saving")}
					<button type="button" onclick={() => void lifecycle.saveDraft()} disabled={!lifecycle.canSave || lifecycle.publicationBusy}>save draft</button>
				{/if}
				<PublicationControl published={Boolean(editorState.published)} hasChanges={lifecycle.publicationHasChanges} {archived} item={kind} onpublish={lifecycle.publishDraft} onunpublish={lifecycle.unpublishDocument} busy={lifecycle.publicationBusy} />
		{/snippet}
	</EditorDocumentHeader>

		{#if lifecycle.saveError}<p class="error" role="alert">{lifecycle.saveError}</p>{/if}
		{#if lifecycle.publishError}<p class="error" role="alert">{lifecycle.publishError}</p>{/if}
		{#if lifecycle.lifecycleError}<p class="error" role="alert">{lifecycle.lifecycleError}</p>{/if}
		{#if archived}
			<p class="notice" role="status">This {kind} is archived. Restore it before editing or publishing.</p>
		{/if}

		<section aria-labelledby="identity-heading">
			<div class="section-heading">
				<span>01</span>
				<div>
					<h2 id="identity-heading">identity</h2>
					<p>Public naming and URL identity for this {kind}.</p>
				</div>
			</div>
			<div class="fields">
				{#if form.kind === "author"}
					<label>
						author name
						<input maxlength="120" bind:value={form.name} aria-invalid={Boolean(fieldErrors.name)} onblur={updateSlugFromTitle} />
						{#if fieldErrors.name}<small class="field-error">{fieldErrors.name}</small>{/if}
					</label>
				{:else}
					<label>
						category title
						<input maxlength="120" bind:value={form.title} aria-invalid={Boolean(fieldErrors.title)} onblur={updateSlugFromTitle} />
						{#if fieldErrors.title}<small class="field-error">{fieldErrors.title}</small>{/if}
					</label>
				{/if}
				<EditorSlugField id="supporting-slug" value={form.slug ?? ""} maxLength={96} onChange={(value) => form.slug = value} error={fieldErrors.slug} />
			</div>
		</section>

		{#if form.kind === "author"}
			<section aria-labelledby="bio-heading">
				<div class="section-heading">
					<span>02</span>
					<div>
						<h2 id="bio-heading">bio</h2>
						<p>A simple author bio. Rich formatting comes with the later Post body editor.</p>
					</div>
				</div>
				<div class="fields">
					<label>
						bio
						<textarea rows="8" bind:value={bioText} readonly={!bioPlainTextEditable || archived} aria-readonly={!bioPlainTextEditable || archived} aria-invalid={Boolean(fieldErrors.bio)}></textarea>
						{#if bioPlainTextEditable}
							<small>Plain paragraph text can be edited here.</small>
						{:else}
							<small>This bio contains headings, lists, quotes, or text styling. It is read-only here and will be saved unchanged.</small>
						{/if}
						{#if fieldErrors.bio}<small class="field-error">{fieldErrors.bio}</small>{/if}
					</label>
				</div>
			</section>
			{#if mediaLoading}
				<p class="empty-inline" role="status">loading linked portrait…</p>
			{:else if mediaError}
				<p class="error" role="alert">Could not load the linked portrait.</p>
			{:else if portraitItems.length > 0}
				<section aria-labelledby="portrait-heading">
					<div class="section-heading">
						<span>03</span>
						<div>
							<h2 id="portrait-heading">portrait review</h2>
							<p>Review the existing portrait and add a factual description before publishing.</p>
						</div>
					</div>
					<BlogMediaReview
						items={portraitItems}
						{mediaById}
						mediaBaseUrl={mediaBaseUrl}
						disabled={archived}
						onAltTextChange={updatePortraitAltText}
					/>
				</section>
			{/if}
		{:else}
			<section aria-labelledby="description-heading">
				<div class="section-heading">
					<span>02</span>
					<div>
						<h2 id="description-heading">description</h2>
						<p>Optional short category context for future list and filter surfaces.</p>
					</div>
				</div>
				<div class="fields">
					<label>
						description
						<textarea rows="5" maxlength="500" bind:value={form.description} aria-invalid={Boolean(fieldErrors.description)}></textarea>
						{#if fieldErrors.description}<small class="field-error">{fieldErrors.description}</small>{/if}
					</label>
				</div>
			</section>
		{/if}

		{#if slugChanged}
			<PublishedSlugChange step={String(3 + supportingSectionOffset)} fromSlug={publishedSlug} toSlug={draftSlug} bind:checked={lifecycle.acknowledgeSlugChange} />
		{/if}

		{#if editorState.draft}
			<section aria-labelledby="draft-actions-heading">
				<div class="section-heading">
					<span>{String(3 + supportingSectionOffset + (slugChanged ? 1 : 0))}</span>
					<div>
						<h2 id="draft-actions-heading">draft actions</h2>
						<p>Discard the current draft and return to the published version.</p>
					</div>
				</div>
				<button type="button" onclick={() => void lifecycle.discardDraft()} disabled={archived}>discard draft</button>
			</section>
		{/if}

		<section aria-labelledby="lifecycle-heading">
			<div class="section-heading">
				<span>{String(3 + supportingSectionOffset + (slugChanged ? 1 : 0) + (editorState.draft ? 1 : 0))}</span>
				<div>
					<h2 id="lifecycle-heading">archive and recovery</h2>
					<p>Archive removes this document from the public site and editor lists. You can restore it later.</p>
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


	.error,
	.field-error {
		color: var(--admin-danger, #ff8f8f);
	}

	.error {
		margin: 0 0 16px;
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
</style>
