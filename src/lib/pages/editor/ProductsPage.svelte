<script lang="ts">
import { goto } from "$app/navigation";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import { getCatalogProductEditorCapability } from "../../catalogProductCapability";
import {
	catalogProductLabel,
	catalogProductStatus,
	emptyCatalogProductDraft,
	newCatalogProductKey,
	slugifyCatalogProductTitle,
	type CatalogProductEditorSummary,
} from "../../catalogProductEditor";
import { getAdminConfig } from "../../config";
import "../../styles/editorial-page.css";

const config = getAdminConfig();
const capability = getCatalogProductEditorCapability(config);
if (!capability) {
	throw new Error("Single-print product editor is not configured for this host");
}
const { api: catalogApi, settings: productsConfig } = capability;

const baseHref = productsConfig.baseHref ?? "/admin/editor/products";
const client = useAdminClient();
const productsQuery = useQuery(catalogApi.listForEditor, { siteUrl: config.siteUrl });
let products = $derived(productsQuery.data as CatalogProductEditorSummary[] | undefined);
let productsError = $derived(productsQuery.error);
let title = $state("");
let slug = $state("");
let slugEdited = $state(false);
let createState = $state<"idle" | "saving" | "error">("idle");
let createError = $state("");
let pendingProductKey = $state("");
let createdProductHref = $state("");

function updateTitle(event: Event) {
	title = (event.currentTarget as HTMLInputElement).value;
	if (!slugEdited) slug = slugifyCatalogProductTitle(title);
}
function updateSlug(event: Event) {
	slugEdited = true;
	slug = slugifyCatalogProductTitle((event.currentTarget as HTMLInputElement).value);
}
async function createProduct() {
	const normalizedTitle = title.trim();
	if (!normalizedTitle) {
		createState = "error";
		createError = "Enter a product name first.";
		return;
	}
	createState = "saving";
	createError = "";
	createdProductHref = "";
	const productKey = pendingProductKey || newCatalogProductKey("print");
	pendingProductKey = productKey;
	let result: { productId: string };
	try {
		result = await client.mutation(catalogApi.createDraft, {
			siteUrl: config.siteUrl,
			productKey,
			draft: { ...emptyCatalogProductDraft(), title: normalizedTitle, ...(slug ? { slug } : {}) },
		}) as { productId: string };
	} catch (error) {
		createState = "error";
		createError = error instanceof Error ? error.message : "Could not create the product draft.";
		return;
	}
	pendingProductKey = "";
	createdProductHref = `${baseHref}/${result.productId}`;
	createState = "idle";
	try {
		await goto(createdProductHref);
	} catch {
		createState = "error";
		createError = "The product draft was created, but it could not be opened automatically. Open it from the product list.";
	}
}
</script>

<svelte:head><title>Products — {config.siteName}</title></svelte:head>
<div class="settings-page products-page">
	<header class="settings-header">
		<div><h1>products</h1><p class="description">Create and maintain private single-print drafts. Nothing in this workspace is published to the shop yet.</p></div>
		{#if products !== undefined}<span class="count">{products.length} {products.length === 1 ? "product" : "products"}</span>{/if}
	</header>
	<section aria-labelledby="product-list-heading">
		<div class="section-heading"><span>01</span><div><h2 id="product-list-heading">single prints</h2><p>Each row is an editable draft identity. A discarded row is retained without an active draft.</p></div></div>
		{#if productsError}
			<p class="error" role="alert">Could not load product drafts. Refresh this page to try again.</p>
		{:else if products === undefined}
			<p class="empty" role="status">Loading product drafts…</p>
		{:else if products.length === 0}
			<p class="empty"><strong>No product drafts yet.</strong><span>Create the first single print when its basic pricing is ready to enter.</span></p>
		{:else}
			<div class="product-list">
				{#each products as product (product.productId)}
					<a class="page-entry" href={`${baseHref}/${product.productId}`}>
						<span><strong>{catalogProductLabel(product)}</strong><small>{product.slug ? `/${product.slug}` : "No URL name"} · {product.draft?.variantCount ?? 0} {product.draft?.variantCount === 1 ? "variant" : "variants"}</small></span>
						<span class:discarded={catalogProductStatus(product) === "discarded"} class="status">{catalogProductStatus(product)}</span>
					</a>
				{/each}
			</div>
		{/if}
	</section>
	<section aria-labelledby="new-product-heading">
		<div class="section-heading"><span>02</span><div><h2 id="new-product-heading">new single print</h2><p>Start with its working name and URL name. Options and prices are added inside the draft.</p></div></div>
		<form onsubmit={(event) => { event.preventDefault(); void createProduct(); }}>
				<div class="fields two-column">
					<label>product name<input maxlength="160" value={title} oninput={updateTitle} autocomplete="off" /></label>
					<label>URL name<input maxlength="96" value={slug} oninput={updateSlug} autocomplete="off" spellcheck="false" /><small>Lowercase words separated by hyphens.</small></label>
				</div>
				<button type="submit" disabled={createState === "saving" || Boolean(createdProductHref)}>{createdProductHref ? "draft created" : createState === "saving" ? "creating…" : "create product draft"}</button>
		</form>
		{#if createError}<p class="error" role="alert">{createError}</p>{/if}
		{#if createdProductHref}<p class="success" role="status">Product draft created. <a href={createdProductHref}>Open the product draft.</a></p>{/if}
	</section>
</div>
<style>
	.products-page { max-width: 1040px; }
	.count { color: var(--admin-text-subtle); font-size: .76rem; white-space: nowrap; }
	.product-list { display: grid; }
	.status { border: 1px solid color-mix(in srgb, var(--status-amber) 55%, transparent); border-radius: 999px; padding: 4px 9px; color: var(--status-amber); font-size: .68rem; }
	.status.discarded { border-color: var(--admin-border-strong); color: var(--admin-text-subtle); }
	.empty { display: grid; gap: 7px; margin: 0; padding: 20px; border: 1px dashed var(--admin-border); border-radius: 10px; color: var(--admin-text-muted); }
	.empty strong { color: var(--admin-heading); font-weight: 500; }
	form { display: grid; gap: 18px; } form button { justify-self: start; }
	.error { margin: 16px 0 0; color: var(--admin-danger, var(--status-rose)); }
	.success { margin: 16px 0 0; color: var(--status-sage); } .success a { color: inherit; }
</style>
