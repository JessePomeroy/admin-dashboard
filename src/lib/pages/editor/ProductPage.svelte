<script lang="ts">
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import { getCatalogProductEditorCapability } from "../../catalogProductCapability";
import {
	addCatalogProductWebMedia,
	alignCatalogProductWebMediaWithSetMembers,
	catalogProductDraftFromRevision,
	catalogProductEditorDescription,
	catalogProductEditorSaleAvailability,
	catalogProductEditorTitle,
	catalogProductEditorVariantCount,
	catalogProductGraphDraftFromForm,
	catalogProductGraphDraftFromRevision,
	catalogProductKindLabel,
	canEditCatalogProductGraphKind,
	copyCatalogProductDraft,
	emptyCatalogProductDraft,
	parseCatalogBasisPoints,
	serializeCatalogProductDraft,
	slugifyCatalogProductTitle,
	type CatalogProductDraftForm,
	type CatalogProductEditorState,
} from "../../catalogProductEditor";
import { getAdminConfig } from "../../config";
import {
	mergePortfolioMediaAssets,
	type PortfolioMediaAsset,
	type PortfolioMediaPage,
} from "../../portfolioEditor";
import "../../styles/editorial-page.css";
import CatalogProductMedia from "./CatalogProductMedia.svelte";
import CatalogProductPaidFile from "./CatalogProductPaidFile.svelte";
import CatalogProductSetMembers from "./CatalogProductSetMembers.svelte";
import CatalogProductVariants from "./CatalogProductVariants.svelte";
import PortfolioMediaPicker from "./PortfolioMediaPicker.svelte";

let { productId }: { productId: string } = $props();
const config = getAdminConfig();
const capability = getCatalogProductEditorCapability(config);
if (!capability) {
	throw new Error("Single-print product editor is not configured for this host");
}
const { api: catalogApi, settings: productsConfig, media: mediaCapability } = capability;

const baseHref = productsConfig.baseHref ?? "/admin/editor/products";
const client = useAdminClient();
const editorQuery = useQuery(catalogApi.getEditorState, () => ({ productId }));
let editorState = $derived(editorQuery.data as CatalogProductEditorState | undefined);
let editorError = $derived(editorQuery.error);
let form = $state<CatalogProductDraftForm>(emptyCatalogProductDraft());
let initialized = $state(false);
let hasActiveDraft = $state(false);
let loadedServerRevisionId = $state<string | null>(null);
let baseRevisionId = $state<string | undefined>();
let locallyCommittedRevisionIds = $state<Array<string | null>>([]);
let savedJson = $state("");
let saveState = $state<"loading" | "saved" | "dirty" | "saving" | "discarding" | "error" | "conflict">("loading");
let saveError = $state("");
let multiplierInput = $state("10000");
let multiplierError = $state("");
let variantsValid = $state(true);
let pickerOpen = $state(false);
let uploadedAssets = $state<PortfolioMediaAsset[]>([]);
let mediaActionError = $state("");
const mediaListQuery = mediaCapability
	? useQuery(mediaCapability.api.listForEditor, {
			siteUrl: config.siteUrl,
			paginationOpts: { numItems: 100, cursor: null },
		})
	: null;
let mediaPage = $derived(mediaListQuery?.data as PortfolioMediaPage | undefined);
let placedAssetIds = $derived([
	...new Set((form.webMedia ?? []).map((placement) => placement.assetId)),
]);
const placedMediaQuery = mediaCapability
	? useQuery(mediaCapability.api.getManyForEditor, () => ({
			siteUrl: config.siteUrl,
			ids: placedAssetIds,
		}))
	: null;
