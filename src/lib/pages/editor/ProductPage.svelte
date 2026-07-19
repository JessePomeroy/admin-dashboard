<script lang="ts">
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import { getCatalogProductEditorCapability } from "../../catalogProductCapability";
import {
	catalogProductDraftFromRevision,
	copyCatalogProductDraft,
	emptyCatalogProductDraft,
	parseCatalogBasisPoints,
	serializeCatalogProductDraft,
	slugifyCatalogProductTitle,
	type CatalogProductDraftForm,
	type CatalogProductEditorState,
} from "../../catalogProductEditor";
import { getAdminConfig } from "../../config";
import "../../styles/editorial-page.css";
import CatalogProductVariants from "./CatalogProductVariants.svelte";

let { productId }: { productId: string } = $props();
const config = getAdminConfig();
const capability = getCatalogProductEditorCapability(config);
if (!capability) {
	throw new Error("Single-print product editor is not configured for this host");
}
const { api: catalogApi, settings: productsConfig } = capability;

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
let currentJson = $derived(serializeCatalogProductDraft(form));
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

$effect(() => {
	if (!editorState) return;
	const serverRevisionId = editorState.draft?.revisionId ?? null;
	if (!initialized) return loadServerDraft(editorState);
	if (["saving", "discarding"].includes(saveState)) return;
	if (serverRevisionId === loadedServerRevisionId) return;
	const localEchoIndex = locallyCommittedRevisionIds.indexOf(serverRevisionId);
	if (localEchoIndex >= 0) {
		loadedServerRevisionId = serverRevisionId;
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
	const draft = copyCatalogProductDraft(form);
	saveState = "saving";
	saveError = "";
	try {
		const result = await client.mutation(catalogApi.saveDraft, {
			productId,
			...(baseRevisionId ? { expectedDraftRevisionId: baseRevisionId } : {}),
			draft,
		}) as { revisionId: string };
		baseRevisionId = result.revisionId;
		rememberCommittedRevision(result.revisionId);
		savedJson = serializeCatalogProductDraft(draft);
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
</script>

<svelte:head><title>Product — {config.siteName}</title></svelte:head>
{#if editorError}
	<p class="alert page-alert" role="alert">Could not load this product draft. Refresh this page to try again.</p>
{:else if editorState === undefined}
	<p class="loading" role="status">Loading product draft…</p>
{:else}
	<div class="settings-page product-page">
		<header class="settings-header">
			<div><a class="back" href={baseHref}>← products</a><h1>{form.title?.trim() || editorState.productKey}</h1><p class="description">Edit the private product definition and ordered price variants. This draft is not connected to the public shop.</p></div>
			{#if hasActiveDraft}<div class="actions"><span class="save-state" aria-live="polite">{saveState}</span><button type="button" class="primary" onclick={() => void saveDraft()} disabled={!canSave}>save draft</button></div>{/if}
		</header>
		{#if saveError}<p class="alert" role="alert">{saveError}</p>{/if}
		{#if !hasActiveDraft}
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
				<div class="section-heading"><span>02</span><div><h2 id="sale-settings-heading">sale settings</h2><p>Choose how the print is fulfilled and whether customers may currently order it.</p></div></div>
				<div class="fields two-column">
					<label>fulfillment<select bind:value={form.fulfillmentMode}><option value="production_partner">production partner</option><option value="merchant_fulfilled">handled by the studio</option></select></label>
					<label>sale availability<select bind:value={form.saleAvailability}><option value="available">available</option><option value="unavailable">unavailable</option></select></label>
				</div>
				<div class="option-grid"><label class="check"><input type="checkbox" bind:checked={form.borderOptionsEnabled} /><span>offer border options</span></label><label class="check"><input type="checkbox" bind:checked={form.frameOptionsEnabled} /><span>offer frame options</span></label></div>
				{#if form.frameOptionsEnabled}<label class="multiplier">frame price multiplier (basis points)<input inputmode="numeric" value={multiplierInput} oninput={(event) => updateMultiplier(event.currentTarget.value)} aria-invalid={Boolean(multiplierError)} /><small>10,000 = 1×; 20,000 = 2×.</small>{#if multiplierError}<small class="field-error">{multiplierError}</small>{/if}</label>{/if}
			</section>
			<CatalogProductVariants variants={form.variants} onChange={(variants) => { form.variants = variants; }} onValidityChange={(valid) => { variantsValid = valid; }} disabled={["saving", "discarding", "conflict"].includes(saveState)} />
			<section aria-labelledby="product-draft-actions-heading">
				<div class="section-heading"><span>04</span><div><h2 id="product-draft-actions-heading">draft actions</h2><p>Discard clears the active draft pointer. The product identity and immutable revision history remain retained.</p></div></div>
				<button type="button" class="danger" onclick={() => void discardDraft()} disabled={saveState === "saving" || saveState === "discarding"}>{saveState === "discarding" ? "discarding…" : "discard draft"}</button>
			</section>
		{/if}
	</div>
{/if}
<style>
	.loading, .page-alert { margin: 48px 40px; } .loading { color: var(--admin-text-muted); } .product-page { max-width: 1040px; }
	.back { display: inline-block; margin-bottom: 14px; color: var(--admin-text-muted); text-decoration: none; }
	select { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 11px 12px; background: var(--admin-bg); color: var(--admin-heading); font: inherit; text-transform: none; }
	select:focus { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.option-grid { display: flex; flex-wrap: wrap; gap: 18px 28px; margin-top: 22px; }
	.check { flex-direction: row !important; align-items: center; color: var(--admin-text) !important; } .check input { width: auto !important; }
	.multiplier { max-width: 360px; margin-top: 20px; }
	.danger { border-color: color-mix(in srgb, var(--admin-danger, var(--status-rose)) 55%, transparent) !important; color: var(--admin-danger, var(--status-rose)) !important; }
</style>
