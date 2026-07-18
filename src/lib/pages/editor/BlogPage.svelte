<script lang="ts">
import { useQuery } from "convex-svelte";
import {
	blogDocumentLabel,
	blogDocumentStatus,
	type BlogSupportingEditorSummary,
	type PostEditorSummary,
} from "../../blogEditor";
import { getAdminConfig } from "../../config";
import "../../styles/editorial-page.css";

const config = getAdminConfig();
const blogApi = config.api.blogContent;
const postApi = config.api.postContent;
const blogConfig = config.editor?.blog;
if (!blogApi || !postApi || !blogConfig) {
	throw new Error("Blog editor is not configured for this host");
}

const baseHref = blogConfig.baseHref ?? "/admin/editor/blog";
const authorsQuery = useQuery(blogApi.listForEditor, {
	siteUrl: config.siteUrl,
	kind: "author",
});
const categoriesQuery = useQuery(blogApi.listForEditor, {
	siteUrl: config.siteUrl,
	kind: "category",
});
const postsQuery = useQuery(postApi.listForEditor, {
	siteUrl: config.siteUrl,
});

let authors = $derived(
	(authorsQuery.data as BlogSupportingEditorSummary[] | undefined) ?? [],
);
let categories = $derived(
	(categoriesQuery.data as BlogSupportingEditorSummary[] | undefined) ?? [],
);
let posts = $derived((postsQuery.data as PostEditorSummary[] | undefined) ?? []);

function statusLabel(document: BlogSupportingEditorSummary | PostEditorSummary) {
	const status = blogDocumentStatus(document);
	if (status === "changed") return "draft changes";
	return status;
}
</script>

<svelte:head><title>Blog — {config.siteName}</title></svelte:head>

<div class="settings-page">
	<header class="settings-header">
		<div>
			<h1>blog</h1>
			<p class="description">Authors, categories, and posts for the public journal. This first workspace is read-only while the detail forms arrive in the next iterations.</p>
		</div>
	</header>

	<section aria-labelledby="posts-heading">
		<div class="section-heading">
			<span>01</span>
			<div>
				<h2 id="posts-heading">posts</h2>
				<p>Draft and published Post records, newest public ordering handled by the content service.</p>
			</div>
		</div>
		{#if posts.length === 0}
			<p class="empty">No posts yet.</p>
		{:else}
			<div class="entry-list">
				{#each posts as post}
					<a class="page-entry" href={`${baseHref}/posts/${post.documentId}`}>
						<span>
							<strong>{blogDocumentLabel(post)}</strong>
							<small>{post.slug ? `/${post.slug}` : "No public slug yet"} · {statusLabel(post)}</small>
						</span>
						<span aria-hidden="true">→</span>
					</a>
				{/each}
			</div>
		{/if}
	</section>

	<section aria-labelledby="supporting-heading">
		<div class="section-heading">
			<span>02</span>
			<div>
				<h2 id="supporting-heading">supporting content</h2>
				<p>Author profiles and categories used by Posts. Active references are guarded by the shared content lifecycle.</p>
			</div>
		</div>
		<div class="support-grid">
			<div>
				<h3>authors</h3>
				{#if authors.length === 0}
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
			<div>
				<h3>categories</h3>
				{#if categories.length === 0}
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

	.empty {
		margin: 0;
		padding: 18px;
		border: 1px dashed var(--admin-border);
		border-radius: 12px;
		color: var(--admin-text-muted);
	}

	@media (max-width: 820px) {
		.support-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
