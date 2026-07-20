<script lang="ts">
import { goto } from "$app/navigation";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import { getCatalogProductEditorCapability } from "../../catalogProductCapability";
import {
	catalogProductKindLabel,
	catalogProductLabel,
	catalogProductStatus,
	emptyCatalogProductDraft,
	newCatalogProductKey,
	slugifyCatalogProductTitle,
	type CatalogProductEditorSummary,
	type CatalogProductKind,
} from "../../catalogProductEditor";
import { getAdminConfig } from "../../config";
import "../../styles/editorial-page.css";

const config = getAdminConfig();
const capability = getCatalogProductEditorCapability(config);
if (!capability) {
	throw new Error("Single-print product editor is not configured for this host");
}
const { api: catalogApi, enabledKinds, graphVersion, settings: productsConfig } = capability;

const baseHref = productsConfig.baseHref ?? "/admin/editor/products";
const client = useAdminClient();

function queryArgs(kind: CatalogProductKind) {
	if (!enabledKinds.includes(kind)) return "skip";
	if (graphVersion === 1) return kind === "print" ? { siteUrl: config.siteUrl } : "skip";
	return { siteUrl: config.siteUrl, productKind: kind };
}

const printQuery = useQuery(catalogApi.listForEditor, () => queryArgs("print"));
const printSetQuery = useQuery(catalogApi.listForEditor, () => queryArgs("print_set"));
const postcardQuery = useQuery(catalogApi.listForEditor, () => queryArgs("postcard"));
const merchandiseQuery = useQuery(catalogApi.listForEditor, () => queryArgs("merchandise"));
const tapestryQuery = useQuery(catalogApi.listForEditor, () => queryArgs("tapestry"));
const digitalQuery = useQuery(catalogApi.listForEditor, () => queryArgs("digital_download"));
const productQueries = [
	{ kind: "print", query: printQuery },
	{ kind: "print_set", query: printSetQuery },
	{ kind: "postcard", query: postcardQuery },
	{ kind: "merchandise", query: merchandiseQuery },
	{ kind: "tapestry", query: tapestryQuery },
	{ kind: "digital_download", query: digitalQuery },
] as const satisfies readonly {
	kind: CatalogProductKind;
	query: ReturnType<typeof useQuery>;
}[];

let productGroups = $derived(productQueries
	.filter(({ kind }) => enabledKinds.includes(kind))
	.map(({ kind, query }) => ({
		kind,
		products: query.data as CatalogProductEditorSummary[] | undefined,
		error: query.error,
	})));
let products = $derived(productGroups.flatMap((group) => group.products ?? []));
let loading = $derived(productGroups.some((group) => group.products === undefined && !group.error));
let productsError = $derived(productGroups.some((group) => group.error));
let title = $state("");
let slug = $state("");
let slugEdited = $state(false);
let createState = $state<"idle" | "saving" | "error">("idle");
let createError = $state("");
let pendingProductKey = $state("");
let createdProductHref = $state("");

function pluralKindLabel(kind: CatalogProductKind) {
	return kind === "merchandise" ? "merchandise" : `${catalogProductKindLabel(kind)}s`;
}
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
		<div>
			<h1>products</h1>
			<p class="description">{graphVersion === 2 ? "Review the private imported catalog drafts. Nothing in this workspace is published to the shop yet." : "Create and maintain private single-print drafts. Nothing in this workspace is published to the shop yet."}</p>
		</div>
		{#if !loading}<span class="count">{products.length} {products.length === 1 ? "product" : "products"}</span>{/if}
	</header>
	<section aria-labelledby="product-list-heading">
		<div class="section-heading">
			<span>01</span>
			<div>
				<h2 id="product-list-heading">{graphVersion === 2 ? "catalog drafts" : "single prints"}</h2>
				<p>{graphVersion === 2 ? "Grouped read-back for the unpublished Convex catalog import. Product-specific editing comes in later slices." : "Each row is an editable draft identity. A discarded row is retained without an active draft."}</p>
			</div>
		</div>
		{#if productsError}
			<p class="error" role="alert">Could not load product drafts. Refresh this page to try again.</p>
		{:else if loading}
			<p class="empty" role="status">Loading product drafts…</p>
		{:else if products.length === 0}
			<p class="empty"><strong>No product drafts yet.</strong><span>{graphVersion === 2 ? "No imported catalog drafts were found for the enabled product kinds." : "Create the first single print when its basic pricing is ready to enter."}</span></p>
		{:else}
			<div class="product-groups">
				{#each productGroups as group (group.kind)}
					{#if group.products?.length}
						<div class="product-group">
							<h3>{pluralKindLabel(group.kind)}</h3>
							<div class="product-list">
								{#each group.products as product (product.productId)}
									<a class="page-entry" href={`${baseHref}/${product.productId}`}>
										<span><strong>{catalogProductLabel(product)}</strong><small>{product.slug ? `/${product.slug}` : "No URL name"} · {product.draft?.variantCount ?? 0} {product.draft?.variantCount === 1 ? "variant" : "variants"}</small></span>
										<span class:discarded={catalogProductStatus(product) === "discarded"} class="status">{catalogProductStatus(product)}</span>
									</a>
								{/each}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</section>
	{#if graphVersion === 1}
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
	{/if}
</div>
<style>
	.products-page { max-width: 1040px; }
	.count { color: var(--admin-text-subtle); font-size: .76rem; white-space: nowrap; }
	.product-groups { display: grid; gap: 24px; }
	.product-group { display: grid; gap: 10px; }
	.product-group h3 { margin: 0; color: var(--admin-heading); font-size: .92rem; font-weight: 500; text-transform: lowercase; }
	.product-list { display: grid; }
	.status { border: 1px solid color-mix(in srgb, var(--status-amber) 55%, transparent); border-radius: 999px; padding: 4px 9px; color: var(--status-amber); font-size: .68rem; }
	.status.discarded { border-color: var(--admin-border-strong); color: var(--admin-text-subtle); }
	.empty { display: grid; gap: 7px; margin: 0; padding: 20px; border: 1px dashed var(--admin-border); border-radius: 10px; color: var(--admin-text-muted); }
	.empty strong { color: var(--admin-heading); font-weight: 500; }
	form { display: grid; gap: 18px; } form button { justify-self: start; }
	.error { margin: 16px 0 0; color: var(--admin-danger, var(--status-rose)); }
	.success { margin: 16px 0 0; color: var(--status-sage); } .success a { color: inherit; }
</style>
