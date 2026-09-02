<script lang="ts">
import { goto } from "$app/navigation";
import { useQuery } from "convex-svelte";
import { tick, type Snippet } from "svelte";
import { useAdminClient } from "../../adminClient";
import { getCatalogProductEditorCapability } from "../../catalogProductCapability";
import {
	catalogProductKindLabel,
	catalogProductLabel,
	catalogProductStatus,
	emptyCatalogProductDraft,
	newCatalogProductGraphDraft,
	newCatalogProductKey,
	parseCatalogPriceDollars,
	slugifyCatalogProductTitle,
	type CatalogProductEditorSummary,
	type CatalogProductKind,
} from "../../catalogProductEditor";
import { getAdminConfig } from "../../config";
import EditorListbox from "./EditorListbox.svelte";

let {
	selectedProductId,
	children,
}: {
	selectedProductId?: string;
	children: Snippet;
} = $props();

const config = getAdminConfig();
const capability = getCatalogProductEditorCapability(config);
if (!capability) {
	throw new Error("Single-print product editor is not configured for this host");
}
const {
	api: catalogApi,
	enabledKinds,
	graphVersion,
	publishesToShop,
	settings: productsConfig,
} = capability;
const baseHref = productsConfig.baseHref ?? "/admin/editor/products";
const client = useAdminClient();
const catalogKinds = ["print", "print_set", "postcard", "merchandise", "tapestry", "digital_download"] as const satisfies readonly CatalogProductKind[];
const supportedKinds = catalogKinds.filter((kind) => enabledKinds.includes(kind));

function queryArgs(kind: CatalogProductKind) {
	if (!supportedKinds.includes(kind)) return "skip";
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
	.filter(({ kind }) => supportedKinds.includes(kind))
	.map(({ kind, query }) => ({
		kind,
		products: query.data as CatalogProductEditorSummary[] | undefined,
		error: query.error,
	})));
let products = $derived(productGroups.flatMap((group) => group.products ?? []));
let loading = $derived(productGroups.some((group) => group.products === undefined && !group.error));
let productsError = $derived(productGroups.some((group) => group.error));
let search = $state("");
let kindFilter = $state<"all" | CatalogProductKind>("all");
let statusFilter = $state<"all" | "unpublished" | "published">("all");
let normalizedSearch = $derived(search.trim().toLocaleLowerCase());
let visibleGroups = $derived(productGroups
	.filter(({ kind }) => kindFilter === "all" || kind === kindFilter)
	.map((group) => ({
		...group,
		products: (group.products ?? []).filter((product) => {
			const status = catalogProductStatus(product);
			if (statusFilter === "unpublished" && status !== "unpublished") return false;
			if (statusFilter === "published" && status !== "published" && status !== "changes") return false;
			if (!normalizedSearch) return true;
			return `${catalogProductLabel(product)} ${product.slug ?? ""}`
				.toLocaleLowerCase()
				.includes(normalizedSearch);
		}),
	}))
	.filter((group) => group.products.length > 0));
let visibleCount = $derived(visibleGroups.reduce((count, group) => count + group.products.length, 0));
let creating = $state(false);
let title = $state("");
let slug = $state("");
let slugEdited = $state(false);
let newProductKind = $state<CatalogProductKind>(supportedKinds[0] ?? "print");
let startingPrice = $state("");
let createState = $state<"idle" | "saving" | "navigating" | "error">("idle");
let createError = $state("");
let pendingProductKey = $state("");
let createdProductHref = $state("");
let newProductButton = $state<HTMLButtonElement>();
let createDialog = $state<HTMLDivElement>();
let titleInput = $state<HTMLInputElement>();
let fixedPriceCreation = $derived(
	newProductKind === "postcard"
		|| newProductKind === "merchandise"
		|| newProductKind === "tapestry"
		|| newProductKind === "digital_download",
);

function pluralKindLabel(kind: CatalogProductKind) {
	if (kind === "merchandise") return "merchandise";
	if (kind === "tapestry") return "tapestries";
	return `${catalogProductKindLabel(kind)}s`;
}

function kindCount(kind: CatalogProductKind) {
	return productGroups.find((group) => group.kind === kind)?.products?.length ?? 0;
}

