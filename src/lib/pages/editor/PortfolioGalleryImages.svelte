<script lang="ts">
import {
	movePortfolioPlacement,
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

function removePlacement(index: number) {
	onChange(placements.filter((_, itemIndex) => itemIndex !== index));
}

function movePlacement(index: number, direction: -1 | 1) {
	onChange(movePortfolioPlacement(placements, index, direction));
}

</script>

<section aria-labelledby="gallery-images-heading">
	<div class="section-heading">
		<div><h2 id="gallery-images-heading" tabindex="-1">images</h2><p>{placements.length} {placements.length === 1 ? "image" : "images"} in this draft. Use the arrow controls to set their {publishingEnabled ? "public" : "saved"} order.</p></div>
		<button type="button" class="secondary" onclick={onChooseMedia}>choose from media</button>
	</div>
	{#if uploadEndpoint}
		<PortfolioMediaUploader endpoint={uploadEndpoint} onReady={onUploadReady} />
	{/if}

	{#if placements.length === 0}
		<div class="empty"><strong>No images selected.</strong><p>Upload new images here or choose a ready image from the shared site media library.</p></div>
	{:else}
		<ol>
			{#each placements as placement, index (placement.key)}
				{@const asset = mediaById.get(placement.assetId)}
				{@const accessibilityIssue = publishIssues.find((issue) => issue.fieldId === `placement-${placement.key}-alt`)}
				<li>
					<div class="image-summary">
						{#if asset}<img src={portfolioMediaUrl(mediaBaseUrl, asset.derivatives.thumb.key)} alt="" />{:else}<div class="missing">image unavailable</div>{/if}
						<div><strong>{asset?.originalFilename ?? `image ${index + 1}`}</strong><span>position {index + 1}</span></div>
					</div>
					<div class="placement-fields">
						<label>alt text<input id={`placement-${placement.key}-alt`} maxlength="500" value={placement.altText ?? ""} oninput={(event) => onChange(placements.map((item, itemIndex) => itemIndex === index ? { ...item, altText: event.currentTarget.value } : item))} aria-invalid={reviewRequested && Boolean(accessibilityIssue)} />{#if reviewRequested && accessibilityIssue}<small>{accessibilityIssue.message}</small>{/if}</label>
						<label>caption<input maxlength="1000" value={placement.caption ?? ""} oninput={(event) => onChange(placements.map((item, itemIndex) => itemIndex === index ? { ...item, caption: event.currentTarget.value } : item))} /></label>
					</div>
					<div class="actions" role="group" aria-label={`Reorder ${asset?.originalFilename ?? `image ${index + 1}`}`}>
						<button type="button" class="secondary order" onclick={() => movePlacement(index, -1)} disabled={index === 0} aria-label="Move image earlier">↑</button>
						<button type="button" class="secondary order" onclick={() => movePlacement(index, 1)} disabled={index === placements.length - 1} aria-label="Move image later">↓</button>
						<button type="button" class="remove" onclick={() => removePlacement(index)} aria-label={`Remove ${asset?.originalFilename ?? `image ${index + 1}`}`}>remove</button>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	section { margin-top: 20px; padding: 26px; border: 1px solid var(--admin-border); border-radius: 10px; background: var(--admin-surface); }
	.section-heading { display: flex; justify-content: space-between; gap: 20px; align-items: center; margin-bottom: 22px; }
	h2 { margin: 0; color: var(--admin-heading); font-size: 1rem; font-weight: 500; }
	.section-heading p { margin: 5px 0 0; color: var(--admin-text-muted); font-size: .8rem; }
	button { min-height: 40px; border: 1px solid transparent; border-radius: 6px; padding: 9px 13px; background: var(--admin-accent); color: var(--admin-bg); font: inherit; font-size: .76rem; cursor: pointer; }
	button:disabled { opacity: .45; cursor: default; }
	button:focus-visible, input:focus { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.secondary, .remove { border-color: var(--admin-border-strong); background: transparent; color: var(--admin-text); }
	ol { margin: 0; padding: 0; list-style: none; }
	li { display: grid; grid-template-columns: minmax(190px, .7fr) minmax(260px, 1.3fr) auto; gap: 16px; align-items: start; padding: 18px 0; border-top: 1px solid var(--admin-border); }
	.image-summary { display: flex; gap: 12px; min-width: 0; align-items: center; }
	.image-summary img, .missing { width: 84px; height: 72px; flex: 0 0 auto; border-radius: 5px; object-fit: cover; background: var(--admin-bg); }
	.missing { display: grid; place-items: center; color: var(--admin-text-subtle); font-size: .64rem; text-align: center; }
	.image-summary strong, .image-summary span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.image-summary strong { color: var(--admin-heading); font-size: .78rem; font-weight: 500; }
	.image-summary span { margin-top: 5px; color: var(--admin-text-subtle); font-size: .68rem; }
	.placement-fields { display: grid; gap: 12px; }
	label { display: flex; flex-direction: column; gap: 7px; color: var(--admin-text-muted); font-size: .76rem; }
	input { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 10px 11px; background: var(--admin-bg); color: var(--admin-heading); font: inherit; text-transform: none; }
	[aria-invalid="true"] { border-color: var(--status-rose); }
	small { color: var(--status-rose); line-height: 1.45; }
	.actions { display: grid; grid-template-columns: repeat(2, auto); gap: 6px; }
	.order { min-width: 38px; padding: 7px 9px; }
	.remove { grid-column: 1 / -1; min-height: 36px; padding: 7px 9px; }
	.empty { display: grid; place-items: center; min-height: 180px; text-align: center; }
	.empty strong { color: var(--admin-heading); }
	.empty p { margin: 7px 0 0; color: var(--admin-text-muted); }
	@media (max-width: 820px) {
		section { padding: 20px; }
		.section-heading { align-items: flex-start; flex-direction: column; }
		li { grid-template-columns: 1fr; }
		.actions { display: flex; flex-wrap: wrap; }
		button, .remove { min-height: 44px; }
	}
</style>
