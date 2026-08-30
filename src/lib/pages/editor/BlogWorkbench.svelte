<script lang="ts">
import { goto } from "$app/navigation";
import { browser } from "$app/environment";
import { useQuery } from "convex-svelte";
import type { Snippet } from "svelte";
import { useAdminClient } from "../../adminClient";
import {
	blogDocumentLabel,
	blogDocumentStatus,
	emptyPostDraft,
	newBlogDocumentKey,
	slugifyBlogTitle,
	type PostEditorSummary,
} from "../../blogEditor";
import { getAdminConfig } from "../../config";

let {
	selectedDocumentId,
	selectedKind,
	children,
}: {
	selectedDocumentId?: string;
	selectedKind?: "post" | "author" | "category";
	children: Snippet;
} = $props();

const config = getAdminConfig();
const postApi = config.api.postContent;
const blogConfig = config.editor?.blog;
if (!postApi || !blogConfig) {
	throw new Error("Blog editor is not configured for this host");
}

const postEditorApi = postApi;
const baseHref = blogConfig.baseHref ?? "/admin/editor/blog";
const client = useAdminClient();
const postsQuery = useQuery(postEditorApi.listForEditor, { siteUrl: config.siteUrl });

let posts = $derived((postsQuery.data as PostEditorSummary[] | undefined) ?? []);
let postsLoading = $derived(postsQuery.isLoading);
let postsError = $derived(postsQuery.error);
let search = $state("");
let filter = $state<"all" | "draft" | "published" | "changed">("all");
let createState = $state<"idle" | "saving" | "error">("idle");
let createError = $state("");
let supportingTarget = $state<"authors" | "categories" | null>(null);
let normalizedSearch = $derived(search.trim().toLocaleLowerCase());
let visiblePosts = $derived(posts.filter((post) => {
	const status = blogDocumentStatus(post);
	if (filter !== "all" && status !== filter) return false;
	if (!normalizedSearch) return true;
	return `${blogDocumentLabel(post)} ${post.slug ?? ""}`
		.toLocaleLowerCase()
		.includes(normalizedSearch);
}));

$effect(() => {
	if (!browser) return;
	const syncHash = () => {
		supportingTarget = location.hash === "#authors"
			? "authors"
			: location.hash === "#categories"
				? "categories"
				: null;
	};
	syncHash();
	window.addEventListener("hashchange", syncHash);
	return () => window.removeEventListener("hashchange", syncHash);
});

function statusLabel(post: PostEditorSummary) {
	const status = blogDocumentStatus(post);
	return status === "changed" ? "draft changes" : status;
}

async function createPost() {
	createState = "saving";
	createError = "";
	try {
		const title = "new post";
		const result = await client.mutation(postEditorApi.createDraft, {
			siteUrl: config.siteUrl,
			documentKey: newBlogDocumentKey("post"),
			draft: {
				...emptyPostDraft(),
				title,
				slug: slugifyBlogTitle(title),
			},
		}) as { documentId: string };
		createState = "idle";
		await goto(`${baseHref}/posts/${result.documentId}`);
	} catch (error) {
		createState = "error";
		createError = error instanceof Error ? error.message : "Could not create the draft.";
	}
}
</script>