function updateTitle(event: Event) {
	title = (event.currentTarget as HTMLInputElement).value;
	if (!slugEdited) slug = slugifyCatalogProductTitle(title);
}

function updateSlug(event: Event) {
	slugEdited = true;
	slug = slugifyCatalogProductTitle((event.currentTarget as HTMLInputElement).value);
}

async function openCreate() {
	newProductKind = kindFilter !== "all" && supportedKinds.includes(kindFilter)
		? kindFilter
		: supportedKinds[0] ?? "print";
	title = "";
	slug = "";
	slugEdited = false;
	startingPrice = "";
	createState = "idle";
	createError = "";
	createdProductHref = "";
	creating = true;
	await tick();
	titleInput?.focus();
}

async function closeCreate() {
	if (createState === "saving" || createState === "navigating") return;
	creating = false;
	createError = "";
	await tick();
	newProductButton?.focus();
}

function handleDialogKeydown(event: KeyboardEvent) {
	if (event.key === "Escape") {
		event.preventDefault();
		void closeCreate();
		return;
	}
	if (event.key !== "Tab") return;
	const focusable = Array.from(createDialog?.querySelectorAll<HTMLElement>(
		'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
	) ?? []);
	const first = focusable[0];
	const last = focusable.at(-1);
	if (!first || !last) return;
	if (!focusable.includes(document.activeElement as HTMLElement)) {
		event.preventDefault();
		(event.shiftKey ? last : first).focus();
		return;
	}
	if (event.shiftKey && document.activeElement === first) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && document.activeElement === last) {
		event.preventDefault();
		first.focus();
	}
}

async function createProduct() {
	const normalizedTitle = title.trim();
	if (!normalizedTitle) {
		createState = "error";
		createError = "Enter a product name first.";
		return;
	}
	createDialog?.querySelector<HTMLButtonElement>(".close")?.focus();
	createState = "saving";
	createError = "";
	createdProductHref = "";
	let draft;
	try {
		draft = graphVersion === 2
			? newCatalogProductGraphDraft(newProductKind, {
					title: normalizedTitle,
					slug,
					...(fixedPriceCreation
						? { retailPriceCents: parseCatalogPriceDollars(startingPrice) }
						: {}),
				})
			: { ...emptyCatalogProductDraft(), title: normalizedTitle, ...(slug ? { slug } : {}) };
	} catch (error) {
		createState = "error";
		createError = error instanceof Error ? error.message : "Check the product details.";
		return;
	}
	const productKey = pendingProductKey || newCatalogProductKey(newProductKind);
	pendingProductKey = productKey;
	let result: { productId: string };
	try {
		result = await client.mutation(catalogApi.createDraft, {
			siteUrl: config.siteUrl,
			productKey,
			draft,
		}) as { productId: string };
	} catch (error) {
		createState = "error";
		createError = error instanceof Error ? error.message : "Could not create the product draft.";
		return;
	}
	pendingProductKey = "";
	createdProductHref = `${baseHref}/${result.productId}`;
	createState = "navigating";
	try {
		await goto(createdProductHref);
	} catch {
		createState = "error";
		createError = "The product draft was created, but it could not be opened automatically. Open it from the product list.";
	}
}
</script>

