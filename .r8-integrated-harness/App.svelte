<script lang="ts">
	import EditorNavigation from "../src/lib/components/EditorNavigation.svelte";
	import BlogPage from "../src/lib/pages/editor/BlogPage.svelte";
	import BlogPostPage from "../src/lib/pages/editor/BlogPostPage.svelte";

	const params = new URLSearchParams(location.search);
	const state = params.get("state") ?? "selected";
	const theme = params.get("theme") ?? "dark";
	const collectionState = ["collection", "loading", "error", "empty"].includes(state);
	document.documentElement.classList.toggle("dark", theme === "dark");
</script>

<div data-admin class="acceptance-shell">
	<aside class="host-rail" aria-label="Admin areas">
		<strong>ar</strong>
		<span>⌂</span>
		<span>✦</span>
		<span>▦</span>
		<span class="active">✎</span>
	</aside>
	<EditorNavigation
		pathname={collectionState ? "/admin/editor/blog" : "/admin/editor/blog/post-changed"}
		siteSettingsEnabled
		pagesEnabled
		portfolioEnabled
		productsEnabled
		blogEnabled
	/>
	<main class="editor-main">
		{#if collectionState}
			<BlogPage />
		{:else}
			<BlogPostPage documentId={state === "published" ? "post-published" : "post-changed"} />
		{/if}
	</main>
</div>

<style>
	:global(*) { box-sizing: border-box; }
	:global(html, body, #app) { margin: 0; min-height: 100%; }
	:global(body) { background: var(--admin-bg); font-family: var(--admin-font-body); }
	.acceptance-shell {
		min-height: 100vh;
		background: var(--admin-bg);
		color: var(--admin-text);
	}
	.host-rail {
		position: fixed;
		inset: 0 auto 0 0;
		z-index: 50;
		display: flex;
		align-items: center;
		width: 72px;
		gap: 28px;
		padding: 22px 0;
		border-right: 1px solid var(--admin-border);
		background: var(--admin-surface);
		flex-direction: column;
	}
	.host-rail strong { color: var(--admin-heading); font-family: var(--admin-font-display); font-size: 1.1rem; }
	.host-rail span { color: var(--admin-text-subtle); font-size: 1rem; }
	.host-rail span.active { color: var(--admin-heading); }
	.editor-main {
		min-width: 0;
		margin-left: calc(72px + var(--editor-panel-width));
		max-width: calc(100vw - 72px - var(--editor-panel-width));
	}
	@media (max-width: 640px) {
		.acceptance-shell { padding-top: 54px; }
		.host-rail {
			inset: 0 0 auto;
			width: auto;
			height: 54px;
			justify-content: space-around;
			padding: 0 14px;
			border-right: 0;
			border-bottom: 1px solid var(--admin-border);
			flex-direction: row;
		}
		.editor-main { margin-left: 0; max-width: 100vw; }
	}
</style>
