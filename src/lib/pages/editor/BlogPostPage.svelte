<script lang="ts">
import { goto } from "$app/navigation";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import {
	blogDocumentLabel,
	copyPostDraft,
	defaultPresentationForFormat,
	hasPostErrors,
	serializePostDraft,
	slugifyBlogTitle,
	validatePostMetadataForPublish,
	type BlogSupportingEditorSummary,
	type PostDraft,
	type PostEditorState,
	type PostFieldErrors,
	type PostFormat,
} from "../../blogEditor";
import { getAdminConfig } from "../../config";
import "../../styles/editorial-page.css";

let { documentId }: { documentId: string } = $props();

const config = getAdminConfig();
const blogApi = config.api.blogContent;
const postApi = config.api.postContent;
const blogConfig = config.editor?.blog;
if (!blogApi || !postApi || !blogConfig) {
	throw new Error("Blog editor is not configured for this host");
}

const baseHref = blogConfig.baseHref ?? "/admin/editor/blog";
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
let authors = $derived(
	((authorsQuery.data as BlogSupportingEditorSummary[] | undefined) ?? [])
		.filter((item) => item.publishedRevisionId && !item.archivedAt),
);
let categories = $derived(
	((categoriesQuery.data as BlogSupportingEditorSummary[] | undefined) ?? [])
		.filter((item) => item.publishedRevisionId && !item.archivedAt),
);
let form = $state<PostDraft>(copyPostDraft(undefined));
let initializedRevisionId = $state<string | null>(null);
let saveState = $state<"loading" | "saved" | "dirty" | "saving" | "error">("loading");
let saveError = $state("");
let publishState = $state<"idle" | "publishing" | "error">("idle");
let publishError = $state("");
let fieldErrors = $state<PostFieldErrors>({});
let acknowledgeSlugChange = $state(false);
let currentJson = $derived(serializePostDraft(normalizedDraft()));
let lastSavedJson = $state("");
let publishedDraft = $derived(editorState?.published?.draft);
let activeRevision = $derived(editorState?.draft ?? editorState?.published ?? null);
let publishedSlug = $derived(publishedDraft?.slug?.trim() || "");
let draftSlug = $derived(form.slug?.trim() || "");
let slugChanged = $derived(Boolean(publishedSlug && draftSlug && publishedSlug !== draftSlug));

$effect(() => {
	if (!activeRevision || initializedRevisionId === activeRevision.revisionId) return;
	form = copyPostDraft(activeRevision.draft);
	initializedRevisionId = activeRevision.revisionId;
	lastSavedJson = serializePostDraft(form);
	saveState = "saved";
	fieldErrors = {};
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
		authorDocumentId: draft.authorDocumentId || undefined,
		categories: draft.categories.filter((category) => category.documentId),
	};
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
	if (!editorState) return;
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
	if (!editorState) return;
	const draft = normalizedDraft();
	fieldErrors = validatePostMetadataForPublish(draft);
	if (hasPostErrors(fieldErrors)) return;
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
	if (!editorState?.draft) return;
	saveError = "";
	try {
		await client.mutation(postEditorApi.discardDraft, {
			documentId,
			draftRevisionId: editorState.draft.revisionId,
		});
		if (editorState.published) {
			form = copyPostDraft(editorState.published.draft);
			lastSavedJson = serializePostDraft(form);
		}
	} catch (error) {
		saveState = "error";
		saveError = error instanceof Error ? error.message : "Could not discard this draft.";
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
				<p class="description">Edit the Post metadata and publication identity. Body and media authoring arrive in the next Blog slice.</p>
			</div>
			<div class="header-actions">
				<span class="save-status">{saveState}</span>
				<button type="button" onclick={() => void saveDraft()} disabled={saveState === "saving"}>
					save draft
				</button>
				<button type="button" class="primary" onclick={() => void publishDraft()} disabled={publishState === "publishing"}>
					{publishState === "publishing" ? "publishing…" : "publish"}
				</button>
			</div>
		</header>

		{#if saveError}<p class="error" role="alert">{saveError}</p>{/if}
		{#if publishError}<p class="error" role="alert">{publishError}</p>{/if}

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
					<small>Used as the public excerpt until body editing lands.</small>
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
					<p>Only published supporting records are offered here so a public Post cannot point at hidden content.</p>
				</div>
			</div>
			<div class="fields two">
				<label>
					author
					<select bind:value={form.authorDocumentId} aria-invalid={Boolean(fieldErrors.authorDocumentId)}>
						<option value="">choose an author</option>
						{#each authors as author}
							<option value={author.documentId}>{blogDocumentLabel(author)}</option>
						{/each}
					</select>
					{#if fieldErrors.authorDocumentId}<small class="field-error">{fieldErrors.authorDocumentId}</small>{/if}
				</label>
			</div>
			<div class="checkbox-list" aria-label="categories">
				{#if categories.length === 0}
					<p class="empty-inline">No published categories yet.</p>
				{:else}
					{#each categories as category}
						<label class="check">
							<input
								type="checkbox"
								checked={categoryChecked(category.documentId)}
								onchange={(event) => toggleCategory(category.documentId, event.currentTarget.checked)}
							/>
							<span>{blogDocumentLabel(category)}</span>
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
					<p>Saved drafts preserve the existing body graph, but body editing is intentionally deferred.</p>
				</div>
			</div>
			{#if fieldErrors.body}<p class="notice" role="status">{fieldErrors.body}</p>{/if}
			<p class="empty-inline">{form.body.blocks.length} body blocks currently stored.</p>
		</section>

		{#if slugChanged}
			<section aria-labelledby="slug-change-heading">
				<div class="section-heading">
					<span>06</span>
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
					<span>{slugChanged ? "07" : "06"}</span>
					<div>
						<h2 id="draft-actions-heading">draft actions</h2>
						<p>Discard only clears the current draft pointer; immutable history stays available server-side.</p>
					</div>
				</div>
				<button type="button" onclick={() => void discardDraft()}>discard draft</button>
			</section>
		{/if}
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

	.empty-inline,
	.notice {
		margin: 0;
		color: var(--admin-text-muted);
	}

	.notice {
		margin-bottom: 8px;
		color: var(--admin-warning, #e6c26a);
	}

	@media (max-width: 820px) {
		.fields.two {
			grid-template-columns: 1fr;
		}
	}
</style>
