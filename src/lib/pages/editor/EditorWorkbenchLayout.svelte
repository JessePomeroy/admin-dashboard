<script lang="ts">
import type { Snippet } from "svelte";

let {
	variant,
	selected = false,
	supportingView = false,
	taxonomy,
	collection,
	document,
}: {
	variant: "product" | "portfolio" | "blog";
	selected?: boolean;
	supportingView?: boolean;
	taxonomy?: Snippet;
	collection: Snippet;
	document: Snippet;
} = $props();
</script>

<div class="workbench-grid" class:product={variant === "product"} class:portfolio={variant === "portfolio"} class:blog={variant === "blog"} class:has-selection={selected} class:supporting-view={supportingView}>
	{#if taxonomy}{@render taxonomy()}{/if}
	{@render collection()}
	{@render document()}
</div>

<style>
.workbench-grid { display: grid; min-height: calc(100vh - var(--editor-header-height, 64px)); }
.product { grid-template-columns: 128px 232px minmax(0, 1fr); }
.portfolio { grid-template-columns: 18rem minmax(520px, 1fr); }
.blog { grid-template-columns: minmax(220px, 238px) minmax(520px, 1fr); }
@media (min-width: 641px) and (max-width: 1279px) {
	.product { grid-template-columns: 180px minmax(0, 1fr); }
	.product :global(.document-pane) { display: none; }
	.product.has-selection :global(.taxonomy-pane), .product.has-selection :global(.collection-pane) { display: none; }
	.product.has-selection :global(.document-pane) { display: block; grid-column: 1 / -1; }
}
@media (min-width: 641px) and (max-width: 1179px) {
	.portfolio, .blog { display: block; }
	.portfolio :global(.collection-pane), .portfolio :global(.document-pane), .blog :global(.collection-pane), .blog :global(.document-pane) { min-height: calc(100vh - var(--editor-header-height, 64px)); }
	.portfolio.has-selection :global(.collection-pane), .portfolio:not(.has-selection) :global(.document-pane),
	.blog.has-selection :global(.collection-pane), .blog:not(.has-selection):not(.supporting-view) :global(.document-pane), .blog.supporting-view :global(.collection-pane) { display: none; }
	.blog.supporting-view :global(.document-pane) { display: block; }
}
@media (max-width: 640px) {
	.workbench-grid { display: block; min-height: 0; }
	.product :global(.document-pane) { display: none; }
	.product.has-selection :global(.taxonomy-pane), .product.has-selection :global(.collection-pane),
	.portfolio.has-selection :global(.collection-pane), .portfolio:not(.has-selection) :global(.document-pane),
	.blog.has-selection :global(.collection-pane), .blog:not(.has-selection):not(.supporting-view) :global(.document-pane), .blog.supporting-view :global(.collection-pane) { display: none; }
	.product.has-selection :global(.document-pane), .blog.supporting-view :global(.document-pane) { display: block; }
}
</style>
