<script lang="ts">
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";
import {
	newPortfolioPlacement,
	mergePortfolioMediaAssets,
	portfolioMediaUrl,
	shouldLoadPortfolioServerRevision,
	type PortfolioGalleryEditorState,
	type PortfolioMediaAsset,
	type PortfolioMediaPage,
	type PortfolioPlacementDraft,
} from "../../portfolioEditor";
import PortfolioMediaPicker from "./PortfolioMediaPicker.svelte";

let { galleryId }: { galleryId: string } = $props();

const config = getAdminConfig();
const portfolioApi = config.api.portfolioEditor;
const portfolioConfig = config.editor?.portfolio;
if (!portfolioApi || !portfolioConfig) {
	throw new Error("Portfolio editor is not configured for this host");
}
const getEditorState = portfolioApi.getEditorState;
const savePortfolioDraft = portfolioApi.saveDraft;
const listMediaAssets = portfolioApi.listMediaAssets;
const getPlacedMediaAssets = portfolioApi.getPlacedMediaAssets;
const portfolioBaseHref = portfolioConfig.baseHref ?? "/admin/editor/portfolio";

const client = useAdminClient();
const editorQuery = useQuery(getEditorState, () => ({ galleryId }));
const mediaQuery = useQuery(listMediaAssets, {
	siteUrl: config.siteUrl,
	paginationOpts: { numItems: 100, cursor: null },
});

type GalleryForm = {
	title: string;
	description: string;
	slug: string;
	placements: PortfolioPlacementDraft[];
};

let form = $state<GalleryForm>({ title: "", description: "", slug: "", placements: [] });
let initialized = $state(false);
let baseRevisionId = $state<string | undefined>(undefined);
let loadedServerRevisionId = $state<string | undefined>(undefined);
let savedJson = $state("");
let saveState = $state<"saved" | "saving" | "error" | "conflict">("saved");
let saveError = $state("");
let pickerOpen = $state(false);
let editorState = $derived(editorQuery.data as PortfolioGalleryEditorState | undefined);
let mediaPage = $derived(mediaQuery.data as PortfolioMediaPage | undefined);
let placedAssetIds = $derived([...new Set(form.placements.map((placement) => placement.assetId))]);
const placedMediaQuery = useQuery(getPlacedMediaAssets, () => ({
	siteUrl: config.siteUrl,
	ids: placedAssetIds,
}));
let placedAssets = $derived((placedMediaQuery.data ?? []) as PortfolioMediaAsset[]);
let readyAssets = $derived((mediaPage?.page ?? []).filter((asset) => asset.status === "ready"));
let mediaById = $derived(mergePortfolioMediaAssets(mediaPage?.page ?? [], placedAssets));
let selectedAssetIds = $derived(new Set(form.placements.map((placement) => placement.assetId)));
let currentJson = $derived(JSON.stringify(form));
let dirty = $derived(initialized && currentJson !== savedJson);

function loadRevision(state: PortfolioGalleryEditorState) {
	const revision = state.draft ?? state.published;
	form = {
		title: revision?.title ?? "",
		description: revision?.description ?? "",
		slug: revision?.slug ?? state.slug,
		placements: (revision?.placements ?? []).map((placement) => ({ ...placement })),
	};
	baseRevisionId = state.draft?.revisionId;
	loadedServerRevisionId = revision?.revisionId;
	savedJson = JSON.stringify(form);
	saveState = "saved";
	saveError = "";
	initialized = true;
}

$effect(() => {
	if (!editorState) return;
	const serverRevisionId = (editorState.draft ?? editorState.published)?.revisionId;
	if (shouldLoadPortfolioServerRevision({
		initialized,
		dirty,
		serverRevisionId,
		loadedServerRevisionId,
	})) {
		loadRevision(editorState);
	}
});

function draftPayload() {
	return {
		title: form.title,
		description: form.description || undefined,
		slug: form.slug,
		placements: form.placements.map((placement) => ({
			key: placement.key,
			assetId: placement.assetId,
			altText: placement.altText || undefined,
			decorative: placement.decorative,
			caption: placement.caption || undefined,
			focalPoint: placement.focalPoint ?? undefined,
		})),
	};
}

