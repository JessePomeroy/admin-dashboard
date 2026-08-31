<script lang="ts">
import { dragHandle, dragHandleZone } from "svelte-dnd-action";
import {
	CATALOG_PRODUCT_WEB_MEDIA_LIMIT,
	removeCatalogProductWebMedia,
	reorderCatalogProductWebMedia,
	type CatalogProductKind,
	type CatalogProductSetMemberDraftForm,
	type CatalogProductWebMediaDraftForm,
} from "../../catalogProductEditor";
import {
	portfolioMediaUrl,
	type PortfolioMediaAsset,
} from "../../portfolioEditor";
import type { CatalogProductArtworkStatus } from "../../catalogProductArtworkUpload";
import CatalogProductArtworkUploader from "./CatalogProductArtworkUploader.svelte";
import PortfolioMediaUploader from "./PortfolioMediaUploader.svelte";

let {
	placements,
	productKind,
	members,
	mediaById,
	mediaBaseUrl,
	uploadEndpoint,
	disabled = false,
	onChange,
	onChooseMedia,
	onUploadReady,
	onUploadArtwork,
}: {
	placements: CatalogProductWebMediaDraftForm[];
	productKind: CatalogProductKind;
	members: CatalogProductSetMemberDraftForm[];
	mediaById: Map<string, PortfolioMediaAsset>;
	mediaBaseUrl: string;
	uploadEndpoint?: string;
	disabled?: boolean;
	onChange: (placements: CatalogProductWebMediaDraftForm[]) => void;
	onChooseMedia: () => void;
	onUploadReady: (asset: PortfolioMediaAsset) => void;
	onUploadArtwork?: (
		file: File,
		onStatus: (status: CatalogProductArtworkStatus) => void,
	) => Promise<void>;
} = $props();

let actionError = $state("");
type DraggablePlacement = CatalogProductWebMediaDraftForm & {
	id: string;
	isDndShadowItem?: boolean;
};
let dragItems = $state<DraggablePlacement[] | null>(null);
let visiblePlacements = $derived(
	placements.filter((placement) => placement.role !== "social_share"),
);
let leadingPlacements = $derived(
	visiblePlacements.filter((placement) => placement.role === "primary" || placement.role === "cover"),
);
let baseGalleryItems = $derived(
	visiblePlacements
		.filter((placement) => placement.role === "gallery")
		.map((placement) => ({ ...placement, id: placement.key })),
);
let galleryItems = $derived(dragItems ?? baseGalleryItems);
let trailingPlacements = $derived(
	visiblePlacements.filter((placement) => placement.role === "set_member"),
);
let coverAttached = $derived(
	productKind === "print_set"
	&& placements.some((placement) => placement.role === "cover"),
);
let primaryAttached = $derived(
	productKind === "print"
	&& placements.some((placement) => placement.role === "primary"),
);
let usesArtworkUpload = $derived(
	Boolean(onUploadArtwork && (productKind === "print" || productKind === "print_set")),
);
let hasImageCapacity = $derived(
	placements.length < CATALOG_PRODUCT_WEB_MEDIA_LIMIT
	&& (usesArtworkUpload || !coverAttached),
);
let artworkCapacity = $derived(productKind === "print_set"
	? Math.max(0, Math.min(
		20 - members.length,
		CATALOG_PRODUCT_WEB_MEDIA_LIMIT - placements.length - (coverAttached ? 0 : 1),
	))
	: primaryAttached || placements.length < CATALOG_PRODUCT_WEB_MEDIA_LIMIT ? 1 : 0);

function linkedToSetMember(key: string) {
	return members.some((member) => member.mediaPlacementKey === key);
}

function updateAltText(key: string, altText: string) {
	actionError = "";
	onChange(placements.map((placement) =>
		placement.key === key ? { ...placement, altText } : { ...placement }
	));
}

function remove(key: string) {
	actionError = "";
	try {
		onChange(removeCatalogProductWebMedia(placements, key, members));
	} catch (error) {
		actionError = error instanceof Error ? error.message : "This image could not be removed.";
	}
}

function displayIndex(key: string) {
	return visiblePlacements.findIndex((placement) => placement.key === key) + 1;
}

function handleGalleryConsider(event: CustomEvent<{ items: DraggablePlacement[] }>) {
	if (disabled || baseGalleryItems.length < 2) return;
	dragItems = event.detail.items;
}

function handleGalleryFinalize(event: CustomEvent<{ items: DraggablePlacement[] }>) {
	if (disabled || baseGalleryItems.length < 2) return;
	const orderedKeys = event.detail.items
		.filter((placement) => !placement.isDndShadowItem)
		.map((placement) => placement.key);
	dragItems = null;
	try {
		actionError = "";
		onChange(reorderCatalogProductWebMedia(placements, "gallery", orderedKeys));
	} catch (error) {
		actionError = error instanceof Error ? error.message : "These images could not be reordered.";
	}
}
</script>

