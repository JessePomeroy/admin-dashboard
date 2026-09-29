<script lang="ts">
import { dragHandle } from "svelte-dnd-action";
import { portfolioMediaUrl, type PortfolioMediaAsset } from "../../portfolioEditor";

let {
	variant,
	asset,
	mediaBaseUrl,
	position,
	fallbackName,
	inputId,
	altText,
	error,
	reviewRequested,
	isDndShadowItem = false,
	dragDisabled,
	dragLabel,
	onAltTextChange,
	onRemove,
}: {
	variant: "about" | "modeling";
	asset?: PortfolioMediaAsset;
	mediaBaseUrl: string;
	position: number;
	fallbackName: string;
	inputId: string;
	altText: string;
	error?: string;
	reviewRequested: boolean;
	isDndShadowItem?: boolean;
	dragDisabled: boolean;
	dragLabel: string;
	onAltTextChange: (value: string) => void;
	onRemove: () => void;
} = $props();
</script>

<li class:about={variant === "about"} class:dnd-shadow={isDndShadowItem}>
	<div class="image-summary">
		{#if asset}<img src={portfolioMediaUrl(mediaBaseUrl, asset.derivatives.thumb.key)} alt="" />{:else}<div class="missing">image unavailable</div>{/if}
		<div><strong>{asset?.originalFilename ?? fallbackName}</strong><span>position {position}</span></div>
	</div>
	<div class="placement-fields">
		<label>alt text<input id={inputId} maxlength="500" value={altText} oninput={(event) => onAltTextChange(event.currentTarget.value)} aria-invalid={reviewRequested && Boolean(error)} disabled={isDndShadowItem && variant === "about"} />{#if reviewRequested && error}<small class="field-error">{error}</small>{/if}</label>
	</div>
	<div class="image-actions">
		<button type="button" class="drag-handle" use:dragHandle disabled={dragDisabled || isDndShadowItem} aria-label={dragLabel}><span aria-hidden="true"></span></button>
		<button type="button" class="remove" onclick={onRemove} disabled={isDndShadowItem}>remove</button>
	</div>
</li>

<style>
	li { display: grid; grid-template-columns: minmax(180px, .65fr) minmax(260px, 1.35fr) auto; gap: 16px; align-items: start; padding: 18px 0; border-top: 1px solid var(--admin-border); }
	li.about { grid-template-columns: minmax(190px, .65fr) minmax(280px, 1.35fr) auto; }
	li.dnd-shadow { opacity: .34; }
	.image-summary { display: flex; gap: 12px; min-width: 0; align-items: center; }
	.image-summary > div { min-width: 0; }
	.image-summary img, .missing { width: 78px; height: 78px; flex: 0 0 auto; border-radius: 5px; object-fit: cover; background: var(--admin-bg); }
	.about .image-summary img, .about .missing { width: 84px; height: 84px; }
	.missing { display: grid; place-items: center; color: var(--admin-text-subtle); font-size: .62rem; text-align: center; }
	.about .missing { font-size: .64rem; }
	.image-summary strong, .image-summary span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.image-summary strong { color: var(--admin-heading); font-size: .76rem; font-weight: 500; }
	.about .image-summary strong { font-size: .78rem; }
	.image-summary span { margin-top: 5px; color: var(--admin-text-subtle); font-size: .68rem; }
	.placement-fields { display: grid; gap: 12px; }
	label { display: flex; flex-direction: column; gap: 7px; color: var(--admin-text-muted); font-size: .76rem; }
	input { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 10px 11px; background: var(--admin-bg); color: var(--admin-heading); font: inherit; text-transform: none; }
	input[aria-invalid="true"] { border-color: var(--status-rose); }
	input:focus-visible, button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.field-error { color: var(--status-rose); line-height: 1.45; }
	.image-actions { display: grid; gap: 6px; }
	button { min-height: 40px; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 7px 9px; background: transparent; color: var(--admin-text); font: inherit; font-size: .74rem; cursor: pointer; }
	.about button { font-size: .76rem; }
	button:disabled { opacity: .45; cursor: default; }
	.remove { color: var(--status-rose); }
	.about .remove { color: var(--admin-text); }
	.image-actions button { min-width: 40px; }
	.drag-handle { display: grid; place-items: center; min-width: 52px; padding: 0; border-color: transparent; color: var(--admin-text-muted); touch-action: none; }
	.about .drag-handle { min-width: 68px; }
	.drag-handle span { width: 12px; height: 18px; background: radial-gradient(circle, currentColor 1.3px, transparent 1.5px) 0 0 / 6px 6px; opacity: .62; }
	.drag-handle:hover:not(:disabled) { color: var(--admin-heading); }
	.drag-handle:active:not(:disabled) { cursor: grabbing; }
	.about .remove { min-height: 36px; }
	@media (max-width: 820px) {
		li, li.about { grid-template-columns: 1fr; }
		.image-actions { display: flex; flex-wrap: wrap; }
		button, .about .remove { min-height: 44px; }
	}
</style>
