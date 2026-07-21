<script lang="ts">
import { addCatalogProductVariant, CATALOG_PRODUCT_VARIANT_LIMIT, moveCatalogProductVariant, parseCatalogPriceCents, removeCatalogProductVariant, slugifyCatalogOptionKey, type CatalogProductVariantDraftForm } from "../../catalogProductEditor";
let { variants, disabled = false, productLabel = "print", onChange, onValidityChange = () => {} }: { variants: CatalogProductVariantDraftForm[]; disabled?: boolean; productLabel?: string; onChange: (variants: CatalogProductVariantDraftForm[]) => void; onValidityChange?: (valid: boolean) => void } = $props();
let priceErrors = $state<Record<string, string>>({});
function updateVariant(index: number, patch: Partial<CatalogProductVariantDraftForm>) {
	onChange(variants.map((variant, itemIndex) => itemIndex === index ? { ...variant, ...patch } : variant));
}
function updatePrice(index: number, value: string) {
	const variant = variants[index];
	if (!variant) return;
	try {
		const retailPriceCents = parseCatalogPriceCents(value);
		const nextErrors = { ...priceErrors, [variant.key]: "" };
		priceErrors = nextErrors;
		onValidityChange(!Object.values(nextErrors).some(Boolean));
		updateVariant(index, { retailPriceCents });
	} catch (error) {
		priceErrors = { ...priceErrors, [variant.key]: error instanceof Error ? error.message : "Enter valid whole cents." };
		onValidityChange(false);
	}
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
	<div class="section-heading"><span>03</span><div><h2 id="catalog-variants-heading">prices and options</h2><p>{variants.length} {variants.length === 1 ? "variant" : "variants"}. Their order is saved exactly as shown.</p></div><button type="button" onclick={() => onChange(addCatalogProductVariant(variants))} disabled={disabled || variants.length >= CATALOG_PRODUCT_VARIANT_LIMIT}>add variant</button></div>
	{#if variants.length >= CATALOG_PRODUCT_VARIANT_LIMIT}<p class="limit" role="status">This {productLabel} has reached the 100-variant limit.</p>{/if}
	{#if variants.length === 0}
		<p class="empty"><strong>No variants yet.</strong><span>Add a purchasable option when its price is known.</span></p>
	{:else}
		<ol>
			{#each variants as variant, index (variant.key)}
				<li>
					<div class="variant-heading"><span class="position">{String(index + 1).padStart(2, "0")}</span><div><strong>variant {index + 1}</strong><small>{variant.key}</small></div></div>
					<div class="variant-fields">
						<label>material key<input value={variant.materialOptionKey ?? ""} oninput={(event) => updateVariant(index, { materialOptionKey: slugifyCatalogOptionKey(event.currentTarget.value) || undefined })} maxlength="120" autocomplete="off" disabled={disabled} /></label>
						<label>size key<input value={variant.sizeOptionKey ?? ""} oninput={(event) => updateVariant(index, { sizeOptionKey: slugifyCatalogOptionKey(event.currentTarget.value) || undefined })} maxlength="120" autocomplete="off" disabled={disabled} /></label>
						<label>retail price (cents)<input inputmode="numeric" value={variant.retailPriceCents?.toString() ?? ""} oninput={(event) => updatePrice(index, event.currentTarget.value)} aria-invalid={Boolean(priceErrors[variant.key])} disabled={disabled} /><small>Enter whole cents; 1250 is $12.50.</small>{#if priceErrors[variant.key]}<small class="field-error">{priceErrors[variant.key]}</small>{/if}</label>
						<label>availability<select value={variant.status} onchange={(event) => updateVariant(index, { status: event.currentTarget.value as "enabled" | "disabled" })} disabled={disabled}><option value="enabled">enabled</option><option value="disabled">disabled</option></select></label>
					</div>
					<div class="variant-actions" role="group" aria-label={`Reorder variant ${index + 1}`}>
						<button type="button" onclick={() => onChange([...moveCatalogProductVariant(variants, index, -1)])} disabled={disabled || index === 0} aria-label={`Move variant ${index + 1} earlier`}>↑</button>
						<button type="button" onclick={() => onChange([...moveCatalogProductVariant(variants, index, 1)])} disabled={disabled || index === variants.length - 1} aria-label={`Move variant ${index + 1} later`}>↓</button>
						<button type="button" class="remove" onclick={() => removeVariant(variant.key)} disabled={disabled} aria-label={`Remove variant ${index + 1}`}>remove</button>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</section>
<style>
	section { padding: 28px; border: 1px solid var(--admin-border); border-radius: 10px; background: var(--admin-surface); }
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
	label { display: flex; flex-direction: column; gap: 7px; color: var(--admin-text-muted); font-size: .76rem; }
	input, select { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 10px 11px; background: var(--admin-bg); color: var(--admin-heading); font: inherit; text-transform: none; }
	input:focus, select:focus, button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; } [aria-invalid="true"] { border-color: var(--status-rose); } .field-error { color: var(--status-rose); }
	.variant-actions { display: grid; grid-template-columns: repeat(2, auto); gap: 6px; } .variant-actions .remove { grid-column: 1 / -1; }
	.empty { display: grid; gap: 7px; margin: 0; padding: 20px; border: 1px dashed var(--admin-border); border-radius: 10px; color: var(--admin-text-muted); }
	.empty strong { color: var(--admin-heading); font-weight: 500; }
	.limit { margin: -12px 0 18px; color: var(--admin-text-muted); font-size: .76rem; }
	@media (max-width: 900px) { li { grid-template-columns: 1fr; } .variant-actions { display: flex; flex-wrap: wrap; } }
	@media (max-width: 768px) { section { padding: 20px; } .section-heading { flex-wrap: wrap; } .variant-fields { grid-template-columns: 1fr; } button { min-height: 44px; } }
</style>
