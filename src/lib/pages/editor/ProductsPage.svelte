<script lang="ts">
import { getCatalogProductEditorCapability } from "../../catalogProductCapability";
import { getAdminConfig } from "../../config";
import "../../styles/editorial-page.css";
import ProductWorkbench from "./ProductWorkbench.svelte";

const config = getAdminConfig();
if (!getCatalogProductEditorCapability(config)) {
	throw new Error("Single-print product editor is not configured for this host");
}
</script>

<svelte:head><title>Products — {config.siteName}</title></svelte:head>

<ProductWorkbench>
	<div class="product-overview">
		<span>products</span>
		<h2>choose a product</h2>
		<p>Select one from the list, or create a new product draft.</p>
	</div>
</ProductWorkbench>

<style>
	.product-overview { max-width: 620px; padding: clamp(38px, 7vw, 86px) clamp(28px, 6vw, 72px) 96px; }
	.product-overview > span { color: var(--admin-accent-strong); font-size: .62rem; letter-spacing: .12em; text-transform: uppercase; }
	h2 { margin: 0; color: var(--admin-heading); font-family: var(--admin-font-display); font-size: clamp(1.3rem, 2vw, 1.8rem); font-weight: 500; letter-spacing: -.03em; text-transform: lowercase; }
	.product-overview > span + h2 { margin-top: 11px; }
	.product-overview > p { max-width: 48ch; margin: 12px 0 0; color: var(--admin-text-muted); font-size: .82rem; line-height: 1.65; }
	@media (max-width: 640px) { .product-overview { padding: 28px 20px 72px; } }
</style>
