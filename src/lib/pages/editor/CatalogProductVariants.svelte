<script lang="ts">
import { untrack } from "svelte";
import { addCatalogProductVariant, CATALOG_PRODUCT_VARIANT_LIMIT, formatCatalogPriceDollars, moveCatalogProductVariant, parseCatalogPriceDollars, removeCatalogProductVariant, slugifyCatalogOptionKey, type CatalogProductKind, type CatalogProductMarginCalculator, type CatalogProductOptionChoice, type CatalogProductVariantDraftForm, type CatalogProductVariantOptionResolver } from "../../catalogProductEditor";
import EditorListbox from "./EditorListbox.svelte";
import EditorSegmentedChoice from "./EditorSegmentedChoice.svelte";
let { variants, productKind, resetScope, disabled = false, fixedPrice = false, productLabel = "print", setMemberCount = 0, frameMarkupMultiplier, marginCalculator, variantOptionResolver, onChange, onValidityChange = () => {} }: { variants: CatalogProductVariantDraftForm[]; productKind: CatalogProductKind; resetScope?: string; disabled?: boolean; fixedPrice?: boolean; productLabel?: string; setMemberCount?: number; frameMarkupMultiplier?: number; marginCalculator?: CatalogProductMarginCalculator; variantOptionResolver?: CatalogProductVariantOptionResolver; onChange: (variants: CatalogProductVariantDraftForm[]) => void; onValidityChange?: (valid: boolean) => void } = $props();
let priceErrors = $state<Record<string, string>>({});
let priceInputs = $state<Record<string, string>>({});
let observedPrices = $state<Record<string, number | undefined>>({});
let observedResetScope = $state<string | undefined>();
$effect(() => {
	const scopeChanged = observedResetScope !== resetScope;
	const activeKeys = new Set(variants.map((variant) => variant.key));
	const nextInputs = scopeChanged ? {} : { ...untrack(() => priceInputs) };
	const nextObserved = scopeChanged ? {} : { ...untrack(() => observedPrices) };
	const nextErrors = scopeChanged ? {} : { ...untrack(() => priceErrors) };
	let changed = scopeChanged;
	let errorsChanged = scopeChanged;
	for (const variant of variants) {
		if (!(variant.key in nextObserved) || nextObserved[variant.key] !== variant.retailPriceCents) {
			nextInputs[variant.key] = formatCatalogPriceDollars(variant.retailPriceCents);
			nextObserved[variant.key] = variant.retailPriceCents;
			if (variant.key in nextErrors) {
				delete nextErrors[variant.key];
				errorsChanged = true;
			}
			changed = true;
		}
	}
	for (const key of Object.keys(nextObserved)) {
		if (activeKeys.has(key)) continue;
		delete nextInputs[key];
		delete nextObserved[key];
		changed = true;
	}
	for (const key of Object.keys(nextErrors)) {
		if (activeKeys.has(key)) continue;
		delete nextErrors[key];
		errorsChanged = true;
	}
	if (changed) {
		priceInputs = nextInputs;
		observedPrices = nextObserved;
	}
	if (scopeChanged) observedResetScope = resetScope;
	if (errorsChanged) {
		priceErrors = nextErrors;
		onValidityChange(!Object.values(nextErrors).some(Boolean));
	}
});
function updateVariant(index: number, patch: Partial<CatalogProductVariantDraftForm>) {
	onChange(variants.map((variant, itemIndex) => itemIndex === index ? { ...variant, ...patch } : variant));
}
function updatePrice(index: number, value: string) {
	const variant = variants[index];
	if (!variant) return;
	priceInputs = { ...priceInputs, [variant.key]: value };
	try {
		const retailPriceCents = parseCatalogPriceDollars(value);
		if (retailPriceCents !== undefined && retailPriceCents <= 0) {
			throw new Error("Retail price must be at least $0.01.");
		}
		if (fixedPrice && retailPriceCents === undefined) {
			throw new Error("Retail price must be at least $0.01.");
		}
		observedPrices = { ...observedPrices, [variant.key]: retailPriceCents };
		const nextErrors = { ...priceErrors, [variant.key]: "" };
		priceErrors = nextErrors;
		onValidityChange(!Object.values(nextErrors).some(Boolean));
		updateVariant(index, { retailPriceCents });
	} catch (error) {
		priceErrors = { ...priceErrors, [variant.key]: error instanceof Error ? error.message : "Enter a valid USD amount." };
		onValidityChange(false);
	}
}
function marginFor(variant: CatalogProductVariantDraftForm) {
	if (priceErrors[variant.key]) return null;
	if (
		variant.retailPriceCents === undefined
		|| !marginCalculator
		|| (productKind !== "print" && productKind !== "print_set")
	) return null;
	return marginCalculator({
		productKind,
		materialOptionKey: variant.materialOptionKey,
		sizeOptionKey: variant.sizeOptionKey,
		retailPriceCents: variant.retailPriceCents,
		setMemberCount,
		frameMarkupMultiplier,
	});
}
function pickerOptions(
	choices: readonly CatalogProductOptionChoice[],
	current: string | undefined,
) {
	if (!current || choices.some((choice) => choice.value === current)) return choices;
	return [{ value: current, label: `${current} — current value unavailable`, disabled: true }, ...choices];
}
function resolvedOptions(variant: CatalogProductVariantDraftForm, materialOptionKey = variant.materialOptionKey) {
	if (!variantOptionResolver || (productKind !== "print" && productKind !== "print_set")) return null;
	return variantOptionResolver({ productKind, materialOptionKey });
}
function updateMaterial(index: number, materialOptionKey: string) {
	const variant = variants[index];
	if (!variant) return;
	const options = resolvedOptions(variant, materialOptionKey);
	const sizeOptionKey = variant.sizeOptionKey && options?.sizes.some(({ value }) => value === variant.sizeOptionKey)
		? variant.sizeOptionKey
		: undefined;
	updateVariant(index, { materialOptionKey, sizeOptionKey });
}
function removeVariant(key: string) {
	const nextErrors = { ...priceErrors };
	delete nextErrors[key];
	priceErrors = nextErrors;
	onValidityChange(!Object.values(nextErrors).some(Boolean));
	onChange([...removeCatalogProductVariant(variants, key)]);
}
</script>
<section aria-labelledby="catalog-variants-heading">
	<div class="section-heading"><span>03</span><div><h2 id="catalog-variants-heading">{fixedPrice ? "price" : "prices and options"}</h2><p>{fixedPrice ? `Set the price and availability for this ${productLabel}.` : `${variants.length} ${variants.length === 1 ? "variant" : "variants"}. Their order is saved exactly as shown.`}</p></div>{#if !fixedPrice}<button type="button" onclick={() => onChange(addCatalogProductVariant(variants))} disabled={disabled || variants.length >= CATALOG_PRODUCT_VARIANT_LIMIT}>add variant</button>{/if}</div>
	{#if variants.length >= CATALOG_PRODUCT_VARIANT_LIMIT}<p class="limit" role="status">This {productLabel} has reached the 100-variant limit.</p>{/if}
	{#if variants.length === 0}
		<p class="empty"><strong>No variants yet.</strong><span>Add a purchasable option when its price is known.</span></p>
	{:else}
		<ol>
			{#each variants as variant, index (variant.key)}
				{@const margin = marginFor(variant)}
				{@const options = resolvedOptions(variant)}
				{@const priceInputId = `catalog-price-${variant.key}`}
				{@const priceMessageId = `catalog-price-message-${variant.key}`}
				<li>
					<div class="variant-heading"><span class="position">{String(index + 1).padStart(2, "0")}</span><div><strong>variant {index + 1}</strong><small>{variant.key}</small></div></div>
					<div class:fixed={fixedPrice} class="variant-fields">
						{#if !fixedPrice && options}
							<EditorListbox id={`catalog-material-${variant.key}`} label="material" value={variant.materialOptionKey} options={pickerOptions(options.materials, variant.materialOptionKey)} placeholder="choose a material" {disabled} onChange={(value) => updateMaterial(index, value)} />
							<EditorListbox id={`catalog-size-${variant.key}`} label="size" value={variant.sizeOptionKey} options={pickerOptions(options.sizes, variant.sizeOptionKey)} placeholder={variant.materialOptionKey ? "choose a size" : "choose a material first"} disabled={disabled || !variant.materialOptionKey} onChange={(value) => updateVariant(index, { sizeOptionKey: value })} />
						{:else if !fixedPrice}
							<label>material key<input value={variant.materialOptionKey ?? ""} oninput={(event) => updateVariant(index, { materialOptionKey: slugifyCatalogOptionKey(event.currentTarget.value) || undefined })} maxlength="120" autocomplete="off" disabled={disabled} /></label>
							<label>size key<input value={variant.sizeOptionKey ?? ""} oninput={(event) => updateVariant(index, { sizeOptionKey: slugifyCatalogOptionKey(event.currentTarget.value) || undefined })} maxlength="120" autocomplete="off" disabled={disabled} /></label>
						{/if}
						<label>retail price (USD)<span class="money-input"><span aria-hidden="true">$</span><input id={priceInputId} inputmode="decimal" value={priceInputs[variant.key] ?? formatCatalogPriceDollars(variant.retailPriceCents)} oninput={(event) => updatePrice(index, event.currentTarget.value)} aria-label={`variant ${index + 1} retail price (USD)`} aria-invalid={Boolean(priceErrors[variant.key])} aria-describedby={priceErrors[variant.key] || margin ? priceMessageId : undefined} disabled={disabled} /></span>{#if priceErrors[variant.key]}<small id={priceMessageId} class="field-error">{priceErrors[variant.key]}</small>{/if}{#if margin}<output id={priceMessageId} for={priceInputId} class="margin-output" aria-live="polite"><small class="margin-summary">{margin.summary}</small>{#if margin.framedSummary}<small class="margin-summary">{margin.framedSummary}</small>{/if}</output>{/if}</label>
						<EditorSegmentedChoice id={`catalog-availability-${variant.key}`} label="availability" value={variant.status} options={[{ value: "enabled", label: "available" }, { value: "disabled", label: "not for sale" }]} {disabled} onChange={(value) => updateVariant(index, { status: value as "enabled" | "disabled" })} />
					</div>
					{#if !fixedPrice}<div class="variant-actions" role="group" aria-label={`Reorder variant ${index + 1}`}>
						<button type="button" onclick={() => onChange([...moveCatalogProductVariant(variants, index, -1)])} disabled={disabled || index === 0} aria-label={`Move variant ${index + 1} earlier`}>↑</button>
						<button type="button" onclick={() => onChange([...moveCatalogProductVariant(variants, index, 1)])} disabled={disabled || index === variants.length - 1} aria-label={`Move variant ${index + 1} later`}>↓</button>
						<button type="button" class="remove" onclick={() => removeVariant(variant.key)} disabled={disabled} aria-label={`Remove variant ${index + 1}`}>remove</button>
					</div>{/if}
				</li>
			{/each}
		</ol>
	{/if}
</section>
<style>
	section { padding: 20px 0 24px; border-top: 1px solid var(--admin-border-strong); }
	.section-heading { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 24px; }
	.section-heading > span, .position { color: var(--admin-text-subtle); font-size: .72rem; padding-top: 4px; }
	.section-heading > div { flex: 1; } h2 { margin: 0; color: var(--admin-heading); font-size: 1rem; font-weight: 500; }
	.section-heading p { margin: 5px 0 0; color: var(--admin-text-muted); font-size: .82rem; }
	button { min-height: 40px; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 9px 12px; background: transparent; color: var(--admin-text); font: inherit; font-size: .76rem; cursor: pointer; }
	button:disabled { opacity: .4; cursor: default; } ol { margin: 0; padding: 0; list-style: none; }
	li { display: grid; grid-template-columns: minmax(140px, .45fr) minmax(360px, 1.55fr) auto; gap: 18px; align-items: start; padding: 20px 0; border-top: 1px solid var(--admin-border); }
	.variant-heading { display: grid; grid-template-columns: 26px 1fr; gap: 8px; }
	.variant-heading strong, .variant-heading small { display: block; } .variant-heading strong { color: var(--admin-heading); font-size: .82rem; font-weight: 500; }
	.variant-heading small { overflow: hidden; margin-top: 5px; color: var(--admin-text-subtle); font-size: .65rem; text-overflow: ellipsis; }
	.variant-fields { display: grid; grid-template-columns: repeat(2, minmax(140px, 1fr)); gap: 14px; }
	.variant-fields.fixed { grid-template-columns: repeat(2, minmax(180px, 1fr)); }
	label { display: flex; flex-direction: column; gap: 7px; color: var(--admin-text-muted); font-size: .76rem; }
	input { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 10px 11px; background: var(--admin-bg); color: var(--admin-heading); font: inherit; text-transform: none; }
	.money-input { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; border: 1px solid var(--admin-border-strong); border-radius: 6px; background: var(--admin-bg); }
	.money-input > span { padding-left: 11px; color: var(--admin-text-muted); }
	.money-input input { border: 0; background: transparent; }
	.money-input > input:focus { outline: 0; }
	.money-input:focus-within { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.money-input:has(input[aria-invalid="true"]) { border-color: var(--status-rose); }
	.margin-output { display: grid; gap: 3px; }
	.margin-summary { color: var(--admin-text-muted); line-height: 1.45; }
	input:focus, button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; } [aria-invalid="true"] { border-color: var(--status-rose); } .field-error { color: var(--status-rose); }
	.variant-actions { display: grid; grid-template-columns: repeat(2, auto); gap: 6px; } .variant-actions .remove { grid-column: 1 / -1; }
	.empty { display: grid; gap: 7px; margin: 0; padding: 20px; border: 1px dashed var(--admin-border); border-radius: 10px; color: var(--admin-text-muted); }
	.empty strong { color: var(--admin-heading); font-weight: 500; }
	.limit { margin: -12px 0 18px; color: var(--admin-text-muted); font-size: .76rem; }
	@media (max-width: 900px) { li { grid-template-columns: 1fr; } .variant-actions { display: flex; flex-wrap: wrap; } }
	@media (max-width: 768px) { section { padding: 18px 0 22px; } .section-heading { flex-wrap: wrap; } .variant-fields { grid-template-columns: 1fr; } button { min-height: 44px; } }
</style>
