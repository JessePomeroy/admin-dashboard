<script lang="ts">
import type {
	ModelingGalleryDraft,
	ModelingImageDraft,
} from "../../config";
import {
	MODELING_CATEGORY_IMAGE_MAX,
	moveModelingItem,
	slugifyModelingTitle,
	type ModelingPublishIssue,
} from "../../modelingPage";
import { portfolioMediaUrl, type PortfolioMediaAsset } from "../../portfolioEditor";
import PortfolioMediaUploader from "./PortfolioMediaUploader.svelte";

let {
	gallery,
	index,
	count,
	mediaById,
	mediaBaseUrl,
	seoImageAssetId,
	publishIssues,
	reviewRequested,
	uploadEndpoint,
	onChange,
	onRemove,
	onMove,
	onChooseMedia,
	onUploadReady,
	onSharingImageChange,
}: {
	gallery: ModelingGalleryDraft;
	index: number;
	count: number;
	mediaById: Map<string, PortfolioMediaAsset>;
	mediaBaseUrl: string;
	seoImageAssetId?: string;
	publishIssues: ModelingPublishIssue[];
	reviewRequested: boolean;
	uploadEndpoint?: string;
	onChange: (gallery: ModelingGalleryDraft) => void;
	onRemove: () => void;
	onMove: (direction: -1 | 1) => void;
	onChooseMedia: () => void;
	onUploadReady: (asset: PortfolioMediaAsset) => void;
	onSharingImageChange: (assetId: string | undefined) => void;
} = $props();

let images = $derived(gallery.images ?? []);

function update(change: Partial<ModelingGalleryDraft>) {
	onChange({ ...gallery, ...change });
}

function updateImage(imageIndex: number, change: Partial<ModelingImageDraft>) {
	update({
		images: images.map((image, itemIndex) =>
			itemIndex === imageIndex ? { ...image, ...change } : image
		),
	});
}

function removeImage(imageIndex: number) {
	const removed = images[imageIndex];
	update({ images: images.filter((_, itemIndex) => itemIndex !== imageIndex) });
	if (seoImageAssetId === removed.assetId) onSharingImageChange(undefined);
}

function setDecorative(imageIndex: number, decorative: boolean) {
	updateImage(imageIndex, {
		decorative,
		altText: decorative ? "" : images[imageIndex].altText,
	});
}

function fillSlug() {
	if (!gallery.slug?.trim() && gallery.title?.trim()) {
		update({ slug: slugifyModelingTitle(gallery.title) });
	}
}
</script>

