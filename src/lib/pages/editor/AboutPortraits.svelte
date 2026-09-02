<script lang="ts">
import { dragHandle, dragHandleZone } from "svelte-dnd-action";
import {
	ABOUT_PORTRAIT_MAX,
	type AboutPublishIssue,
} from "../../aboutPage";
import type { AboutPortraitDraft } from "../../config";
import { portfolioMediaUrl, type PortfolioMediaAsset } from "../../portfolioEditor";
import PortfolioMediaUploader from "./PortfolioMediaUploader.svelte";

let {
	portraits,
	mediaById,
	mediaBaseUrl,
	publishIssues,
	reviewRequested,
	uploadEndpoint,
	onChange,
	onChooseMedia,
	onUploadReady,
}: {
	portraits: AboutPortraitDraft[];
	mediaById: Map<string, PortfolioMediaAsset>;
	mediaBaseUrl: string;
	publishIssues: AboutPublishIssue[];
	reviewRequested: boolean;
	uploadEndpoint?: string;
	onChange: (portraits: AboutPortraitDraft[]) => void;
	onChooseMedia: () => void;
	onUploadReady: (asset: PortfolioMediaAsset) => void;
} = $props();

type DraggablePortrait = AboutPortraitDraft & {
	id: string;
	isDndShadowItem?: boolean;
};

let dragItems = $state<DraggablePortrait[] | null>(null);
let baseDragItems: DraggablePortrait[] = $derived(portraits.map((portrait) => ({
	...portrait,
	id: portrait.key,
})));
let visiblePortraits: DraggablePortrait[] = $derived(dragItems ?? baseDragItems);

function update(key: string, change: Partial<AboutPortraitDraft>) {
	onChange(portraits.map((portrait) => portrait.key === key
		? { ...portrait, ...change }
		: portrait));
}

function remove(key: string) {
	onChange(portraits.filter((portrait) => portrait.key !== key));
}

function handleConsider(event: CustomEvent<{ items: DraggablePortrait[] }>) {
	if (portraits.length < 2) return;
	dragItems = event.detail.items;
}

function handleFinalize(event: CustomEvent<{ items: DraggablePortrait[] }>) {
	if (portraits.length < 2) return;
	dragItems = null;
	onChange(event.detail.items
		.filter((portrait) => !portrait.isDndShadowItem)
		.map(({ id: _id, isDndShadowItem: _shadow, ...portrait }) => portrait));
}
</script>

