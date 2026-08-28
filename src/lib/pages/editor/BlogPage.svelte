<script lang="ts">
import { goto } from "$app/navigation";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import {
	blogDocumentLabel,
	blogDocumentStatus,
	newBlogDocumentKey,
	slugifyBlogTitle,
	type BlogSupportingEditorSummary,
	type BlogSupportingKind,
} from "../../blogEditor";
import { getAdminConfig } from "../../config";
import "../../styles/editorial-page.css";
import BlogWorkbench from "./BlogWorkbench.svelte";

const config = getAdminConfig();
const blogApi = config.api.blogContent;
const postApi = config.api.postContent;
const blogConfig = config.editor?.blog;
if (!blogApi || !postApi || !blogConfig) {
	throw new Error("Blog editor is not configured for this host");
}

const editorApi = blogApi;
const baseHref = blogConfig.baseHref ?? "/admin/editor/blog";
const client = useAdminClient();
const authorsQuery = useQuery(editorApi.listForEditor, {
	siteUrl: config.siteUrl,
	kind: "author",
});
const categoriesQuery = useQuery(editorApi.listForEditor, {
	siteUrl: config.siteUrl,
	kind: "category",
});

let authors = $derived(
	(authorsQuery.data as BlogSupportingEditorSummary[] | undefined) ?? [],
);
let authorsLoading = $derived(authorsQuery.isLoading);
let authorsError = $derived(authorsQuery.error);
let categories = $derived(
	(categoriesQuery.data as BlogSupportingEditorSummary[] | undefined) ?? [],
);
let categoriesLoading = $derived(categoriesQuery.isLoading);
let categoriesError = $derived(categoriesQuery.error);
let createState = $state<"idle" | "saving" | "error">("idle");
let createError = $state("");

function statusLabel(document: BlogSupportingEditorSummary) {
	const status = blogDocumentStatus(document);
	if (status === "changed") return "draft changes";
	return status;
}

async function createSupporting(kind: BlogSupportingKind) {
	createState = "saving";
	createError = "";
	try {
		const label = kind === "author" ? "new author" : "new category";
		const result = await client.mutation(editorApi.createDraft, {
			siteUrl: config.siteUrl,
			documentKey: newBlogDocumentKey(kind),
			draft: kind === "author"
				? { kind, name: label, slug: slugifyBlogTitle(label) }
				: { kind, title: label, slug: slugifyBlogTitle(label), description: "" },
		}) as { documentId: string };
		createState = "idle";
		await goto(`${baseHref}/${kind === "author" ? "authors" : "categories"}/${result.documentId}`);
	} catch (error) {
		createState = "error";
		createError = error instanceof Error ? error.message : "Could not create the draft.";
	}
}

</script>

<svelte:head><title>Blog — {config.siteName}</title></svelte:head>

<BlogWorkbench>
<div class="settings-page">
	<header class="settings-header">
		<div>
			<h1>blog</h1>
			<p class="description">Authors, categories, and posts for the public journal. Open a record to edit its draft, review existing images, or manage publication.</p>
		</div>
	</header>

	<section aria-labelledby="supporting-heading" id="supporting-content">
		<div class="section-heading">
			<span>02</span>
			<div>
				<h2 id="supporting-heading">supporting content</h2>
				<p>Author profiles and categories used by Posts. Active references are guarded by the shared content lifecycle.</p>
			</div>
		</div>
		{#if createError}
			<p class="error" role="alert">{createError}</p>
		{/if}
		<div class="support-grid">
			<div id="authors">
				<div class="group-heading">
					<h3>authors</h3>
					<button type="button" onclick={() => void createSupporting("author")} disabled={createState === "saving"}>
						new author
					</button>
				</div>
				{#if authorsLoading}
					<p class="empty" role="status">loading authors…</p>
				{:else if authorsError}
					<p class="error" role="alert">Could not load authors.</p>
				{:else if authors.length === 0}
					<p class="empty">No authors yet.</p>
				{:else}
					<div class="entry-list compact">
						{#each authors as author}
							<a class="page-entry" href={`${baseHref}/authors/${author.documentId}`}>
								<span>
									<strong>{blogDocumentLabel(author)}</strong>
									<small>{author.slug ? `/${author.slug}` : "No public slug yet"} · {statusLabel(author)}</small>
								</span>
								<span aria-hidden="true">→</span>
							</a>
						{/each}
					</div>
				{/if}
			</div>
			<div id="categories">
				<div class="group-heading">
					<h3>categories</h3>
					<button type="button" onclick={() => void createSupporting("category")} disabled={createState === "saving"}>
						new category
					</button>
				</div>
				{#if categoriesLoading}
					<p class="empty" role="status">loading categories…</p>
				{:else if categoriesError}
					<p class="error" role="alert">Could not load categories.</p>
				{:else if categories.length === 0}
					<p class="empty">No categories yet.</p>
				{:else}
					<div class="entry-list compact">
						{#each categories as category}
							<a class="page-entry" href={`${baseHref}/categories/${category.documentId}`}>
								<span>
									<strong>{blogDocumentLabel(category)}</strong>
									<small>{category.slug ? `/${category.slug}` : "No public slug yet"} · {statusLabel(category)}</small>
								</span>
								<span aria-hidden="true">→</span>
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</section>
</div>
</BlogWorkbench>

<style>
	.entry-list {
		display: grid;
		gap: 10px;
	}

	.entry-list.compact {
		gap: 8px;
	}

	.support-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 18px;
	}

	h3 {
		margin: 0 0 10px;
		font-family: var(--admin-font-display);
		font-size: 1rem;
		font-weight: 500;
		color: var(--admin-heading);
	}

	.group-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 10px;
	}

	.group-heading h3 {
		margin: 0;
	}

	button {
		border: 1px solid var(--admin-border);
		border-radius: 8px;
		padding: 8px 10px;
		background: transparent;
		color: var(--admin-heading);
		font: inherit;
		cursor: pointer;
	}

	button:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	button:hover:not(:disabled) {
		background: var(--admin-active);
	}

	.empty {
		margin: 0;
		padding: 18px;
		border: 1px dashed var(--admin-border);
		border-radius: 12px;
		color: var(--admin-text-muted);
	}

	.error {
		margin: 0 0 16px;
		color: var(--admin-danger, #ff8f8f);
	}

	@media (max-width: 820px) {
		.support-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