<section class="category" aria-labelledby={`modeling-category-${gallery.key}-heading`}>
	<header class="category-header">
		<div>
			<span class="position">category {index + 1} of {count}</span>
			<h3 id={`modeling-category-${gallery.key}-heading`}>{gallery.title?.trim() || "untitled category"}</h3>
		</div>
		<label class="visibility"><input type="checkbox" checked={gallery.isVisible} onchange={(event) => update({ isVisible: event.currentTarget.checked })} /> visible on the site</label>
	</header>

	<div class="category-actions" role="group" aria-label={`Reorder category ${index + 1}`}>
		<button type="button" onclick={() => onMove(-1)} disabled={index === 0}>move earlier</button>
		<button type="button" onclick={() => onMove(1)} disabled={index === count - 1}>move later</button>
		<button type="button" class="remove" onclick={onRemove}>remove category</button>
	</div>

	<div class="fields two-column">
		<label>category title<input id={`modeling-category-${gallery.key}-title`} maxlength="120" value={gallery.title ?? ""} oninput={(event) => update({ title: event.currentTarget.value })} onblur={fillSlug} aria-invalid={reviewRequested && publishIssues.some((issue) => issue.fieldId === `modeling-category-${gallery.key}-title`)} /></label>
		<label>URL name<input id={`modeling-category-${gallery.key}-slug`} maxlength="96" value={gallery.slug ?? ""} oninput={(event) => update({ slug: event.currentTarget.value })} aria-invalid={reviewRequested && publishIssues.some((issue) => issue.fieldId === `modeling-category-${gallery.key}-slug`)} /><small>Lowercase words separated by hyphens.</small></label>
		<label class="wide">short description <small>optional</small><textarea rows="3" maxlength="1000" value={gallery.description ?? ""} oninput={(event) => update({ description: event.currentTarget.value })}></textarea></label>
	</div>

	<div class="images-heading">
		<div>
			<h4 id={`modeling-category-${gallery.key}-images`} tabindex="-1">images</h4>
			<p>{images.length} of {MODELING_CATEGORY_IMAGE_MAX}. Their order is sent to the public site exactly as shown.</p>
		</div>
		<button type="button" onclick={onChooseMedia} disabled={images.length >= MODELING_CATEGORY_IMAGE_MAX}>choose from media</button>
	</div>

	{#if uploadEndpoint && images.length < MODELING_CATEGORY_IMAGE_MAX}
		<PortfolioMediaUploader endpoint={uploadEndpoint} contextLabel={gallery.title?.trim() || `Modeling category ${index + 1}`} onReady={onUploadReady} />
	{/if}

	{#if images.length === 0}
		<div class="empty"><strong>No images selected.</strong><p>Upload directly into this category or choose a ready image from the site media library.</p></div>
	{:else}
		<ol>
			{#each images as image, imageIndex (image.key)}
				{@const asset = mediaById.get(image.assetId)}
				{@const issue = publishIssues.find((item) => item.fieldId === `modeling-image-${image.key}-alt`)}
				<li>
					<div class="image-summary">
						{#if asset}<img src={portfolioMediaUrl(mediaBaseUrl, asset.derivatives.thumb.key)} alt="" />{:else}<div class="missing">image unavailable</div>{/if}
						<div><strong>{asset?.originalFilename ?? `image ${imageIndex + 1}`}</strong><span>position {imageIndex + 1}</span></div>
					</div>
					<div class="placement-fields">
						<label>alt text<input id={`modeling-image-${image.key}-alt`} maxlength="500" value={image.altText ?? ""} oninput={(event) => updateImage(imageIndex, { altText: event.currentTarget.value })} disabled={image.decorative} aria-invalid={reviewRequested && Boolean(issue)} />{#if reviewRequested && issue}<small class="field-error">{issue.message}</small>{/if}</label>
						<label class="check"><input type="checkbox" checked={image.decorative} onchange={(event) => setDecorative(imageIndex, event.currentTarget.checked)} /> Decorative image</label>
						<label class="check"><input type="radio" name="modeling-sharing-image" checked={seoImageAssetId === image.assetId} onchange={() => onSharingImageChange(image.assetId)} /> Use for link previews</label>
					</div>
					<div class="image-actions" role="group" aria-label={`Reorder image ${imageIndex + 1}`}>
						<button type="button" onclick={() => update({ images: moveModelingItem(images, imageIndex, -1) })} disabled={imageIndex === 0} aria-label="Move image earlier">↑</button>
						<button type="button" onclick={() => update({ images: moveModelingItem(images, imageIndex, 1) })} disabled={imageIndex === images.length - 1} aria-label="Move image later">↓</button>
						<button type="button" class="remove" onclick={() => removeImage(imageIndex)}>remove</button>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	.category { margin-top: 18px; padding: 22px; border: 1px solid var(--admin-border); border-radius: 10px; background: var(--admin-surface); }
	.category-header, .images-heading { display: flex; justify-content: space-between; gap: 18px; align-items: center; }
	.position { color: var(--admin-text-subtle); font-size: .66rem; letter-spacing: .08em; text-transform: uppercase; }
	h3, h4 { margin: 5px 0 0; color: var(--admin-heading); font-size: 1rem; font-weight: 500; }
	h4 { margin: 0; font-size: .9rem; }
	.visibility, .check { display: flex; flex-direction: row; align-items: center; gap: 8px; color: var(--admin-text-muted); font-size: .75rem; }
	.category-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 20px; padding-bottom: 18px; border-bottom: 1px solid var(--admin-border); }
	button { min-height: 40px; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 9px 13px; background: transparent; color: var(--admin-text); font: inherit; font-size: .74rem; cursor: pointer; }
	button:disabled { opacity: .45; cursor: default; }
	button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.remove { color: var(--status-rose); }
	.fields { display: grid; gap: 16px; }
	.two-column { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.wide { grid-column: 1 / -1; }
	label { display: flex; flex-direction: column; gap: 7px; color: var(--admin-text-muted); font-size: .76rem; }
	label small { color: var(--admin-text-subtle); }
	input:not([type="checkbox"]):not([type="radio"]), textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 10px 11px; background: var(--admin-bg); color: var(--admin-heading); font: inherit; text-transform: none; resize: vertical; }
	[aria-invalid="true"] { border-color: var(--status-rose); }
	.images-heading { margin: 24px 0 16px; }
	.images-heading p { margin: 5px 0 0; color: var(--admin-text-muted); font-size: .76rem; }
	ol { margin: 12px 0 0; padding: 0; list-style: none; }
	li { display: grid; grid-template-columns: minmax(180px, .65fr) minmax(260px, 1.35fr) auto; gap: 16px; align-items: start; padding: 18px 0; border-top: 1px solid var(--admin-border); }
	.image-summary { display: flex; gap: 12px; min-width: 0; align-items: center; }
	.image-summary img, .missing { width: 78px; height: 78px; flex: 0 0 auto; border-radius: 5px; object-fit: cover; background: var(--admin-bg); }
	.missing { display: grid; place-items: center; color: var(--admin-text-subtle); font-size: .62rem; text-align: center; }
	.image-summary strong, .image-summary span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.image-summary strong { color: var(--admin-heading); font-size: .76rem; font-weight: 500; }
	.image-summary span { margin-top: 5px; color: var(--admin-text-subtle); font-size: .68rem; }
	.placement-fields { display: grid; gap: 12px; }
	.image-actions { display: grid; grid-template-columns: repeat(2, auto); gap: 6px; }
	.image-actions button { min-width: 40px; padding: 7px 9px; }
	.image-actions .remove { grid-column: 1 / -1; }
	.empty { display: grid; place-items: center; min-height: 140px; border: 1px dashed var(--admin-border); border-radius: 8px; text-align: center; }
	.empty strong { color: var(--admin-heading); }
	.empty p { max-width: 420px; margin: 7px 16px 0; color: var(--admin-text-muted); }
	.field-error { color: var(--status-rose); line-height: 1.45; }
	@media (max-width: 820px) {
		.category { padding: 18px; }
		.category-header, .images-heading { align-items: flex-start; flex-direction: column; }
		.two-column, li { grid-template-columns: 1fr; }
		.image-actions { display: flex; flex-wrap: wrap; }
		button, .image-actions button { min-height: 44px; }
	}
</style>