async function saveDraft() {
	if (!initialized || !dirty || saveState === "saving") return;
	saveState = "saving";
	saveError = "";
	const snapshot = currentJson;
	try {
		const result = await client.mutation(savePortfolioDraft, {
			siteUrl: config.siteUrl,
			galleryId,
			expectedDraftRevisionId: baseRevisionId,
			draft: draftPayload(),
		}) as { revisionId: string };
		baseRevisionId = result.revisionId;
		savedJson = snapshot;
		saveState = "saved";
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not save draft.";
		saveState = message.toLowerCase().includes("conflict") ? "conflict" : "error";
		saveError = message;
	}
}

function addAsset(asset: PortfolioMediaAsset) {
	if (selectedAssetIds.has(asset._id)) return;
	form.placements = [...form.placements, newPortfolioPlacement(asset)];
	pickerOpen = false;
}

function removePlacement(index: number) {
	form.placements = form.placements.filter((_, itemIndex) => itemIndex !== index);
}

function setDecorative(index: number, decorative: boolean) {
	form.placements[index].decorative = decorative;
	if (decorative) form.placements[index].altText = "";
}

function reloadServerDraft() {
	if (!editorState) return;
	if (!confirm("Discard this device's changes and load the newer server draft?")) return;
	loadRevision(editorState);
}
</script>

<svelte:head><title>Edit portfolio gallery — {config.siteName}</title></svelte:head>

