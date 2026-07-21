<script lang="ts">
import {
	CATALOG_PRODUCT_WEB_MEDIA_LIMIT,
	moveCatalogProductWebMedia,
	removeCatalogProductWebMedia,
	type CatalogProductKind,
	type CatalogProductSetMemberDraftForm,
	type CatalogProductWebMediaDraftForm,
} from "../../catalogProductEditor";
import {
	portfolioMediaUrl,
	type PortfolioMediaAsset,
} from "../../portfolioEditor";
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
} = $props();

let actionError = $state("");
let visiblePlacements = $derived(
	placements.filter((placement) => placement.role !== "social_share"),
);
let coverAttached = $derived(
	productKind === "print_set"
	&& placements.some((placement) => placement.role === "cover"),
);
let canAdd = $derived(
	!disabled
	&& placements.length < CATALOG_PRODUCT_WEB_MEDIA_LIMIT
	&& !coverAttached,
);

function linkedToSetMember(key: string) {
	return members.some((member) => member.mediaPlacementKey === key);
}

function canMove(key: string, direction: -1 | 1) {
	const placement = placements.find((candidate) => candidate.key === key);
	if (!placement || placement.role === "set_member") return false;
	const sameRole = placements.filter((candidate) => candidate.role === placement.role);
	const index = sameRole.findIndex((candidate) => candidate.key === key);
	return index + direction >= 0 && index + direction < sameRole.length;
}

function updateAltText(key: string, altText: string) {
	actionError = "";
	onChange(placements.map((placement) =>
		placement.key === key ? { ...placement, altText } : { ...placement }
	));
}

function move(key: string, direction: -1 | 1) {
	actionError = "";
	onChange([...moveCatalogProductWebMedia(placements, key, direction)]);
}

function remove(key: string) {
	actionError = "";
	try {
		onChange(removeCatalogProductWebMedia(placements, key, members));
	} catch (error) {
		actionError = error instanceof Error ? error.message : "This image could not be removed.";
	}
}
</script>

