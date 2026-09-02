<script lang="ts">
	import EditorNavigation from "/home/strayblackdog/Documents/work/admin-dashboard-r8-editor-workspaces-r8-1/src/lib/components/EditorNavigation.svelte";
	import PortfolioGalleriesPage from "/home/strayblackdog/Documents/work/admin-dashboard-r8-editor-workspaces-r8-1/src/lib/pages/editor/PortfolioGalleriesPage.svelte";
	import PortfolioGalleryPage from "/home/strayblackdog/Documents/work/admin-dashboard-r8-editor-workspaces-r8-1/src/lib/pages/editor/PortfolioGalleryPage.svelte";
	import ProductPage from "/home/strayblackdog/Documents/work/admin-dashboard-r8-editor-workspaces-r8-1/src/lib/pages/editor/ProductPage.svelte";
	import ProductsPage from "/home/strayblackdog/Documents/work/admin-dashboard-r8-editor-workspaces-r8-1/src/lib/pages/editor/ProductsPage.svelte";

	const params = new URLSearchParams(location.search);
	const page = params.get("page") === "products" ? "products" : "portfolio";
	const theme = params.get("theme") ?? "dark";
	const host = params.get("host") === "rp" ? "rp" : "angels";
	const selected = params.get("selected") === "true";
	document.documentElement.classList.toggle("dark", theme === "dark");
</script>

<div data-admin class="acceptance-shell" class:host-angels={host === "angels"} class:host-rp={host === "rp"}>
	<aside class="host-rail" aria-label="Admin areas">
		<strong>{host === "rp" ? "rp" : "ar"}</strong>
		<span>⌂</span>
		<span>✦</span>
		<span>▦</span>
		<span class="active">✎</span>
	</aside>
	<EditorNavigation
		pathname={page === "products" ? (selected ? "/admin/editor/products/product-print" : "/admin/editor/products") : (selected ? "/admin/editor/portfolio/gallery-1" : "/admin/editor/portfolio")}
		siteSettingsEnabled
		pagesEnabled
		portfolioEnabled
		productsEnabled
		blogEnabled
	/>
	<main class="editor-main">
		{#if page === "products"}
			{#if selected}<ProductPage productId="product-print" />{:else}<ProductsPage />{/if}
		{:else}
			{#if selected}<PortfolioGalleryPage galleryId="gallery-1" />{:else}<PortfolioGalleriesPage />{/if}
		{/if}
	</main>
</div>

<style>
	:global(*) { box-sizing: border-box; }
	:global(html, body, #app) { margin: 0; min-height: 100%; }
	:global(body) { background: var(--admin-bg); font-family: var(--admin-font-body); }
	.acceptance-shell { min-height: 100vh; background: var(--admin-bg); color: var(--admin-text); }
	.host-rail { position: fixed; inset: 0 auto 0 0; z-index: 50; display: flex; align-items: center; width: 72px; gap: 28px; padding: 22px 0; border-right: 1px solid var(--admin-border); background: var(--admin-surface); flex-direction: column; }
	.host-rail strong { color: var(--admin-heading); font-family: var(--admin-font-display); font-size: 1.1rem; }
	.host-rail span { color: var(--admin-text-subtle); font-size: 1rem; }
	.host-rail span.active { color: var(--admin-heading); }
	.editor-main { min-width: 0; margin-left: calc(72px + var(--editor-panel-width)); max-width: calc(100vw - 72px - var(--editor-panel-width)); }
	@media (max-width: 640px) {
		.acceptance-shell { padding-top: 54px; }
		.host-rail { inset: 0 0 auto; width: auto; height: 54px; justify-content: space-around; padding: 0 14px; border-right: 0; border-bottom: 1px solid var(--admin-border); flex-direction: row; }
		.editor-main { margin-left: 0; max-width: 100vw; }
	}
</style>