<div class="blog-workbench" class:has-selection={Boolean(selectedDocumentId)} class:supporting-view={supportingTarget !== null}>
	<header class="workbench-heading">
		<div>
			<h1>editorial workspace</h1>
		</div>
		<nav aria-label="Blog collections">
			<a href={baseHref} aria-current={selectedKind === "post" || (!selectedKind && supportingTarget === null) ? "page" : undefined} onclick={() => supportingTarget = null}>posts</a>
			<a href={`${baseHref}#authors`} aria-current={selectedKind === "author" || (!selectedKind && supportingTarget === "authors") ? "page" : undefined} onclick={() => supportingTarget = "authors"}>authors</a>
			<a href={`${baseHref}#categories`} aria-current={selectedKind === "category" || (!selectedKind && supportingTarget === "categories") ? "page" : undefined} onclick={() => supportingTarget = "categories"}>categories</a>
		</nav>
	</header>

	<div class="workbench-grid">
		<aside class="collection-pane" aria-label="Blog posts">
			<div class="collection-heading">
				<h2>posts</h2>
				<button type="button" class="new-post" onclick={() => void createPost()} disabled={createState === "saving"}>
					{createState === "saving" ? "creating…" : "new post"}
				</button>
			</div>

			<label class="search-field">
				<span>search posts</span>
				<input type="search" placeholder="Search title or URL" bind:value={search} />
			</label>

			<div class="filters" aria-label="Filter posts">
				{#each ["all", "draft", "published", "changed"] as option}
					<button
						type="button"
						class:active={filter === option}
						aria-pressed={filter === option}
						onclick={() => filter = option as typeof filter}
					>
						{option === "changed" ? "changed" : option}
					</button>
				{/each}
			</div>

			{#if createError}<p class="collection-error" role="alert">{createError}</p>{/if}
			{#if postsLoading}
				<p class="collection-empty" role="status">loading posts…</p>
			{:else if postsError}
				<p class="collection-error" role="alert">Could not load posts.</p>
			{:else if visiblePosts.length === 0}
				<p class="collection-empty">{posts.length === 0 ? "No posts yet." : "No posts match this view."}</p>
			{:else}
				<div class="post-list">
					{#each visiblePosts as post}
						<a
							href={`${baseHref}/posts/${post.documentId}`}
							class:selected={selectedDocumentId === post.documentId}
							aria-current={selectedDocumentId === post.documentId ? "page" : undefined}
						>
							<strong>{blogDocumentLabel(post)}</strong>
							<span>{post.slug ? `/${post.slug}` : "No public URL"}</span>
							<small>{statusLabel(post)}</small>
						</a>
					{/each}
				</div>
			{/if}
		</aside>

		<section class="document-pane" id="blog-document-pane" aria-label="Blog document">
			{@render children()}
		</section>
	</div>
</div>

<style>
	.blog-workbench {
		min-height: 100%;
		background: var(--admin-bg);
		color: var(--admin-text);
	}

	.workbench-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 20px;
		padding: 13px 20px 12px;
		border-bottom: 1px solid var(--admin-border);
		background: var(--editor-canvas);
	}

	h1,
	h2 {
		margin: 0;
		color: var(--admin-heading);
		font-family: var(--admin-font-display);
		font-weight: 500;
	}

	h1 {
		font-size: clamp(1.18rem, 1.7vw, 1.48rem);
	}

	h2 {
		font-size: 1.1rem;
	}

	.workbench-heading nav {
		display: flex;
		gap: 4px;
	}

	.workbench-heading nav a {
		padding: 6px 9px;
		border-radius: 3px;
		color: var(--admin-text-muted);
		font-size: 0.76rem;
		text-decoration: none;
	}

	.workbench-heading nav a:hover,
	.workbench-heading nav a[aria-current="page"] {
		background: var(--editor-selection);
		color: var(--admin-heading);
		box-shadow: inset 0 -2px var(--admin-accent-strong);
	}

	.workbench-grid {
		display: grid;
		grid-template-columns: minmax(220px, 238px) minmax(520px, 1fr);
		min-height: calc(100vh - 69px);
	}

	.collection-pane {
		min-width: 0;
		padding: 18px 14px 32px;
		border-right: 1px solid var(--admin-border);
		background: var(--editor-collection);
	}

	.collection-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 14px;
	}

	button,
	input {
		font: inherit;
	}

	.new-post {
		border: 1px solid transparent;
		border-radius: 6px;
		padding: 8px 10px;
		background: var(--admin-accent-strong);
		color: var(--admin-bg);
		font-size: 0.72rem;
		cursor: pointer;
	}

	.new-post:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	.search-field {
		display: grid;
		gap: 7px;
		color: var(--admin-text-muted);
		font-size: 0.7rem;
	}

	.search-field input {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid var(--admin-border-strong);
		border-radius: 3px;
		padding: 8px 9px;
		background: var(--editor-control);
		color: var(--admin-heading);
	}

	.filters {
		display: flex;
		gap: 4px;
		margin: 9px 0 13px;
		overflow-x: auto;
	}

	.filters button {
		border: 0;
		border-radius: 3px;
		padding: 5px 7px;
		background: transparent;
		color: var(--admin-text-subtle);
		font-size: 0.66rem;
		cursor: pointer;
		white-space: nowrap;
	}

	.filters button:hover,
	.filters button.active {
		background: var(--admin-active);
		color: var(--admin-heading);
	}

	.post-list {
		display: grid;
		border-top: 1px solid var(--admin-border);
	}

	.post-list a {
		position: relative;
		display: grid;
		gap: 4px;
		padding: 11px 10px;
		border-bottom: 1px solid var(--admin-border);
		color: var(--admin-heading);
		text-decoration: none;
		transition: background-color 0.16s ease;
	}

	.post-list a::before {
		position: absolute;
		inset: 8px auto 8px 0;
		width: 2px;
		background: transparent;
		content: "";
	}

	.post-list a:hover {
		background: color-mix(in srgb, var(--admin-heading) 3%, transparent);
	}

	.post-list a.selected {
		background: transparent;
	}

	.post-list a.selected::before {
		background: var(--admin-accent-strong);
	}

	.post-list strong {
		font-size: 0.82rem;
		font-weight: 500;
	}

	.post-list span,
	.post-list small {
		color: var(--admin-text-subtle);
		font-size: 0.68rem;
		text-transform: none;
	}

	.post-list small {
		color: var(--admin-accent-strong);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.collection-empty,
	.collection-error {
		margin: 0;
		padding: 16px 4px;
		color: var(--admin-text-muted);
		font-size: 0.76rem;
	}

	.collection-error {
		color: var(--admin-danger, #ff8f8f);
	}

	.document-pane {
		min-width: 0;
		background: var(--editor-canvas);
	}

	:global(.blog-workbench .document-pane .settings-page) {
		max-width: none;
		box-sizing: border-box;
	}

	:global(.blog-workbench .document-pane .settings-header) {
		position: sticky;
		top: 0;
		z-index: 12;
		padding: 12px 0;
		background: color-mix(in srgb, var(--admin-bg) 94%, transparent);
		backdrop-filter: blur(12px);
	}

	button:focus-visible,
	input:focus-visible,
	a:focus-visible {
		outline: 2px solid var(--admin-accent-strong);
		outline-offset: 2px;
	}

	@media (min-width: 641px) and (max-width: 1179px) {
		.workbench-grid {
			display: block;
		}

		.collection-pane,
		.document-pane {
			min-height: calc(100vh - 69px);
		}

		.collection-pane {
			border-right: 0;
		}

		.blog-workbench.has-selection .collection-pane,
		.blog-workbench:not(.has-selection):not(.supporting-view) .document-pane,
		.blog-workbench.supporting-view .collection-pane {
			display: none;
		}

		.blog-workbench.supporting-view .document-pane {
			display: block;
		}
	}

	@media (max-width: 640px) {
		.workbench-heading {
			align-items: flex-start;
			padding: 18px 20px;
			flex-direction: column;
		}

		.workbench-heading nav {
			width: 100%;
		}

		.workbench-heading nav a {
			flex: 1;
			text-align: center;
		}

		.workbench-grid {
			display: block;
			min-height: 0;
		}

		.collection-pane {
			padding: 22px 16px 48px;
			border-right: 0;
		}

		.blog-workbench.has-selection .collection-pane,
		.blog-workbench:not(.has-selection):not(.supporting-view) .document-pane,
		.blog-workbench.supporting-view .collection-pane {
			display: none;
		}

		.blog-workbench.supporting-view .document-pane {
			display: block;
		}

		:global(.blog-workbench .document-pane .settings-header) {
			top: 56px;
		}
	}

	@media (prefers-reduced-motion: no-preference) {
		.post-list a,
		.filters button,
		.workbench-heading nav a {
			transition: color 0.16s ease, background-color 0.16s ease, border-color 0.16s ease;
		}
	}
</style>