<section aria-labelledby="catalog-product-media-heading">
	<div class="section-heading">
		<div>
			<h2 id="catalog-product-media-heading">product images</h2>
			<p>{visiblePlacements.length} {visiblePlacements.length === 1 ? "image" : "images"}. Their order is saved with this private product draft.</p>
		</div>
		{#if canAdd}
			<button type="button" onclick={onChooseMedia}>choose from media</button>
		{/if}
	</div>

	{#if canAdd && uploadEndpoint}
		<PortfolioMediaUploader
			endpoint={uploadEndpoint}
			contextLabel="product"
			multiple={productKind !== "print_set"}
			maxFiles={Math.min(
				productKind === "print_set" ? 1 : CATALOG_PRODUCT_WEB_MEDIA_LIMIT,
				CATALOG_PRODUCT_WEB_MEDIA_LIMIT - placements.length,
			)}
			onReady={onUploadReady}
		/>
	{/if}

	{#if actionError}<p class="alert" role="alert">{actionError}</p>{/if}

	{#if visiblePlacements.length === 0}
		<div class="empty">
			<strong>No product images yet.</strong>
			<p>Upload a new image or choose one already in the media library.</p>
		</div>
	{:else}
		<ul>
			{#each visiblePlacements as placement, index (placement.key)}
				{@const asset = mediaById.get(placement.assetId)}
				{@const memberImage = linkedToSetMember(placement.key)}
				<li>
					{#if asset}
						<img src={portfolioMediaUrl(mediaBaseUrl, asset.derivatives.thumb.key)} alt="" />
					{:else}
						<div class="missing">image unavailable</div>
					{/if}
					<div class="identity">
						<strong>{asset?.originalFilename ?? `image ${index + 1}`}</strong>
						<span>image {index + 1}{memberImage ? " · linked to a set member" : ""}</span>
					</div>
					<label>
						alt text
						<input
							maxlength="1000"
							value={placement.altText ?? ""}
							oninput={(event) => updateAltText(placement.key, event.currentTarget.value)}
							disabled={disabled}
						/>
					</label>
					<div class="row-actions">
						<button
							type="button"
							onclick={() => move(placement.key, -1)}
							disabled={disabled || !canMove(placement.key, -1)}
							aria-label={`Move image ${index + 1} earlier`}
						>↑</button>
						<button
							type="button"
							onclick={() => move(placement.key, 1)}
							disabled={disabled || !canMove(placement.key, 1)}
							aria-label={`Move image ${index + 1} later`}
						>↓</button>
						<button
							type="button"
							class="remove"
							onclick={() => remove(placement.key)}
							disabled={disabled || memberImage}
						>remove</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if coverAttached}
		<p class="note">A print set has one cover image. Its member images remain paired with their private print files and are completed in the next catalog-file slice.</p>
	{:else}
		<p class="note">Removing an image only detaches it from this product. It does not delete the reusable media asset.</p>
	{/if}
</section>

<style>
	section { margin-top: 20px; padding: 26px; border: 1px solid var(--admin-border); border-radius: 10px; background: var(--admin-surface); }
	.section-heading { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 22px; }
	.section-heading h2 { margin: 0; color: var(--admin-heading); font-size: 1rem; font-weight: 500; }
	.section-heading p, .empty p, .note { margin: 5px 0 0; color: var(--admin-text-muted); font-size: .8rem; line-height: 1.5; }
	button { min-height: 40px; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 8px 12px; background: transparent; color: var(--admin-text); font: inherit; font-size: .74rem; cursor: pointer; white-space: nowrap; }
	button:focus-visible, input:focus { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	button:disabled { opacity: .4; cursor: default; }
	ul { display: grid; gap: 1px; margin: 0; padding: 1px; list-style: none; background: var(--admin-border); }
	li { display: grid; grid-template-columns: 84px minmax(130px, .45fr) minmax(220px, 1fr) auto; gap: 14px; align-items: center; padding: 14px; background: var(--admin-surface); }
	img, .missing { width: 84px; height: 72px; border-radius: 6px; background: var(--admin-bg); }
	img { object-fit: cover; }
	.missing { display: grid; place-items: center; color: var(--admin-text-subtle); font-size: .66rem; text-align: center; }
	.identity, label { min-width: 0; }
	.identity strong, .identity span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.identity strong { color: var(--admin-heading); font-size: .78rem; font-weight: 500; }
	.identity span { margin-top: 5px; color: var(--admin-text-subtle); font-size: .68rem; }
	label { display: flex; flex-direction: column; gap: 7px; color: var(--admin-text-muted); font-size: .74rem; }
	input { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 10px 11px; background: var(--admin-bg); color: var(--admin-heading); font: inherit; text-transform: none; }
	.row-actions { display: grid; grid-template-columns: 42px 42px; gap: 8px; }
	.row-actions .remove { grid-column: 1 / -1; color: var(--status-rose); }
	.empty { display: grid; place-items: center; min-height: 150px; border: 1px dashed var(--admin-border-strong); border-radius: 8px; padding: 24px; text-align: center; }
	.empty strong { color: var(--admin-heading); font-size: .84rem; font-weight: 500; }
	.alert { margin: 0 0 16px; color: var(--status-rose); font-size: .76rem; }
	.note { margin-top: 16px; }
	@media (max-width: 820px) {
		section { padding: 20px; }
		.section-heading { flex-direction: column; }
		.section-heading button { width: 100%; }
		li { grid-template-columns: 72px minmax(0, 1fr) auto; }
		img, .missing { width: 72px; height: 64px; }
		label { grid-column: 1 / -1; }
		.row-actions { grid-column: 1 / -1; grid-template-columns: 1fr 1fr 1fr; }
		.row-actions .remove { grid-column: auto; }
		button { min-height: 44px; }
	}
</style>