let placedAssets = $derived((placedMediaQuery?.data ?? []) as PortfolioMediaAsset[]);
let readyAssets = $derived(
	[...new Map(
		[
			...uploadedAssets,
			...((mediaPage?.page ?? []) as PortfolioMediaAsset[]),
			...placedAssets,
		]
			.map((asset) => [asset._id, asset]),
	).values()].filter((asset) => asset.status === "ready"),
);
let mediaById = $derived(mergePortfolioMediaAssets(
	[...((mediaPage?.page ?? []) as PortfolioMediaAsset[]), ...uploadedAssets],
	placedAssets,
));
let mediaQueryError = $derived(mediaListQuery?.error ?? placedMediaQuery?.error);
let selectedAssetIds = $derived(new Set(
	(form.webMedia ?? [])
		.filter((placement) => placement.role !== "social_share")
		.map((placement) => placement.assetId),
));
let currentJson = $derived(serializeCatalogProductDraft(form));
let isGraphV2 = $derived(editorState?.graphVersion === 2 || editorState?.draft?.schemaVersion === 2 || editorState?.published?.schemaVersion === 2);
let canEditGraphProduct = $derived(isGraphV2 && canEditCatalogProductGraphKind(editorState?.productKind) && Boolean(editorState?.draft));
let readOnlyRevision = $derived(editorState?.draft ?? editorState?.published ?? null);
let usesSinglePrice = $derived(
	form.productKind === "postcard"
		|| form.productKind === "merchandise"
		|| form.productKind === "tapestry"
		|| form.productKind === "digital_download",
);
let dirty = $derived(initialized && hasActiveDraft && currentJson !== savedJson);
let canSave = $derived(
	hasActiveDraft
		&& variantsValid
		&& (!form.frameOptionsEnabled || !multiplierError)
		&& !["saving", "discarding", "conflict"].includes(saveState)
		&& (dirty || saveState === "error"),
);

function loadServerDraft(state: CatalogProductEditorState) {
	locallyCommittedRevisionIds = [];
	form = catalogProductDraftFromRevision(state.draft);
	hasActiveDraft = Boolean(state.draft);
	baseRevisionId = state.draft?.revisionId;
	loadedServerRevisionId = state.draft?.revisionId ?? null;
	savedJson = serializeCatalogProductDraft(form);
	multiplierInput = String(form.framePriceMultiplierBasisPoints);
	saveState = "saved";
	saveError = "";
	multiplierError = "";
	initialized = true;
}

function loadServerGraphProductDraft(state: CatalogProductEditorState) {
	locallyCommittedRevisionIds = [];
	form = catalogProductGraphDraftFromRevision(state.draft);
	hasActiveDraft = Boolean(state.draft);
	baseRevisionId = state.draft?.revisionId;
	loadedServerRevisionId = state.draft?.revisionId ?? null;
	savedJson = serializeCatalogProductDraft(form);
	multiplierInput = String(form.framePriceMultiplierBasisPoints);
	saveState = "saved";
	saveError = "";
	multiplierError = "";
	initialized = true;
}

$effect(() => {
	if (!editorState) return;
	if (isGraphV2) {
		if (!canEditGraphProduct) {
			saveState = "saved";
			initialized = true;
			return;
		}
		const serverRevisionId = editorState.draft?.revisionId ?? null;
		if (!initialized) return loadServerGraphProductDraft(editorState);
		if (["saving", "discarding"].includes(saveState)) return;
		if (serverRevisionId === loadedServerRevisionId) return;
		const localEchoIndex = locallyCommittedRevisionIds.indexOf(serverRevisionId);
		if (localEchoIndex >= 0) {
			loadedServerRevisionId = serverRevisionId;
			baseRevisionId = serverRevisionId ?? undefined;
			locallyCommittedRevisionIds = locallyCommittedRevisionIds.slice(localEchoIndex + 1);
			return;
		}
		if (dirty) {
			saveState = "conflict";
			saveError = "A newer server draft arrived while this page had unsaved changes. Reload before continuing.";
			return;
		}
		loadServerGraphProductDraft(editorState);
		return;
	}
	const serverRevisionId = editorState.draft?.revisionId ?? null;
	if (!initialized) return loadServerDraft(editorState);
	if (["saving", "discarding"].includes(saveState)) return;
	if (serverRevisionId === loadedServerRevisionId) return;
	const localEchoIndex = locallyCommittedRevisionIds.indexOf(serverRevisionId);
	if (localEchoIndex >= 0) {
		loadedServerRevisionId = serverRevisionId;
		baseRevisionId = serverRevisionId ?? undefined;
		locallyCommittedRevisionIds = locallyCommittedRevisionIds.slice(localEchoIndex + 1);
		return;
	}
	if (dirty) {
		saveState = "conflict";
		saveError = "A newer server draft arrived while this page had unsaved changes. Reload before continuing.";
		return;
	}
	loadServerDraft(editorState);
});

$effect(() => {
	if (!initialized || !hasActiveDraft || ["saving", "discarding", "conflict"].includes(saveState)) return;
	saveState = dirty ? "dirty" : "saved";
});

