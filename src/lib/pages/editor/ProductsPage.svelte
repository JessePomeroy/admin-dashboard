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
const { graphVersion, media, privateAssets, publication, publishesToShop } = capability;
const recordAreas = [
	"draft details",
	"variants",
	...(media ? ["media"] : []),
	...(privateAssets ? ["verified asset replacement"] : []),
	...(publication ? ["Convex publication evidence"] : []),
];

function readableList(values: string[]) {
	if (values.length === 1) return values[0];
	if (values.length === 2) return `${values[0]} and ${values[1]}`;
	return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}
</script>

<svelte:head><title>Products — {config.siteName}</title></svelte:head>

<ProductWorkbench>
	<div class="product-overview">
		<h2>{graphVersion === 2 ? "build your catalog" : "shape a product draft"}</h2>
		<p>{graphVersion === 2
			? `Create a product or choose an existing one. Each record keeps ${readableList(recordAreas)} together from first draft through release.`
			: `Choose an existing single print or create a private draft. The selected record keeps ${readableList(recordAreas)} together.`}</p>
		<div class="workflow-grid">
			<div><span>01</span><strong>start</strong><p>Create the product kind you need, or filter and search the existing catalog.</p></div>
			<div><span>02</span><strong>shape</strong><p>Add the copy, price, variants, display media, and fulfillment assets needed to sell it.</p></div>
			<div><span>03</span><strong>release</strong><p>{publication
				? publishesToShop
					? "Save the private draft first, then publish that exact revision to your Shop."
					: "Save private draft work first. This host exposes Convex publication, while its public catalog remains separately configured."
				: "Save private draft work here. This host exposes no Convex publication control; the public Shop remains a separate authority."}</p></div>
		</div>
	</div>
</ProductWorkbench>

<style>
	.product-overview { max-width: 780px; padding: 30px 28px 72px; }
	h2 { margin: 0; color: var(--admin-heading); font-family: var(--admin-font-heading); font-size: clamp(1.3rem, 2vw, 1.8rem); font-weight: 500; letter-spacing: -.03em; text-transform: lowercase; }
	.product-overview > p { max-width: 620px; margin: 14px 0 0; color: var(--admin-text-muted); font-size: .85rem; line-height: 1.7; }
	.workflow-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; margin-top: 28px; border-top: 1px solid var(--admin-border-strong); }
	.workflow-grid div { border-right: 1px solid var(--admin-border); padding: 16px 18px 16px 0; background: transparent; }
	.workflow-grid div + div { padding-left: 18px; }
	.workflow-grid div:last-child { border-right: 0; }
	.workflow-grid span { color: var(--admin-text-subtle); font-size: .58rem; letter-spacing: .12em; }
	.workflow-grid strong { display: block; margin-top: 12px; color: var(--admin-heading); font-size: .78rem; font-weight: 500; text-transform: lowercase; }
	.workflow-grid p { margin: 7px 0 0; color: var(--admin-text-muted); font-size: .7rem; line-height: 1.55; }
	@media (max-width: 840px) { .workflow-grid { grid-template-columns: 1fr; } }
	@media (max-width: 640px) { .product-overview { padding: 28px 20px 72px; } }
</style>
