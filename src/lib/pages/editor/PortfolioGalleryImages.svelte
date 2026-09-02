<script lang="ts">
import { dragHandle, dragHandleZone } from "svelte-dnd-action";
import {
	portfolioMediaUrl,
	type PortfolioMediaAsset,
	type PortfolioPlacementDraft,
	type PortfolioPublishIssue,
} from "../../portfolioEditor";
import PortfolioMediaUploader from "./PortfolioMediaUploader.svelte";

let {
	placements,
	mediaById,
	mediaBaseUrl,
	publishIssues,
	reviewRequested,
	publishingEnabled = true,
	onChange,
	onChooseMedia,
	uploadEndpoint,
	onUploadReady,
}: {
	placements: PortfolioPlacementDraft[];
	mediaById: Map<string, PortfolioMediaAsset>;
	mediaBaseUrl: string;
	publishIssues: PortfolioPublishIssue[];
	reviewRequested: boolean;
	publishingEnabled?: boolean;
	onChange: (placements: PortfolioPlacementDraft[]) => void;
	onChooseMedia: () => void;
	uploadEndpoint?: string;
	onUploadReady: (asset: PortfolioMediaAsset) => void;
} = $props();

type DraggablePlacement = PortfolioPlacementDraft & {
	id: string;
	isDndShadowItem?: boolean;
};

let dragItems = $state<DraggablePlacement[] | null>(null);
let baseDragItems: DraggablePlacement[] = $derived(placements.map((placement) => ({
	...placement,
	id: placement.key,
})));
let visiblePlacements: DraggablePlacement[] = $derived(dragItems ?? baseDragItems);

function removePlacement(key: string) {
	onChange(placements.filter((placement) => placement.key !== key));
}

function updatePlacement(key: string, update: Partial<PortfolioPlacementDraft>) {
	onChange(placements.map((placement) => placement.key === key
		? { ...placement, ...update }
		: placement));
}

function handleConsider(event: CustomEvent<{ items: DraggablePlacement[] }>) {
	if (placements.length < 2) return;
	dragItems = event.detail.items;
}

function handleFinalize(event: CustomEvent<{ items: DraggablePlacement[] }>) {
	if (placements.length < 2) return;
	dragItems = null;
	onChange(event.detail.items
		.filter((placement) => !placement.isDndShadowItem)
		.map(({ id: _id, isDndShadowItem: _shadow, ...placement }) => placement));
}
</script>

