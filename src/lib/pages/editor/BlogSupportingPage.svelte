<script lang="ts">
import { goto } from "$app/navigation";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import {
	authorBioFromText,
	authorBioToText,
	copyBlogSupportingDraft,
	hasBlogSupportingErrors,
	serializeBlogSupportingDraft,
	slugifyBlogTitle,
	validateBlogSupportingForPublish,
	type BlogSupportingDraft,
	type BlogSupportingEditorState,
	type BlogSupportingFieldErrors,
	type BlogSupportingKind,
} from "../../blogEditor";
import { getAdminConfig } from "../../config";
import "../../styles/editorial-page.css";

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
const client = useAdminClient();
const editorQuery = useQuery(editorApi.getEditorState, () => ({ documentId }));

let editorState = $derived(editorQuery.data as BlogSupportingEditorState | undefined);
let form = $state<BlogSupportingDraft>({ kind: "author", name: "", slug: "" });
let bioText = $state("");
let initializedRevisionId = $state<string | null>(null);
let saveState = $state<"loading" | "saved" | "dirty" | "saving" | "error">("loading");
let saveError = $state("");
let publishState = $state<"idle" | "publishing" | "error">("idle");
let publishError = $state("");
let fieldErrors = $state<BlogSupportingFieldErrors>({});
let acknowledgeSlugChange = $state(false);
let currentJson = $derived(serializeBlogSupportingDraft(normalizedDraft()));
let lastSavedJson = $state("");
let publishedDraft = $derived(editorState?.published?.draft);
let activeRevision = $derived(editorState?.draft ?? editorState?.published ?? null);
let backHref = $derived(`${baseHref}`);
let publishedSlug = $derived(publishedDraft?.slug?.trim() || "");
let draftSlug = $derived(form.slug?.trim() || "");
let slugChanged = $derived(Boolean(publishedSlug && draftSlug && publishedSlug !== draftSlug));

$effect(() => {
	if (!activeRevision || initializedRevisionId === activeRevision.revisionId) return;
	form = copyBlogSupportingDraft(activeRevision.draft, kind);
	bioText = form.kind === "author" ? authorBioToText(form.bio) : "";
	initializedRevisionId = activeRevision.revisionId;
	lastSavedJson = serializeBlogSupportingDraft(form);
	saveState = "saved";
	fieldErrors = {};
	acknowledgeSlugChange = false;
});

$effect(() => {
	if (saveState === "loading") return;
	saveState = currentJson === lastSavedJson ? "saved" : "dirty";
});

function normalizedDraft(): BlogSupportingDraft {
	if (form.kind === "author") {
		return {
			kind: "author",
			name: form.name ?? "",
			slug: form.slug ?? "",
			bio: authorBioFromText(bioText),
		};
	}
	return {
		kind: "category",
		title: form.title ?? "",
		slug: form.slug ?? "",
		description: form.description ?? "",
	};
}

function updateSlugFromTitle() {
	if (form.kind === "author") form.slug = slugifyBlogTitle(form.name ?? "");
	else form.slug = slugifyBlogTitle(form.title ?? "");
}

async function saveDraft() {
	if (!editorState) return;
	const draft = normalizedDraft();
	saveState = "saving";
	saveError = "";
	try {
		const result = await client.mutation(editorApi.saveDraft, {
			documentId,
			expectedDraftRevisionId: editorState.draft?.revisionId,
			draft,
		}) as { revisionId: string };
		lastSavedJson = serializeBlogSupportingDraft(draft);
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
	fieldErrors = validateBlogSupportingForPublish(draft);
	if (hasBlogSupportingErrors(fieldErrors)) return;
	if (slugChanged && !acknowledgeSlugChange) {
		publishError = "Confirm the public URL change before publishing.";
		publishState = "error";
		return;
	}
	publishState = "publishing";
	publishError = "";
	try {
		let draftRevisionId = editorState.draft?.revisionId;
		if (serializeBlogSupportingDraft(draft) !== lastSavedJson || !draftRevisionId) {
			const saved = await client.mutation(editorApi.saveDraft, {
				documentId,
				expectedDraftRevisionId: editorState.draft?.revisionId,
				draft,
			}) as { revisionId: string };
			draftRevisionId = saved.revisionId;
			lastSavedJson = serializeBlogSupportingDraft(draft);
		}
		await client.mutation(editorApi.publish, {
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
		await client.mutation(editorApi.discardDraft, {
			documentId,
			draftRevisionId: editorState.draft.revisionId,
		});
		if (editorState.published) {
			form = copyBlogSupportingDraft(editorState.published.draft, kind);
			bioText = form.kind === "author" ? authorBioToText(form.bio) : "";
			lastSavedJson = serializeBlogSupportingDraft(form);
		}
	} catch (error) {
		saveState = "error";
		saveError = error instanceof Error ? error.message : "Could not discard this draft.";
	}
}
</script>

<svelte:head><title>{kind} — {config.siteName}</title></svelte:head>

{#if editorState === undefined}
	<p class="loading" role="status">loading {kind}…</p>
{:else if editorState.kind !== kind}
	<section class="settings-page">
		<a class="back" href={backHref}>← blog</a>
		<h1>wrong document type</h1>
		<p class="description">This document is a {editorState.kind}, not a {kind}.</p>
	</section>
{:else}
	<div class="settings-page">
		<header class="settings-header">
			<div>
				<a class="back" href={backHref}>← blog</a>
				<h1>{kind === "author" ? "author" : "category"}</h1>
				<p class="description">Edit supporting Blog content. Full Post body authoring arrives in a later slice.</p>
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
				<label>
					URL name
					<input maxlength="96" bind:value={form.slug} aria-invalid={Boolean(fieldErrors.slug)} />
					<small>Lowercase words separated by hyphens.</small>
					{#if fieldErrors.slug}<small class="field-error">{fieldErrors.slug}</small>{/if}
				</label>
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
						<textarea rows="8" bind:value={bioText} aria-invalid={Boolean(fieldErrors.bio)}></textarea>
						{#if fieldErrors.bio}<small class="field-error">{fieldErrors.bio}</small>{/if}
					</label>
				</div>
			</section>
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
			<section aria-labelledby="slug-change-heading">
				<div class="section-heading">
					<span>03</span>
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
					<span>{slugChanged ? "04" : "03"}</span>
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

	.error,
	.field-error {
		color: var(--admin-danger, #ff8f8f);
	}

	.error {
		margin: 0 0 16px;
	}
</style>
