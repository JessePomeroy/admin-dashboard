<script lang="ts">
import { getCatalogProductEditorCapability } from "../../catalogProductCapability";
import { getAdminConfig } from "../../config";
import "../../styles/editorial-page.css";
import ProductWorkbench from "./ProductWorkbench.svelte";

const config = getAdminConfig();
const capability = getCatalogProductEditorCapability(config);
if (!capability) {
	throw new Error("Single-print product editor is not configured for this host");
}
const { graphVersion } = capability;
</script>

<svelte:head><title>Products — {config.siteName}</title></svelte:head>

<ProductWorkbench>
	<div class="product-overview">
		<p class="eyebrow">workspace guide</p>
		<h2>{graphVersion === 2 ? "review the private catalog" : "shape a product draft"}</h2>
		<p>{graphVersion === 2
			? "Use taxonomy and collection filters to find an imported product. The selected record keeps its draft, media, variant, fulfillment, and Convex publication evidence together."
			: "Choose an existing single print or create a private draft. Pricing and fulfillment stay inside the selected record."}</p>
		<div class="workflow-grid">
			<div><span>01</span><strong>find</strong><p>Filter by the product kinds this host actually supports, then search by name or URL.</p></div>
			<div><span>02</span><strong>shape</strong><p>Review product details, sale settings, variants, media, and verified fulfillment assets.</p></div>
			<div><span>03</span><strong>release</strong><p>Save private draft work first. Convex publication and the public Shop remain explicit, separate authorities.</p></div>
		</div>
	</div>
</ProductWorkbench>

<style>
	.product-overview { max-width: 780px; padding: 42px 38px 96px; }
	.eyebrow { margin: 0; color: var(--admin-text-subtle); font-size: .6rem; letter-spacing: .16em; text-transform: uppercase; }
	h2 { margin: 8px 0 0; color: var(--admin-heading); font-family: var(--admin-font-heading); font-size: clamp(1.45rem, 2.3vw, 2.2rem); font-weight: 500; letter-spacing: -.03em; text-transform: lowercase; }
	.product-overview > p:not(.eyebrow) { max-width: 620px; margin: 14px 0 0; color: var(--admin-text-muted); font-size: .85rem; line-height: 1.7; }
	.workflow-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 34px; }
	.workflow-grid div { border: 1px solid var(--admin-border); border-radius: 10px; padding: 17px; background: color-mix(in srgb, var(--admin-surface) 72%, transparent); }
	.workflow-grid span { color: var(--admin-text-subtle); font-size: .58rem; letter-spacing: .12em; }
	.workflow-grid strong { display: block; margin-top: 18px; color: var(--admin-heading); font-size: .78rem; font-weight: 500; text-transform: lowercase; }
	.workflow-grid p { margin: 7px 0 0; color: var(--admin-text-muted); font-size: .7rem; line-height: 1.55; }
	@media (max-width: 840px) { .workflow-grid { grid-template-columns: 1fr; } }
	@media (max-width: 640px) { .product-overview { padding: 28px 20px 72px; } }
</style>