function updateOptionalField(field: "title" | "slug" | "description", value: string) {
	form[field] = field === "slug"
		? slugifyCatalogProductTitle(value) || undefined
		: value || undefined;
}
function fillSlugIfEmpty() {
	if (!form.slug && form.title) form.slug = slugifyCatalogProductTitle(form.title) || undefined;
}
function updateMultiplier(value: string) {
	multiplierInput = value;
	try {
		form.framePriceMultiplierBasisPoints = parseCatalogBasisPoints(value);
		multiplierError = "";
	} catch (error) {
		multiplierError = error instanceof Error ? error.message : "Enter whole basis points.";
	}
}
function mutationError(error: unknown, fallback: string) {
	const message = error instanceof Error ? error.message : fallback;
	saveState = message.toLowerCase().includes("conflict") ? "conflict" : "error";
	return saveState === "conflict" ? `${message} Reload this product before continuing.` : message;
}

function rememberCommittedRevision(revisionId: string | null) {
	locallyCommittedRevisionIds = [...locallyCommittedRevisionIds, revisionId];
}

async function saveDraft() {
	if (!canSave) return;
	if (!editorState?.draft) return;
	saveState = "saving";
	saveError = "";
	try {
		const draft = canEditGraphProduct
			? catalogProductGraphDraftFromForm(editorState.draft, copyCatalogProductDraft(form))
			: copyCatalogProductDraft(form);
		const result = await client.mutation(catalogApi.saveDraft, {
			productId,
			...(baseRevisionId ? { expectedDraftRevisionId: baseRevisionId } : {}),
			draft,
		}) as { revisionId: string };
		baseRevisionId = result.revisionId;
		rememberCommittedRevision(result.revisionId);
		savedJson = serializeCatalogProductDraft(form);
		saveState = "saved";
	} catch (error) {
		saveError = mutationError(error, "Could not save this product draft.");
	}
}
async function discardDraft() {
	if (!hasActiveDraft || !baseRevisionId) return;
	if (!globalThis.confirm(
		"Discard this draft? This clears its staged product details and any unsaved changes. The product identity remains, but this editor does not yet provide a restore action.",
	)) return;
	saveState = "discarding";
	saveError = "";
	try {
		await client.mutation(catalogApi.discardDraft, { productId, draftRevisionId: baseRevisionId });
		rememberCommittedRevision(null);
		hasActiveDraft = false;
		baseRevisionId = undefined;
		form = emptyCatalogProductDraft();
		savedJson = serializeCatalogProductDraft(form);
		multiplierInput = String(form.framePriceMultiplierBasisPoints);
		saveState = "saved";
	} catch (error) {
		saveError = mutationError(error, "Could not discard this product draft.");
	}
}
async function startDraft() {
	const draft = catalogProductDraftFromRevision(editorState?.published);
	saveState = "saving";
	saveError = "";
	try {
		const result = await client.mutation(catalogApi.saveDraft, { productId, draft }) as { revisionId: string };
		form = draft;
		hasActiveDraft = true;
		baseRevisionId = result.revisionId;
		rememberCommittedRevision(result.revisionId);
		savedJson = serializeCatalogProductDraft(draft);
		multiplierInput = String(form.framePriceMultiplierBasisPoints);
		saveState = "saved";
	} catch (error) {
		saveError = mutationError(error, "Could not start a new product draft.");
	}
}

function addMediaAsset(asset: PortfolioMediaAsset) {
	mediaActionError = "";
	try {
		form.webMedia = addCatalogProductWebMedia(
			form.webMedia ?? [],
			asset,
			form.productKind,
		);
		pickerOpen = false;
		return true;
	} catch (error) {
		mediaActionError = error instanceof Error
			? error.message
			: "This image could not be attached to the product.";
		return false;
	}
}

function addUploadedMediaAsset(asset: PortfolioMediaAsset) {
	uploadedAssets = [asset, ...uploadedAssets.filter((item) => item._id !== asset._id)];
	return addMediaAsset(asset);
}
</script>