{#snippet mediaRow(placement: CatalogProductWebMediaDraftForm & { isDndShadowItem?: boolean }, reorderable = false)}
	{@const index = displayIndex(placement.key)}
	{@const asset = mediaById.get(placement.assetId)}
	{@const filename = asset?.originalFilename ?? `image ${index}`}
	{@const memberImage = linkedToSetMember(placement.key)}
	<li class:dnd-shadow={placement.isDndShadowItem} aria-label={`${filename} product image`}>
		{#if asset}
			<img src={portfolioMediaUrl(mediaBaseUrl, asset.derivatives.thumb.key)} alt="" />
		{:else}
			<div class="missing">image unavailable</div>
		{/if}
		<div class="identity">
			<strong>{filename}</strong>
			<span>image {index}{memberImage ? " · linked to a set member" : ""}</span>
		</div>
		<label>
			alt text
			<input
				maxlength="1000"
				value={placement.altText ?? ""}
				oninput={(event) => updateAltText(placement.key, event.currentTarget.value)}
				aria-label={`Alt text for ${filename}`}
				disabled={disabled || placement.isDndShadowItem}
			/>
		</label>
		<div class="row-actions">
			{#if reorderable}
				<button
					type="button"
					class="drag-handle"
					use:dragHandle
					disabled={disabled}
					aria-label={`Reorder ${filename}`}
				>
					<span aria-hidden="true"></span>
				</button>
			{/if}
			<button
				type="button"
				class="remove"
				onclick={() => remove(placement.key)}
				disabled={disabled || memberImage || placement.isDndShadowItem}
				aria-label={`Remove ${filename}`}
			>remove</button>
		</div>
	</li>
{/snippet}

<section aria-labelledby="catalog-product-media-heading">
	<div class="section-heading">
		<div>
			<h2 id="catalog-product-media-heading">product images</h2>
			<p>{visiblePlacements.length} {visiblePlacements.length === 1 ? "image" : "images"}</p>
		</div>
		{#if hasImageCapacity}
			<button type="button" class="quiet" onclick={onChooseMedia} {disabled}>choose existing image</button>
		{/if}
	</div>

	{#if usesArtworkUpload && onUploadArtwork && artworkCapacity > 0}
		<CatalogProductArtworkUploader
			multiple={productKind === "print_set"}
			maxFiles={artworkCapacity}
			{disabled}
			onUpload={onUploadArtwork}
		/>
	{:else if hasImageCapacity && uploadEndpoint}
		<PortfolioMediaUploader
			endpoint={uploadEndpoint}
			contextLabel="product"
			multiple={productKind !== "print_set"}
			maxFiles={Math.min(
				productKind === "print_set" ? 1 : CATALOG_PRODUCT_WEB_MEDIA_LIMIT,
				CATALOG_PRODUCT_WEB_MEDIA_LIMIT - placements.length,
			)}
			{disabled}
			onReady={onUploadReady}
		/>
	{/if}

	{#if usesArtworkUpload && uploadEndpoint && placements.length < CATALOG_PRODUCT_WEB_MEDIA_LIMIT}
		<details class="gallery-upload">
			<summary>add gallery images</summary>
			<PortfolioMediaUploader
				endpoint={uploadEndpoint}
				contextLabel="product gallery"
				multiple={true}
				maxFiles={CATALOG_PRODUCT_WEB_MEDIA_LIMIT - placements.length}
				{disabled}
				onReady={onUploadReady}
			/>
		</details>
	{/if}

	{#if actionError}<p class="alert" role="alert">{actionError}</p>{/if}

	{#if visiblePlacements.length > 0}
		<div class="media-lists">
			{#if leadingPlacements.length > 0}<ul>{#each leadingPlacements as placement (placement.key)}{@render mediaRow(placement)}{/each}</ul>{/if}
			{#if galleryItems.length > 1}
				<ul
					aria-label="Reorder product gallery images"
					use:dragHandleZone={{
						items: galleryItems,
						dragDisabled: disabled,
						flipDurationMs: 140,
						morphDisabled: true,
						dropTargetStyle: {},
						type: "catalog-product-gallery-images",
					}}
					onconsider={handleGalleryConsider}
					onfinalize={handleGalleryFinalize}
				>
					{#each galleryItems as placement (placement.id)}{@render mediaRow(placement, true)}{/each}
				</ul>
			{:else if galleryItems.length === 1}
				<ul>{@render mediaRow(galleryItems[0])}</ul>
			{/if}
			{#if trailingPlacements.length > 0}<ul>{#each trailingPlacements as placement (placement.key)}{@render mediaRow(placement)}{/each}</ul>{/if}
		</div>
	{/if}

</section>

<style>
	section { margin-top: 0; padding: 20px 0 24px; border-top: 1px solid var(--admin-border-strong); }
	.section-heading { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 22px; }
	.section-heading h2 { margin: 0; color: var(--admin-heading); font-size: 1rem; font-weight: 500; }
	.section-heading p { margin: 5px 0 0; color: var(--admin-text-muted); font-size: .8rem; line-height: 1.5; }
	button { min-height: 40px; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 8px 12px; background: transparent; color: var(--admin-text); font: inherit; font-size: .74rem; cursor: pointer; white-space: nowrap; }
	button:focus-visible, input:focus { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	button:disabled { opacity: .4; cursor: default; }
	button.quiet { border-color: transparent; color: var(--admin-text-muted); }
	.media-lists { display: grid; gap: 1px; padding: 1px; background: var(--admin-border); }
	ul { display: grid; gap: 1px; margin: 0; padding: 0; list-style: none; }
	li { display: grid; grid-template-columns: 84px minmax(130px, .45fr) minmax(220px, 1fr) auto; gap: 14px; align-items: center; padding: 14px; background: var(--admin-surface); }
	li.dnd-shadow { opacity: .34; }
	img, .missing { width: 84px; height: 72px; border-radius: 6px; background: var(--admin-bg); }
	img { object-fit: cover; }
	.missing { display: grid; place-items: center; color: var(--admin-text-subtle); font-size: .66rem; text-align: center; }
	.identity, label { min-width: 0; }
	.identity strong, .identity span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.identity strong { color: var(--admin-heading); font-size: .78rem; font-weight: 500; }
	.identity span { margin-top: 5px; color: var(--admin-text-subtle); font-size: .68rem; }
	label { display: flex; flex-direction: column; gap: 7px; color: var(--admin-text-muted); font-size: .74rem; }
	input { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 10px 11px; background: var(--admin-bg); color: var(--admin-heading); font: inherit; text-transform: none; }
	.row-actions { display: grid; min-width: 72px; gap: 8px; }
	.row-actions .remove { color: var(--status-rose); }
	.drag-handle { display: grid; place-items: center; min-width: 72px; padding: 0; border-color: transparent; color: var(--admin-text-muted); touch-action: none; }
	.drag-handle span { width: 12px; height: 18px; background: radial-gradient(circle, currentColor 1.3px, transparent 1.5px) 0 0 / 6px 6px; opacity: .62; }
	.drag-handle:hover:not(:disabled) { color: var(--admin-heading); }
	.drag-handle:active:not(:disabled) { cursor: grabbing; }
	:global(#dnd-action-dragged-el) { grid-template-columns: 84px minmax(130px, .45fr) minmax(220px, 1fr) auto !important; align-items: center; box-sizing: border-box; overflow: hidden; border-radius: 6px !important; outline: 1px solid color-mix(in srgb, currentColor 18%, transparent); box-shadow: 0 12px 30px color-mix(in srgb, #000 30%, transparent); opacity: .98; pointer-events: none; }
	:global(#dnd-action-dragged-el > *) { min-width: 0; }
	:global(#dnd-action-dragged-el .drag-handle) { display: grid; place-items: center; min-width: 72px; min-height: 40px; border-color: transparent; background: transparent; color: inherit; }
	:global(#dnd-action-dragged-el .drag-handle > span) { width: 12px; height: 18px; background: radial-gradient(circle, currentColor 1.3px, transparent 1.5px) 0 0 / 6px 6px; opacity: .62; }
	.alert { margin: 0 0 16px; color: var(--status-rose); font-size: .76rem; }
	.gallery-upload { margin: -4px 0 18px; }
	.gallery-upload summary { width: fit-content; color: var(--admin-text-muted); font-size: .74rem; cursor: pointer; }
	.gallery-upload[open] summary { margin-bottom: 12px; }
	@media (max-width: 820px) {
		section { padding: 18px 0 22px; }
		.section-heading { flex-direction: column; }
		.section-heading button { width: 100%; }
		li { grid-template-columns: 72px minmax(0, 1fr) auto; }
		img, .missing { width: 72px; height: 64px; }
		label { grid-column: 1 / -1; }
		.row-actions { grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.row-actions .remove:only-child { grid-column: 1 / -1; }
		:global(#dnd-action-dragged-el) { grid-template-columns: 72px minmax(0, 1fr) auto !important; }
		:global(#dnd-action-dragged-el label) { display: none; }
		button { min-height: 44px; }
	}
</style>