{#if !initialized}
	<p class="loading" role="status">loading gallery…</p>
{:else}
	<div class="gallery-page">
		<header>
			<div>
				<a class="back" href={portfolioBaseHref}>← portfolio</a>
				<h1>{form.title || "untitled gallery"}</h1>
				<p>Unpublished edits stay separate from the public gallery until publishing is added in the next iteration.</p>
			</div>
			<div class="actions">
				<span aria-live="polite">{saveState === "saving" ? "saving…" : dirty ? "unsaved changes" : "saved"}</span>
				<button
					type="button"
					onclick={() => saveState === "conflict" ? reloadServerDraft() : void saveDraft()}
					disabled={saveState !== "conflict" && (!dirty || saveState === "saving")}
				>{saveState === "conflict" ? "reload server draft" : "save draft"}</button>
			</div>
		</header>

		{#if saveError}<p class="alert" role="alert">{saveError}</p>{/if}

		<section aria-labelledby="gallery-details-heading">
			<div class="section-heading"><h2 id="gallery-details-heading">gallery details</h2><p>Name, description, and public path.</p></div>
			<div class="fields">
				<label>gallery name<input maxlength="120" bind:value={form.title} /></label>
				<label>public URL<input maxlength="80" bind:value={form.slug} spellcheck="false" /></label>
				<label class="wide">description<textarea rows="3" maxlength="2000" bind:value={form.description}></textarea></label>
			</div>
		</section>

		<section aria-labelledby="gallery-images-heading">
			<div class="section-heading images-heading">
				<div><h2 id="gallery-images-heading">images</h2><p>{form.placements.length} {form.placements.length === 1 ? "image" : "images"} in this draft.</p></div>
				<button type="button" class="secondary" onclick={() => (pickerOpen = true)}>choose from media</button>
			</div>

			{#if form.placements.length === 0}
				<div class="empty"><strong>No images selected.</strong><p>Choose a ready image from the shared site media library.</p></div>
			{:else}
				<ol>
					{#each form.placements as placement, index (placement.key)}
						{@const asset = mediaById.get(placement.assetId)}
						<li>
							<div class="image-summary">
								{#if asset}<img src={portfolioMediaUrl(portfolioConfig.mediaBaseUrl, asset.derivatives.thumb.key)} alt="" />{:else}<div class="missing">image unavailable</div>{/if}
								<div><strong>{asset?.originalFilename ?? `image ${index + 1}`}</strong><span>position {index + 1}</span></div>
							</div>
							<div class="placement-fields">
								<label>alt text<input maxlength="500" bind:value={placement.altText} disabled={placement.decorative} /></label>
								<label>caption<input maxlength="1000" bind:value={placement.caption} /></label>
								<label class="decorative"><input type="checkbox" checked={placement.decorative} onchange={(event) => setDecorative(index, (event.currentTarget as HTMLInputElement).checked)} /> decorative image</label>
							</div>
							<button type="button" class="remove" onclick={() => removePlacement(index)} aria-label={`Remove ${asset?.originalFilename ?? `image ${index + 1}`}`}>remove</button>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	</div>
{/if}

{#if pickerOpen}
	<PortfolioMediaPicker assets={readyAssets} {selectedAssetIds} mediaBaseUrl={portfolioConfig.mediaBaseUrl} hasMore={mediaPage ? !mediaPage.isDone : false} onChoose={addAsset} onClose={() => (pickerOpen = false)} />
{/if}

<style>
	.loading { padding: 48px 40px; color: var(--admin-text-muted); }
	.gallery-page { max-width: 1120px; padding: 42px 40px 96px; }
	header { display: flex; justify-content: space-between; gap: 28px; align-items: flex-end; margin-bottom: 30px; }
	.back { color: var(--admin-text-muted); font-size: .74rem; text-decoration: none; }
	h1 { margin: 10px 0 0; color: var(--admin-heading); font-family: var(--admin-font-display); font-size: 1.8rem; font-weight: 500; }
	header p { max-width: 620px; margin: 8px 0 0; color: var(--admin-text-muted); line-height: 1.55; }
	.actions { display: flex; align-items: center; gap: 10px; }
	.actions span { color: var(--admin-text-subtle); font-size: .72rem; white-space: nowrap; }
	button { min-height: 40px; border: 1px solid transparent; border-radius: 6px; padding: 9px 13px; background: var(--admin-accent); color: var(--admin-bg); font: inherit; font-size: .76rem; cursor: pointer; }
	button:disabled { opacity: .45; cursor: default; }
	button:focus-visible, input:focus, textarea:focus, .back:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.secondary, .remove { border-color: var(--admin-border-strong); background: transparent; color: var(--admin-text); }
	.alert { padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--status-rose) 45%, transparent); border-radius: 6px; color: var(--status-rose); }
	section { margin-top: 20px; padding: 26px; border: 1px solid var(--admin-border); border-radius: 10px; background: var(--admin-surface); }
	.section-heading { margin-bottom: 22px; }
	.section-heading h2 { margin: 0; color: var(--admin-heading); font-size: 1rem; font-weight: 500; }
	.section-heading p { margin: 5px 0 0; color: var(--admin-text-muted); font-size: .8rem; }
	.images-heading { display: flex; justify-content: space-between; gap: 20px; align-items: center; }
	.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
	.wide { grid-column: 1 / -1; }
	label { display: flex; flex-direction: column; gap: 7px; color: var(--admin-text-muted); font-size: .76rem; }
	input, textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 10px 11px; background: var(--admin-bg); color: var(--admin-heading); font: inherit; text-transform: none; }
	ol { margin: 0; padding: 0; list-style: none; }
	li { display: grid; grid-template-columns: minmax(190px, .7fr) minmax(260px, 1.3fr) auto; gap: 16px; align-items: start; padding: 18px 0; border-top: 1px solid var(--admin-border); }
	.image-summary { display: flex; gap: 12px; min-width: 0; align-items: center; }
	.image-summary img, .missing { width: 84px; height: 72px; flex: 0 0 auto; border-radius: 5px; object-fit: cover; background: var(--admin-bg); }
	.missing { display: grid; place-items: center; color: var(--admin-text-subtle); font-size: .64rem; text-align: center; }
	.image-summary strong, .image-summary span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.image-summary strong { color: var(--admin-heading); font-size: .78rem; font-weight: 500; }
	.image-summary span { margin-top: 5px; color: var(--admin-text-subtle); font-size: .68rem; }
	.placement-fields { display: grid; gap: 12px; }
	.decorative { flex-direction: row; align-items: center; }
	.decorative input { width: auto; }
	.remove { min-height: 36px; padding: 7px 9px; }
	.empty { display: grid; place-items: center; min-height: 180px; text-align: center; }
	.empty strong { color: var(--admin-heading); }
	.empty p { margin: 7px 0 0; color: var(--admin-text-muted); }
	@media (max-width: 820px) {
		.gallery-page { padding: 28px 20px 72px; }
		header, .images-heading { align-items: flex-start; flex-direction: column; }
		.fields { grid-template-columns: 1fr; }
		.wide { grid-column: auto; }
		li { grid-template-columns: 1fr; }
		.remove { justify-self: start; min-height: 44px; }
		button { min-height: 44px; }
	}
</style>
