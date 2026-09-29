<script lang="ts">
import { dragHandleZone } from "svelte-dnd-action";
import {
	ABOUT_PORTRAIT_MAX,
	type AboutPublishIssue,
} from "../../aboutPage";
import type { AboutPortraitDraft } from "../../config";
import type { PortfolioMediaAsset } from "../../portfolioEditor";
import MediaPlacementRow from "./MediaPlacementRow.svelte";
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
				<MediaPlacementRow
					variant="about"
					{asset}
					{mediaBaseUrl}
					position={index + 1}
					fallbackName={`portrait ${index + 1}`}
					inputId={`about-portrait-${portrait.key}-alt`}
					altText={portrait.altText ?? ""}
					error={issue?.message}
					{reviewRequested}
					isDndShadowItem={portrait.isDndShadowItem}
					dragDisabled={portraits.length < 2}
					dragLabel={`Drag ${asset?.originalFilename ?? `portrait ${index + 1}`} to reorder`}
					onAltTextChange={(altText) => update(portrait.key, { altText })}
					onRemove={() => remove(portrait.key)}
				/>
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
	button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	ol { margin: 0; padding: 0; list-style: none; }
	:global(#dnd-action-dragged-el) { grid-template-columns: minmax(190px, .65fr) minmax(280px, 1.35fr) auto !important; box-sizing: border-box; padding: 18px !important; overflow: hidden; border-radius: 6px !important; outline: 1px solid var(--admin-border-strong); box-shadow: 0 12px 30px color-mix(in srgb, #000 30%, transparent); opacity: .98; pointer-events: none; }
	:global(#dnd-action-dragged-el > *) { min-width: 0; }
	.empty { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px 18px; margin-top: 16px; text-align: left; font-size: .76rem; }
	.empty strong { color: var(--admin-heading); }
	.empty p { max-width: 62ch; margin: 0; color: var(--admin-text-muted); }
	@media (max-width: 820px) { section { padding: 22px 0 26px; } .section-heading { align-items: flex-start; flex-direction: column; } :global(#dnd-action-dragged-el) { grid-template-columns: 1fr !important; } :global(#dnd-action-dragged-el .placement-fields) { display: none; } button { min-height: 44px; } }
</style>