<section aria-labelledby="about-portraits-heading">
	<div class="section-heading">
		<div>
			<h2 id="about-portraits-heading" tabindex="-1">portraits</h2>
			<p>{portraits.length} of {ABOUT_PORTRAIT_MAX} images. One image renders as a portrait; more form a deliberately ordered sequence.</p>
		</div>
		<button type="button" class="secondary" onclick={onChooseMedia} disabled={portraits.length >= ABOUT_PORTRAIT_MAX}>choose from media</button>
	</div>
	{#if uploadEndpoint && portraits.length < ABOUT_PORTRAIT_MAX}
		<PortfolioMediaUploader endpoint={uploadEndpoint} contextLabel="About page" onReady={onUploadReady} />
	{/if}

	{#if portraits.length === 0}
		<div class="empty"><strong>No portraits selected.</strong><p>Upload here or choose a ready image from the shared site media library.</p></div>
	{:else}
		<ol
			aria-label="Reorder About portraits"
			use:dragHandleZone={{
				items: visiblePortraits,
				dragDisabled: portraits.length < 2,
				flipDurationMs: 140,
				morphDisabled: true,
				dropTargetStyle: {},
				type: "about-portraits",
			}}
			onconsider={handleConsider}
			onfinalize={handleFinalize}
		>
			{#each visiblePortraits as portrait, index (portrait.id)}
				{@const asset = mediaById.get(portrait.assetId)}
				{@const issue = publishIssues.find((item) => item.fieldId === `about-portrait-${portrait.key}-alt`)}
				<li class:dnd-shadow={portrait.isDndShadowItem}>
					<div class="image-summary">
						{#if asset}<img src={portfolioMediaUrl(mediaBaseUrl, asset.derivatives.thumb.key)} alt="" />{:else}<div class="missing">image unavailable</div>{/if}
						<div><strong>{asset?.originalFilename ?? `portrait ${index + 1}`}</strong><span>position {index + 1}</span></div>
					</div>
					<div class="placement-fields">
						<label>alt text<input id={`about-portrait-${portrait.key}-alt`} maxlength="500" value={portrait.altText ?? ""} oninput={(event) => update(portrait.key, { altText: event.currentTarget.value })} aria-invalid={reviewRequested && Boolean(issue)} disabled={portrait.isDndShadowItem} />{#if reviewRequested && issue}<small class="field-error">{issue.message}</small>{/if}</label>
					</div>
					<div class="actions">
						<button type="button" class="drag-handle" use:dragHandle disabled={portraits.length < 2 || portrait.isDndShadowItem} aria-label={`Drag ${asset?.originalFilename ?? `portrait ${index + 1}`} to reorder`}><span aria-hidden="true"></span></button>
						<button type="button" class="remove" onclick={() => remove(portrait.key)} disabled={portrait.isDndShadowItem}>remove</button>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	section { margin-top: 20px; padding: 24px 0 28px; border-top: 1px solid var(--admin-border-strong); }
	.section-heading { display: flex; justify-content: space-between; gap: 20px; align-items: center; margin-bottom: 22px; }
	h2 { margin: 0; color: var(--admin-heading); font-size: 1rem; font-weight: 500; }
	.section-heading p { margin: 5px 0 0; color: var(--admin-text-muted); font-size: .8rem; }
	button { min-height: 40px; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 9px 13px; background: transparent; color: var(--admin-text); font: inherit; font-size: .76rem; cursor: pointer; }
	button:disabled { opacity: .45; cursor: default; }
	button:focus-visible, input:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	ol { margin: 0; padding: 0; list-style: none; }
	li { display: grid; grid-template-columns: minmax(190px, .65fr) minmax(280px, 1.35fr) auto; gap: 16px; align-items: start; padding: 18px 0; border-top: 1px solid var(--admin-border); }
	li.dnd-shadow { opacity: .34; }
	.image-summary { display: flex; gap: 12px; min-width: 0; align-items: center; }
	.image-summary img, .missing { width: 84px; height: 84px; flex: 0 0 auto; border-radius: 5px; object-fit: cover; background: var(--admin-bg); }
	.missing { display: grid; place-items: center; color: var(--admin-text-subtle); font-size: .64rem; text-align: center; }
	.image-summary strong, .image-summary span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.image-summary strong { color: var(--admin-heading); font-size: .78rem; font-weight: 500; }
	.image-summary span { margin-top: 5px; color: var(--admin-text-subtle); font-size: .68rem; }
	.placement-fields { display: grid; gap: 12px; }
	label { display: flex; flex-direction: column; gap: 7px; color: var(--admin-text-muted); font-size: .76rem; }
	input:not([type]) { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 10px 11px; background: var(--admin-bg); color: var(--admin-heading); font: inherit; text-transform: none; }
	[aria-invalid="true"] { border-color: var(--status-rose); }
	.actions { display: grid; gap: 6px; }
	.drag-handle { display: grid; place-items: center; min-width: 68px; padding: 0; border-color: transparent; color: var(--admin-text-muted); touch-action: none; }
	.drag-handle span { width: 12px; height: 18px; background: radial-gradient(circle, currentColor 1.3px, transparent 1.5px) 0 0 / 6px 6px; opacity: .62; }
	.drag-handle:hover:not(:disabled) { color: var(--admin-heading); }
	.drag-handle:active:not(:disabled) { cursor: grabbing; }
	.remove { min-height: 36px; padding: 7px 9px; }
	:global(#dnd-action-dragged-el) { grid-template-columns: minmax(190px, .65fr) minmax(280px, 1.35fr) auto !important; box-sizing: border-box; padding: 18px !important; overflow: hidden; border-radius: 6px !important; outline: 1px solid var(--admin-border-strong); box-shadow: 0 12px 30px color-mix(in srgb, #000 30%, transparent); opacity: .98; pointer-events: none; }
	:global(#dnd-action-dragged-el > *) { min-width: 0; }
	.empty { display: grid; place-items: center; min-height: 180px; text-align: center; }
	.empty strong { color: var(--admin-heading); }
	.empty p { margin: 7px 0 0; color: var(--admin-text-muted); }
	.field-error { color: var(--status-rose); line-height: 1.45; }
	@media (max-width: 820px) { section { padding: 22px 0 26px; } .section-heading { align-items: flex-start; flex-direction: column; } li { grid-template-columns: 1fr; } .actions { display: flex; flex-wrap: wrap; } :global(#dnd-action-dragged-el) { grid-template-columns: 1fr !important; } :global(#dnd-action-dragged-el .placement-fields) { display: none; } button, .remove { min-height: 44px; } }
</style>