<section aria-labelledby="gallery-images-heading">
	<div class="section-heading">
		<div><h2 id="gallery-images-heading" tabindex="-1">images</h2><p>{placements.length} {placements.length === 1 ? "image" : "images"} in this draft. Drag images to set their {publishingEnabled ? "public" : "saved"} order.</p></div>
		<button type="button" class="secondary" onclick={onChooseMedia}>choose from media</button>
	</div>
	{#if uploadEndpoint}
		<PortfolioMediaUploader endpoint={uploadEndpoint} onReady={onUploadReady} />
	{/if}

	{#if placements.length === 0}
		<div class="empty"><strong>No images selected.</strong><p>Upload new images here or choose a ready image from the shared site media library.</p></div>
	{:else}
		<ol
			class="image-list"
			aria-label="Reorder gallery images"
			use:dragHandleZone={{
				items: visiblePlacements,
				dragDisabled: placements.length < 2,
				flipDurationMs: 140,
				morphDisabled: true,
				dropTargetStyle: {},
				type: "portfolio-gallery-images",
			}}
			onconsider={handleConsider}
			onfinalize={handleFinalize}
		>
			{#each visiblePlacements as placement, index (placement.id)}
				{@const asset = mediaById.get(placement.assetId)}
				{@const accessibilityIssue = publishIssues.find((issue) => issue.fieldId === `placement-${placement.key}-alt`)}
				<li class:dnd-shadow={placement.isDndShadowItem}>
					<button
						type="button"
						class="drag-handle"
						use:dragHandle
						disabled={placements.length < 2 || placement.isDndShadowItem}
						aria-label={`Drag ${asset?.originalFilename ?? `image ${index + 1}`} to reorder`}
					><span aria-hidden="true"></span></button>
					<figure class="image-summary">
						{#if asset}<img src={portfolioMediaUrl(mediaBaseUrl, asset.derivatives.thumb.key)} alt="" />{:else}<div class="missing">image unavailable</div>{/if}
						<figcaption><strong>{asset?.originalFilename ?? `image ${index + 1}`}</strong><span>position {index + 1}</span></figcaption>
					</figure>
					<div class="placement-fields">
						<label>alt text<input id={`placement-${placement.key}-alt`} maxlength="500" value={placement.altText ?? ""} oninput={(event) => updatePlacement(placement.key, { altText: event.currentTarget.value })} aria-invalid={reviewRequested && Boolean(accessibilityIssue)} disabled={placement.isDndShadowItem} />{#if reviewRequested && accessibilityIssue}<small>{accessibilityIssue.message}</small>{/if}</label>
						<label>caption<input maxlength="1000" value={placement.caption ?? ""} oninput={(event) => updatePlacement(placement.key, { caption: event.currentTarget.value })} disabled={placement.isDndShadowItem} /></label>
					</div>
					<div class="actions">
						<button type="button" class="remove" onclick={() => removePlacement(placement.key)} disabled={placement.isDndShadowItem} aria-label={`Remove ${asset?.originalFilename ?? `image ${index + 1}`}`}>remove</button>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	section { margin-top: 0; padding: 20px 0 24px; border-top: 1px solid var(--admin-border-strong); }
	.section-heading { display: flex; justify-content: space-between; gap: 20px; align-items: center; margin-bottom: 22px; }
	h2 { margin: 0; color: var(--admin-heading); font-size: 1rem; font-weight: 500; }
	.section-heading p { margin: 5px 0 0; color: var(--admin-text-muted); font-size: .8rem; }
	button { min-height: 40px; border: 1px solid transparent; border-radius: 6px; padding: 9px 13px; background: var(--admin-accent); color: var(--admin-bg); font: inherit; font-size: .76rem; cursor: pointer; }
	button:disabled { opacity: .45; cursor: default; }
	button:focus-visible, input:focus { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.secondary, .remove { border-color: var(--admin-border-strong); background: transparent; color: var(--admin-text); }
	.image-list { width: 100%; max-width: 100%; box-sizing: border-box; margin: 0; padding: 0; border-top: 1px solid var(--admin-border); list-style: none; }
	li { display: grid; grid-template-columns: 28px minmax(150px, 190px) minmax(0, 1fr) auto; gap: 18px; align-items: center; min-width: 0; padding: 14px 0; border-bottom: 1px solid var(--admin-border); background: transparent; }
	li.dnd-shadow { opacity: .34; }
	.image-summary { min-width: 0; margin: 0; }
	.image-summary img, .missing { display: block; width: 100%; aspect-ratio: 4 / 3; border-radius: 3px; object-fit: cover; background: var(--admin-bg); }
	.missing { display: grid; place-items: center; color: var(--admin-text-subtle); font-size: .64rem; text-align: center; }
	figcaption { min-width: 0; margin-top: 8px; }
	.image-summary strong, .image-summary span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.image-summary strong { color: var(--admin-heading); font-size: .75rem; font-weight: 500; }
	.image-summary span { margin-top: 4px; color: var(--admin-text-subtle); font-size: .66rem; }
	.placement-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; min-width: 0; }
	label { display: flex; flex-direction: column; gap: 7px; color: var(--admin-text-muted); font-size: .76rem; }
	input { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 0; padding: 10px 11px; background: var(--editor-control); color: var(--admin-heading); font: inherit; text-transform: none; }
	[aria-invalid="true"] { border-color: var(--status-rose); }
	small { color: var(--status-rose); line-height: 1.45; }
	.actions { align-self: center; padding-top: 23px; }
	.remove { min-height: 36px; padding: 7px 9px; color: var(--status-rose); }
	.drag-handle { display: grid; place-items: center; width: 28px; min-height: 52px; padding: 0; border: 0; background: transparent; color: var(--admin-text-muted); touch-action: none; }
	.drag-handle span { width: 12px; height: 18px; background: radial-gradient(circle, currentColor 1.3px, transparent 1.5px) 0 0 / 6px 6px; opacity: .62; }
	.drag-handle:hover:not(:disabled) { color: var(--admin-heading); }
	.drag-handle:active:not(:disabled) { cursor: grabbing; }
	:global(#dnd-action-dragged-el) { grid-template-columns: 28px minmax(150px, 190px) minmax(0, 1fr) auto !important; box-sizing: border-box; padding: 14px !important; overflow: hidden; border-radius: 4px !important; outline: 1px solid var(--admin-border-strong); box-shadow: 0 12px 30px color-mix(in srgb, #000 30%, transparent); opacity: .98; pointer-events: none; }
	:global(#dnd-action-dragged-el > *) { min-width: 0; }
	.empty { display: grid; place-items: center; min-height: 180px; text-align: center; }
	.empty strong { color: var(--admin-heading); }
	.empty p { margin: 7px 0 0; color: var(--admin-text-muted); }
	@media (max-width: 820px) {
		section { padding: 18px 0 22px; }
		.section-heading { align-items: flex-start; flex-direction: column; }
		li { grid-template-columns: 28px minmax(0, 1fr); align-items: start; gap: 12px; }
		.image-summary { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 12px; align-items: center; }
		.placement-fields, .actions { grid-column: 2; }
		.placement-fields { grid-template-columns: 1fr; }
		.actions { justify-self: end; padding-top: 0; }
		:global(#dnd-action-dragged-el) { grid-template-columns: 28px minmax(0, 1fr) !important; }
		:global(#dnd-action-dragged-el .placement-fields) { display: none; }
		button, .remove { min-height: 44px; }
	}
</style>