<svelte:head><title>Product — {config.siteName}</title></svelte:head>
{#if editorError}
	<p class="alert page-alert" role="alert">Could not load this product draft. Refresh this page to try again.</p>
{:else if editorState === undefined}
	<p class="loading" role="status">Loading product draft…</p>
{:else}
		<div class="settings-page product-page">
		<header class="settings-header">
			<div><a class="back" href={baseHref}>← products</a><h1>{canEditGraphProduct || !isGraphV2 ? form.title?.trim() || editorState.productKey : catalogProductEditorTitle(readOnlyRevision)?.trim() || editorState.productKey}</h1><p class="description">{canEditGraphProduct ? `Edit this private imported ${catalogProductKindLabel(editorState.productKind)} draft. This is still not connected to the public shop.` : isGraphV2 ? "Review the imported private catalog graph. Product-specific editing arrives in a later slice." : "Edit the private product definition and ordered price variants. This draft is not connected to the public shop."}</p></div>
			{#if hasActiveDraft && (!isGraphV2 || canEditGraphProduct)}<div class="actions"><span class="save-state" aria-live="polite">{saveState}</span><button type="button" class="primary" onclick={() => void saveDraft()} disabled={!canSave}>save draft</button></div>{/if}
		</header>
		{#if saveError}<p class="alert" role="alert">{saveError}</p>{/if}
		{#if mediaActionError}<p class="alert" role="alert">{mediaActionError}</p>{/if}
		{#if mediaQueryError}<p class="alert" role="alert">Could not load product images. Refresh this page to try again.</p>{/if}
		{#if isGraphV2 && !canEditGraphProduct}
			<section aria-labelledby="product-readback-heading">
				<div class="section-heading"><span>01</span><div><h2 id="product-readback-heading">imported catalog draft</h2><p>This product is stored in the new graph model as an unpublished draft.</p></div></div>
				<dl class="readback-grid">
					<div><dt>kind</dt><dd>{catalogProductKindLabel(editorState.productKind)}</dd></div>
					<div><dt>URL name</dt><dd>{editorState.slug ? `/${editorState.slug}` : "not set"}</dd></div>
					<div><dt>availability</dt><dd>{catalogProductEditorSaleAvailability(readOnlyRevision) ?? "not set"}</dd></div>
					<div><dt>variants</dt><dd>{catalogProductEditorVariantCount(readOnlyRevision)}</dd></div>
					<div><dt>web images</dt><dd>{readOnlyRevision?.webMediaAssets?.length ?? 0}</dd></div>
					<div><dt>print files</dt><dd>{readOnlyRevision?.printSourceAssets?.length ?? 0}</dd></div>
				</dl>
				{#if catalogProductEditorDescription(readOnlyRevision)}
					<p class="readback-description">{catalogProductEditorDescription(readOnlyRevision)}</p>
				{/if}
				<p class="readback-note">Read-only for this slice: this confirms the Sanity import is visible to the protected Editor without connecting it to the public shop or checkout flow.</p>
			</section>
		{:else if !hasActiveDraft}
			<section aria-labelledby="discarded-product-heading">
				<div class="section-heading"><span>01</span><div><h2 id="discarded-product-heading">no active draft</h2><p>This product identity remains in the catalog, but its editable draft was discarded. No product details are currently staged.</p></div></div>
				<button type="button" onclick={() => void startDraft()} disabled={saveState === "saving"}>{saveState === "saving" ? "starting…" : "start a new draft"}</button>
			</section>
		{:else}
			<section aria-labelledby="product-identity-heading">
				<div class="section-heading"><span>01</span><div><h2 id="product-identity-heading">product details</h2><p>The working name, URL name, and description stored with this draft.</p></div></div>
				<div class="fields two-column">
					<label>product name<input maxlength="160" value={form.title ?? ""} oninput={(event) => updateOptionalField("title", event.currentTarget.value)} onblur={fillSlugIfEmpty} /></label>
					<label>URL name<input maxlength="96" value={form.slug ?? ""} oninput={(event) => updateOptionalField("slug", event.currentTarget.value)} spellcheck="false" /><small>Lowercase words separated by hyphens.</small></label>
					<label class="wide">description<textarea rows="5" maxlength="5000" value={form.description ?? ""} oninput={(event) => updateOptionalField("description", event.currentTarget.value)}></textarea></label>
				</div>
			</section>
			<section aria-labelledby="sale-settings-heading">
				<div class="section-heading"><span>02</span><div><h2 id="sale-settings-heading">sale settings</h2><p>{form.productKind === "print" || form.productKind === "print_set" ? `Choose how the ${catalogProductKindLabel(form.productKind)} is fulfilled and whether customers may currently order it.` : "Choose whether customers may currently order this product."}</p></div></div>
				<div class="fields two-column">
					{#if form.productKind === "print" || form.productKind === "print_set"}<label>fulfillment<select bind:value={form.fulfillmentMode}><option value="production_partner">production partner</option><option value="merchant_fulfilled">handled by the studio</option></select></label>{/if}
					<label>sale availability<select bind:value={form.saleAvailability}><option value="available">available</option><option value="unavailable">unavailable</option></select></label>
				</div>
				{#if form.productKind === "print" || form.productKind === "print_set"}
					<div class="option-grid"><label class="check"><input type="checkbox" bind:checked={form.borderOptionsEnabled} /><span>offer border options</span></label><label class="check"><input type="checkbox" bind:checked={form.frameOptionsEnabled} /><span>offer frame options</span></label></div>
					{#if form.frameOptionsEnabled}<label class="multiplier">frame price multiplier (basis points)<input inputmode="numeric" value={multiplierInput} oninput={(event) => updateMultiplier(event.currentTarget.value)} aria-invalid={Boolean(multiplierError)} /><small>10,000 = 1×; 20,000 = 2×.</small>{#if multiplierError}<small class="field-error">{multiplierError}</small>{/if}</label>{/if}
				{/if}
			</section>
			<CatalogProductVariants variants={form.variants} productLabel={catalogProductKindLabel(form.productKind)} fixedPrice={usesSinglePrice} onChange={(variants) => { form.variants = variants; }} onValidityChange={(valid) => { variantsValid = valid; }} disabled={["saving", "discarding", "conflict"].includes(saveState)} />
			{#if isGraphV2 && mediaCapability}
				<CatalogProductMedia
					placements={form.webMedia ?? []}
					productKind={form.productKind}
					members={form.setMembers}
					{mediaById}
					mediaBaseUrl={mediaCapability.mediaBaseUrl}
					uploadEndpoint={mediaCapability.uploadEndpoint}
					disabled={["saving", "discarding", "conflict"].includes(saveState)}
					onChange={(placements) => { form.webMedia = placements; mediaActionError = ""; }}
					onChooseMedia={() => { pickerOpen = true; mediaActionError = ""; }}
					onUploadReady={addUploadedMediaAsset}
				/>
			{/if}
			{#if form.productKind === "print_set"}
				<CatalogProductSetMembers members={form.setMembers} onChange={(members) => {
					form.setMembers = members;
					form.webMedia = alignCatalogProductWebMediaWithSetMembers(
						form.webMedia ?? [],
						members,
					);
				}} disabled={["saving", "discarding", "conflict"].includes(saveState)} />
			{/if}
			{#if form.productKind === "digital_download"}
				<CatalogProductPaidFile relation={readOnlyRevision?.paidFileAsset} />
			{/if}
			{#if !isGraphV2}
				<section aria-labelledby="product-draft-actions-heading">
					<div class="section-heading"><span>04</span><div><h2 id="product-draft-actions-heading">draft actions</h2><p>Discard clears the active draft pointer. The product identity and immutable revision history remain retained.</p></div></div>
					<button type="button" class="danger" onclick={() => void discardDraft()} disabled={saveState === "saving" || saveState === "discarding"}>{saveState === "discarding" ? "discarding…" : "discard draft"}</button>
				</section>
			{/if}
		{/if}
	</div>
{/if}

{#if pickerOpen && mediaCapability}
	<PortfolioMediaPicker
		assets={readyAssets}
		{selectedAssetIds}
		mediaBaseUrl={mediaCapability.mediaBaseUrl}
		hasMore={mediaPage ? !mediaPage.isDone : false}
		onChoose={addMediaAsset}
		onClose={() => (pickerOpen = false)}
	/>
{/if}
<style>
	.loading, .page-alert { margin: 48px 40px; } .loading { color: var(--admin-text-muted); } .product-page { max-width: 1040px; }
	.back { display: inline-block; margin-bottom: 14px; color: var(--admin-text-muted); text-decoration: none; }
	select { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 11px 12px; background: var(--admin-bg); color: var(--admin-heading); font: inherit; text-transform: none; }
	select:focus { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.option-grid { display: flex; flex-wrap: wrap; gap: 18px 28px; margin-top: 22px; }
	.check { flex-direction: row !important; align-items: center; color: var(--admin-text) !important; } .check input { width: auto !important; }
	.multiplier { max-width: 360px; margin-top: 20px; }
	.readback-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin: 0; }
	.readback-grid div { border: 1px solid var(--admin-border); border-radius: 10px; padding: 14px; background: color-mix(in srgb, var(--admin-surface) 82%, transparent); }
	.readback-grid dt { margin: 0 0 6px; color: var(--admin-text-muted); font-size: .68rem; text-transform: lowercase; letter-spacing: .08em; }
	.readback-grid dd { margin: 0; color: var(--admin-heading); font-size: .95rem; }
	.readback-description, .readback-note { margin: 18px 0 0; color: var(--admin-text-muted); line-height: 1.6; }
	.readback-note { border-top: 1px solid var(--admin-border); padding-top: 18px; font-size: .84rem; }
	.danger { border-color: color-mix(in srgb, var(--admin-danger, var(--status-rose)) 55%, transparent) !important; color: var(--admin-danger, var(--status-rose)) !important; }
</style>