<div class="product-workbench" class:has-selection={Boolean(selectedProductId)} inert={creating}>
	<header class="workbench-heading editor-workbench-header">
		<h1>products</h1>
		<div class="heading-meta"><span>{loading ? "loading…" : `${products.length} ${products.length === 1 ? "product" : "products"}`}</span><small>{supportedKinds.length} {supportedKinds.length === 1 ? "kind" : "kinds"}</small></div>
	</header>

	<div class="workbench-grid">
		<aside class="taxonomy-pane" aria-label="Product taxonomy">
			<div class="kind-filters" role="group" aria-label="Filter by product kind">
				<button type="button" class:active={kindFilter === "all"} aria-pressed={kindFilter === "all"} onclick={() => kindFilter = "all"}><span>all products</span><small>{products.length}</small></button>
				{#each supportedKinds as kind}
					<button type="button" class:active={kindFilter === kind} aria-pressed={kindFilter === kind} onclick={() => kindFilter = kind}><span>{pluralKindLabel(kind)}</span><small>{kindCount(kind)}</small></button>
				{/each}
			</div>
		</aside>

		<aside class="collection-pane" aria-label="Product collection">
			<div class="collection-heading"><h2>catalog</h2><button bind:this={newProductButton} type="button" class="new-product" onclick={() => void openCreate()}>new</button></div>
			<label class="search-field"><span>search products</span><input type="search" placeholder="Search name or URL" bind:value={search} /></label>
			<div class="status-filters" role="group" aria-label="Filter by draft status">
				{#each ["all", "unpublished", "published"] as status}
					<button type="button" class:active={statusFilter === status} aria-pressed={statusFilter === status} onclick={() => statusFilter = status as typeof statusFilter}>{status}</button>
				{/each}
			</div>
			{#if productsError}
				<p class="collection-message error" role="alert">Could not load product drafts. Refresh this page to try again.</p>
			{:else if loading}
				<p class="collection-message" role="status">loading product drafts…</p>
			{:else if products.length === 0}
				<p class="collection-message">No product drafts yet.</p>
			{:else if visibleCount === 0}
				<p class="collection-message">No products match these filters.</p>
			{:else}
				<div class="product-groups">
					{#each visibleGroups as group (group.kind)}
						<section class="product-group" aria-label={pluralKindLabel(group.kind)}>
							<h3>{pluralKindLabel(group.kind)}</h3>
							<ul class="product-list">
								{#each group.products as product (product.productId)}
									{@const status = catalogProductStatus(product)}
									<li class:selected={product.productId === selectedProductId}>
										<a href={`${baseHref}/${product.productId}`} aria-current={product.productId === selectedProductId ? "page" : undefined}>
											<span><strong>{catalogProductLabel(product)}</strong><small>{product.slug ? `/${product.slug}` : "No URL name"} · {product.draft?.variantCount ?? 0} {product.draft?.variantCount === 1 ? "variant" : "variants"}</small></span>
										<em class="status" class:published={status === "published"} class:discarded={status === "discarded"}>{status}</em>
										</a>
									</li>
								{/each}
							</ul>
						</section>
					{/each}
				</div>
			{/if}
		</aside>

		<section class="document-pane" aria-label="Product workspace">{@render children()}</section>
	</div>
</div>

{#if creating}
	<div class="create-backdrop" role="presentation" onclick={(event) => { if (event.currentTarget === event.target) void closeCreate(); }}>
		<div bind:this={createDialog} class="create-panel" role="dialog" aria-modal="true" aria-labelledby="create-product-heading" tabindex="-1" onkeydown={handleDialogKeydown}>
			<div class="create-heading"><h2 id="create-product-heading">new product</h2><button type="button" class="close" onclick={() => void closeCreate()} aria-label="Close new product form">×</button></div>
			<p>Start privately, then finish its media and selling details.{publishesToShop ? " Publish it to your Shop when it is ready." : " Publication remains unavailable until this host exposes it."}</p>
			<form onsubmit={(event) => { event.preventDefault(); void createProduct(); }}>
				<EditorListbox
					id="new-product-type"
					label="product type"
					value={newProductKind}
					options={supportedKinds.map((kind) => ({ value: kind, label: catalogProductKindLabel(kind) }))}
					disabled={createState === "saving"}
					onChange={(kind) => (newProductKind = kind as CatalogProductKind)}
				/>
				<label>product name<input bind:this={titleInput} maxlength="160" value={title} oninput={updateTitle} autocomplete="off" /></label>
				<label>URL name<input maxlength="96" value={slug} oninput={updateSlug} autocomplete="off" spellcheck="false" /><small>Lowercase words separated by hyphens.</small></label>
				{#if fixedPriceCreation}<label>starting price (USD)<span class="money-input"><span aria-hidden="true">$</span><input inputmode="decimal" value={startingPrice} oninput={(event) => (startingPrice = event.currentTarget.value)} autocomplete="off" aria-label="starting price (USD)" /></span><small>The product starts unavailable.</small></label>{/if}
				<button type="submit" class="primary" disabled={createState === "saving" || Boolean(createdProductHref)}>{createdProductHref ? "draft created" : createState === "saving" ? "creating…" : "create product draft"}</button>
			</form>
			{#if createError}<p class="error" role="alert">{createError}</p>{/if}
			{#if createdProductHref}<p class="success" role="status">Product draft created. <a href={createdProductHref}>Open the product draft.</a></p>{/if}
		</div>
	</div>
{/if}

<style>
	.product-workbench { min-height: 100%; background: var(--admin-bg); color: var(--admin-text); }
	.workbench-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; padding: 13px 20px 12px; border-bottom: 1px solid var(--admin-border); background: var(--editor-canvas); }
	.workbench-heading h1, .collection-heading h2, .create-heading h2 { margin: 0; color: var(--admin-heading); font-family: var(--admin-font-display); font-weight: 500; letter-spacing: -.025em; text-transform: lowercase; }
	.workbench-heading h1 { font-size: clamp(1.18rem, 1.7vw, 1.48rem); }
	.heading-meta { display: grid; justify-items: end; gap: 4px; color: var(--admin-heading); font-size: .75rem; white-space: nowrap; }
	.heading-meta small { color: var(--admin-text-subtle); font-size: .63rem; }
	.workbench-grid { display: grid; grid-template-columns: 128px 232px minmax(0, 1fr); min-height: calc(100vh - var(--editor-header-height, 64px)); }
	.taxonomy-pane, .collection-pane { border-right: 1px solid var(--admin-border); background: var(--editor-collection); }
	.taxonomy-pane { padding: 18px 10px; }
	.kind-filters { display: grid; margin-top: 0; border-left: 1px solid var(--admin-border); }
	.kind-filters button { position: relative; display: flex; justify-content: space-between; gap: 8px; width: 100%; border: 0; padding: 8px 7px 8px 11px; background: transparent; color: var(--admin-text-muted); font: inherit; font-size: .66rem; text-align: left; cursor: pointer; }
	.kind-filters button::before { position: absolute; inset: 6px auto 6px -2px; width: 3px; background: transparent; content: ""; }
	.kind-filters button:hover { background: color-mix(in srgb, var(--admin-heading) 3%, transparent); color: var(--admin-heading); }
	.kind-filters button.active { background: transparent; color: var(--admin-heading); font-weight: 500; }
	.kind-filters button.active::before { background: var(--admin-accent-strong); }
	.kind-filters small { color: var(--admin-text-subtle); }
	.collection-pane { padding: 18px 14px 32px; }
	.collection-heading, .create-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
	.collection-heading h2, .create-heading h2 { font-size: 1.08rem; }
	.new-product, .primary { border: 1px solid transparent; border-radius: 6px; padding: 8px 11px; background: var(--admin-accent-strong); color: var(--admin-bg); font-size: .72rem; cursor: pointer; }
	.search-field { display: grid; gap: 5px; margin-top: 14px; color: var(--admin-text-muted); font-size: .62rem; }
	.search-field input, .create-panel input { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 3px; padding: 8px 9px; background: var(--editor-control); color: var(--admin-heading); font: inherit; }
	.money-input { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; border: 1px solid var(--admin-border-strong); border-radius: 3px; background: var(--editor-control); }
	.money-input > span { padding-left: 9px; color: var(--admin-text-muted); }
	.money-input input { border: 0; background: transparent; }
	.money-input > input:focus-visible { outline: 0; }
	.money-input:focus-within { outline: 2px solid var(--admin-accent-strong); outline-offset: 2px; }
	.status-filters { display: flex; flex-wrap: wrap; gap: 3px; margin: 8px 0 13px; }
	.status-filters button { min-height: 28px; border: 0; border-radius: 3px; padding: 5px 7px; background: transparent; color: var(--admin-text-subtle); font-size: .63rem; cursor: pointer; }
	.status-filters button.active, .status-filters button:hover { background: var(--admin-active); color: var(--admin-heading); }
	.collection-message { margin: 0; padding: 16px 4px; color: var(--admin-text-muted); font-size: .76rem; line-height: 1.5; }
	.collection-message.error, .create-panel .error { color: var(--admin-danger, var(--status-rose)); }
	.product-groups { display: grid; gap: 13px; }
	.product-group h3 { margin: 0 0 7px; color: var(--admin-text-subtle); font-size: .63rem; font-weight: 500; letter-spacing: .12em; text-transform: uppercase; }
	.product-list { display: grid; margin: 0; padding: 0; border-top: 1px solid var(--admin-border); list-style: none; }
	.product-list li { position: relative; border-bottom: 1px solid var(--admin-border); }
	.product-list li::before { position: absolute; inset: 7px auto 7px 0; width: 2px; background: transparent; content: ""; }
	.product-list li:hover { background: color-mix(in srgb, var(--admin-heading) 3%, transparent); }
	.product-list li.selected { background: transparent; }
	.product-list li.selected::before { background: var(--admin-accent-strong); }
	.product-list a { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; align-items: center; padding: 9px 8px 9px 10px; color: inherit; text-decoration: none; }
	.product-list a > span { display: grid; min-width: 0; gap: 4px; }
	.product-list strong { overflow: hidden; color: var(--admin-heading); font-size: .75rem; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
	.product-list small { overflow: hidden; color: var(--admin-text-subtle); font-size: .62rem; text-overflow: ellipsis; white-space: nowrap; }
	.product-list em { color: var(--status-amber); font-size: .61rem; font-style: normal; }
	.product-list em.published { color: var(--status-sage); }
	.product-list em.discarded { color: var(--admin-text-subtle); }
	.document-pane { min-width: 0; background: var(--editor-canvas); }
	.create-backdrop { position: fixed; z-index: 80; inset: 0; display: grid; place-items: center; padding: 24px; background: color-mix(in srgb, var(--admin-bg) 72%, transparent); backdrop-filter: blur(4px); }
	.create-panel { width: min(520px, 100%); box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 14px; padding: 24px; background: var(--admin-surface); box-shadow: 0 24px 80px rgb(0 0 0 / .28); }
	.create-panel > p { margin: 10px 0 0; color: var(--admin-text-muted); font-size: .78rem; line-height: 1.55; }
	.create-panel form { display: grid; gap: 17px; margin-top: 22px; }
	.create-panel label { display: grid; gap: 6px; color: var(--admin-text-muted); font-size: .68rem; }
	.create-panel label small { color: var(--admin-text-subtle); }
	.close { width: 44px; height: 44px; border: 1px solid var(--admin-border); border-radius: 50%; background: transparent; color: var(--admin-heading); font-size: 1.25rem; cursor: pointer; }
	.create-panel .error, .create-panel .success { margin: 16px 0 0; font-size: .75rem; }
	.create-panel .success { color: var(--status-sage); } .create-panel .success a { color: inherit; }
	button:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid var(--admin-accent-strong); outline-offset: 2px; }
	@media (min-width: 641px) and (max-width: 1279px) {
		.workbench-grid { grid-template-columns: 180px minmax(0, 1fr); }
		.document-pane { display: none; }
		.product-workbench.has-selection .taxonomy-pane, .product-workbench.has-selection .collection-pane { display: none; }
		.product-workbench.has-selection .document-pane { display: block; grid-column: 1 / -1; }
	}
	@media (max-width: 768px) {
		.kind-filters button, .new-product, .status-filters button, .primary { min-height: 44px; }
	}
	@media (max-width: 640px) {
		.workbench-heading { align-items: flex-start; flex-direction: column; padding: 18px 20px; }
		.heading-meta { justify-items: start; }
		.workbench-grid { display: block; min-height: 0; }
		.taxonomy-pane { border-right: 0; border-bottom: 1px solid var(--admin-border); padding: 18px 16px; }
		.kind-filters { display: flex; overflow-x: auto; }
		.kind-filters button { flex: 0 0 auto; width: auto; }
		.collection-pane { border-right: 0; padding: 22px 16px 48px; }
		.document-pane { display: none; }
		.product-workbench.has-selection .taxonomy-pane, .product-workbench.has-selection .collection-pane { display: none; }
		.product-workbench.has-selection .document-pane { display: block; }
		.create-backdrop { align-items: end; padding: 0; }
		.create-panel { border-radius: 14px 14px 0 0; }
	}
</style>
