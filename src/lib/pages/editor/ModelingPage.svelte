<script lang="ts">
import { browser } from "$app/environment";
import { tick } from "svelte";
import { useQuery } from "convex-svelte";
import { dragHandleZone } from "svelte-dnd-action";
import { createSingletonDraft } from "../../singletonDraft.svelte";
import { useAdminClient } from "../../adminClient";
import {
	getAdminConfig,
	type ModelingGalleryDraft,
	type ModelingPageDraftPayload,
	type ModelingPageEditorState,
} from "../../config";
import {
	copyModelingPageDraft,
	emptyModelingPageDraft,
	MODELING_CATEGORY_IMAGE_MAX,
	MODELING_GALLERY_MAX,
	newModelingGallery,
	newModelingImage,
	resolveModelingPagePreviewUrl,
	serializeModelingPageDraft,
	validateModelingPageForPublish,
} from "../../modelingPage";
import {
	mergePortfolioMediaAssets,
	type PortfolioMediaAsset,
	type PortfolioMediaPage,
} from "../../portfolioEditor";
import "../../styles/editorial-page.css";
import ModelingCategoryEditor from "./ModelingCategoryEditor.svelte";
import PortfolioMediaPicker from "./PortfolioMediaPicker.svelte";

const config = getAdminConfig();
if (!config.api.siteEditor || !config.editor?.modelingPage) {
	throw new Error("Modeling editor is not configured for this host");
}
const editorApi = config.api.siteEditor;
const modelingConfig = config.editor.modelingPage;
const previewEndpoint = modelingConfig.previewEndpoint;
const getModelingPageEditorState = editorApi.getModelingPageEditorState;
const saveModelingPageDraft = editorApi.saveModelingPageDraft;
const publishModelingPage = editorApi.publishModelingPage;
const discardModelingPageDraft = editorApi.discardModelingPageDraft;
const listMediaAssets = editorApi.listMediaAssets;
const getPlacedMediaAssets = editorApi.getPlacedMediaAssets;
if (
	!getModelingPageEditorState
	|| !saveModelingPageDraft
	|| !publishModelingPage
	|| !discardModelingPageDraft
	|| !listMediaAssets
	|| !getPlacedMediaAssets
) throw new Error("Modeling editor API is incomplete for this host");

const client = useAdminClient();
const editorQuery = useQuery(getModelingPageEditorState, { siteUrl: config.siteUrl });
const mediaQuery = useQuery(listMediaAssets, {
	siteUrl: config.siteUrl,
	paginationOpts: { numItems: 100, cursor: null },
});
const storageKey = `admin:site-editor:modeling-page:${config.siteUrl}`;

const draft = createSingletonDraft({
	copy: copyModelingPageDraft,
	serialize: serializeModelingPageDraft,
	storageKey,
	enabled: () => !setupRequired,
	conflictMessage: "The server changed while this device had unsynchronized work. Review or reload before publishing.",
	save: (payload, expectedDraftRevisionId) => client.mutation(saveModelingPageDraft, {
		siteUrl: config.siteUrl,
		payload,
		...(expectedDraftRevisionId ? { expectedDraftRevisionId } : {}),
	}) as Promise<{ revisionId: string }>,
});
let form = $derived(draft.form);
let published = $state<ModelingPageDraftPayload>(emptyModelingPageDraft());
let setupRequired = $state(false);
let setupStatus = $state<"idle" | "saving">("idle");
let publishMessage = $state("");
let publishing = $state(false);
let previewing = $state(false);
let reviewRequested = $state(false);
let pickerGalleryKey = $state<string | null>(null);
let uploadedAssets = $state<PortfolioMediaAsset[]>([]);
type DraggableGallery = ModelingGalleryDraft & { id: string; isDndShadowItem?: boolean };
let galleryDragItems = $state<DraggableGallery[] | null>(null);
let visibleGalleries: DraggableGallery[] = $derived(galleryDragItems ?? (form.galleries ?? []).map((gallery) => ({ ...gallery, id: gallery.key })));

let mediaPage = $derived(mediaQuery.data as PortfolioMediaPage | undefined);
let referencedAssetIds = $derived([...new Set([
	...(form.galleries ?? []).flatMap((gallery) =>
		(gallery.images ?? []).map((image) => image.assetId)
	),
])]);
const placedMediaQuery = useQuery(getPlacedMediaAssets, () => ({
	siteUrl: config.siteUrl,
	ids: referencedAssetIds,
}));
let placedAssets = $derived((placedMediaQuery.data ?? []) as PortfolioMediaAsset[]);
let readyAssets = $derived((mediaPage?.page ?? []).filter((asset) => asset.status === "ready"));
let mediaById = $derived(mergePortfolioMediaAssets(
	[...(mediaPage?.page ?? []), ...uploadedAssets],
	placedAssets,
));
let pickerGallery = $derived(
	(form.galleries ?? []).find((gallery) => gallery.key === pickerGalleryKey),
);
let selectedAssetIds = $derived(new Set(
	(pickerGallery?.images ?? []).map((image) => image.assetId),
));
let publishIssues = $derived(validateModelingPageForPublish(form));

$effect(() => {
	const state = editorQuery.data as ModelingPageEditorState | null | undefined;
	if (state === undefined) return;
	const payload = copyModelingPageDraft(state?.draft?.payload ?? state?.published?.payload);
	if (draft.initialized) {
		draft.observeServer(payload, state?.draft?.revisionId);
		return;
	}
	if (state === null) {
		setupRequired = true;
		draft.initialize(copyModelingPageDraft(modelingConfig.initialPayload), undefined, false);
		return;
	}
	published = copyModelingPageDraft(state?.published?.payload);
	draft.initialize(payload, state?.draft?.revisionId);
});

async function beginWithCurrentContent() {
	setupStatus = "saving";
	draft.error = "";
	try {
		const payload = copyModelingPageDraft(modelingConfig.initialPayload);
		const result = await client.mutation(saveModelingPageDraft, {
			siteUrl: config.siteUrl,
			payload,
		}) as { revisionId: string };
		draft.initialize(payload, result.revisionId, false);
		setupRequired = false;
	} catch (error) {
		draft.error = error instanceof Error ? error.message : "Could not copy the current content";
	} finally {
		setupStatus = "idle";
	}
}

function beginBlank() {
	draft.initialize(emptyModelingPageDraft(), undefined, false);
	setupRequired = false;
}

async function publish() {
	reviewRequested = true;
	publishMessage = "";
	if (publishIssues.length > 0) {
		draft.error = "Complete the publishing review before making this page public.";
		await tick();
		document.getElementById(publishIssues[0].fieldId)?.focus();
		return;
	}
	publishing = true;
	const snapshot = await draft.publish((draftRevisionId) => client.mutation(publishModelingPage, {
		siteUrl: config.siteUrl,
		draftRevisionId,
	}));
	if (snapshot) {
		published = snapshot;
		publishMessage = "Published.";
	}
	publishing = false;
}

async function preview() {
	if (!browser || !previewEndpoint) return;
	const previewWindow = window.open("about:blank", "modeling-page-preview");
	if (!previewWindow) {
		draft.error = "Allow pop-ups for this site to open the draft preview.";
		return;
	}
	previewWindow.opener = null;
	previewing = true;
	draft.error = "";
	try {
		if (!(await draft.saveNow()) || !draft.revisionId) {
			previewWindow.close();
			return;
		}
		const response = await fetch(previewEndpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ draftRevisionId: draft.revisionId }),
		});
		const result = await response.json().catch(() => null) as {
			previewUrl?: unknown;
			error?: unknown;
		} | null;
		if (!response.ok) {
			throw new Error(typeof result?.error === "string"
				? result.error
				: "Could not create the draft preview.");
		}
		previewWindow.location.href = resolveModelingPagePreviewUrl(
			result?.previewUrl,
			window.location.origin,
		);
	} catch (error) {
		previewWindow.close();
		draft.error = error instanceof Error ? error.message : "Could not create the draft preview.";
	} finally {
		previewing = false;
	}
}

async function discard() {
	if (draft.state === "conflict") {
		if (!confirm("Discard this device's changes and load the newer server draft?")) return;
		draft.reloadServer();
	} else {
		if (!confirm("Discard this draft and return to the published Modeling content?")) return;
		if (!(await draft.discard(published, (draftRevisionId) => client.mutation(discardModelingPageDraft, {
			siteUrl: config.siteUrl,
			draftRevisionId,
		})))) return;
	}
	reviewRequested = false;
	publishMessage = "";
}

function updateGallery(galleryKey: string, gallery: ModelingGalleryDraft) {
	form.galleries = (form.galleries ?? []).map((item) =>
		item.key === galleryKey ? gallery : item
	);
}

function removeGallery(galleryKey: string) {
	const gallery = (form.galleries ?? []).find((item) => item.key === galleryKey);
	if (!gallery || !confirm(`Remove ${gallery.title?.trim() || "this category"} from the draft?`)) return;
	form.galleries = (form.galleries ?? []).filter((item) => item.key !== galleryKey);
}

function addGallery() {
	if ((form.galleries?.length ?? 0) >= MODELING_GALLERY_MAX) return;
	form.galleries = [...(form.galleries ?? []), newModelingGallery()];
}

function finishGalleryReorder(event: CustomEvent<{ items: DraggableGallery[] }>) {
	galleryDragItems = null;
	form.galleries = event.detail.items.filter((item) => !item.isDndShadowItem).map(({ id: _id, isDndShadowItem: _shadow, ...gallery }) => gallery);
}

function addAsset(galleryKey: string, asset: PortfolioMediaAsset) {
	const gallery = (form.galleries ?? []).find((item) => item.key === galleryKey);
	if (
		!gallery
		|| (gallery.images ?? []).some((image) => image.assetId === asset._id)
		|| (gallery.images?.length ?? 0) >= MODELING_CATEGORY_IMAGE_MAX
	) return;
	updateGallery(galleryKey, {
		...gallery,
		images: [...(gallery.images ?? []), newModelingImage(asset)],
	});
	pickerGalleryKey = null;
}

function addUploadedAsset(galleryKey: string, asset: PortfolioMediaAsset) {
	uploadedAssets = [asset, ...uploadedAssets.filter((item) => item._id !== asset._id)];
	addAsset(galleryKey, asset);
}
</script>

<svelte:head><title>Modeling — {config.siteName}</title></svelte:head>

<div class="settings-page">
	<header class="settings-header">
		<h1>modeling &amp; acting</h1>
		{#if draft.initialized && !setupRequired}
			<div class="actions">
				<span class="save-state" aria-live="polite">{draft.state === "offline" ? "offline — saved on this device" : draft.state}</span>
				<button type="button" onclick={() => void discard()} disabled={!draft.revisionId && !draft.hasPendingWork}>{draft.state === "conflict" ? "reload server draft" : "discard draft"}</button>
				<button type="button" onclick={() => void draft.saveNow()} disabled={draft.state === "saving" || draft.state === "conflict"}>save now</button>
				{#if previewEndpoint}<button type="button" onclick={() => void preview()} disabled={previewing || draft.state === "saving" || draft.state === "syncing" || draft.state === "offline" || draft.state === "conflict"}>{previewing ? "preparing preview…" : "preview"}</button>{/if}
				<button type="button" class="primary" onclick={() => void publish()} disabled={publishing || draft.state === "saving" || draft.state === "syncing" || draft.state === "offline" || draft.state === "conflict"}>{publishing ? "publishing…" : "publish"}</button>
			</div>
		{/if}
	</header>

	{#if draft.error}<div class="alert" role="alert">{draft.error}</div>{/if}
	{#if publishMessage}<div class="success" role="status">{publishMessage}</div>{/if}
	{#if reviewRequested && publishIssues.length > 0}
		<div class="review" role="status"><strong>{publishIssues.length} {publishIssues.length === 1 ? "item needs" : "items need"} attention</strong><ul>{#each publishIssues as issue}<li><a href={`#${issue.fieldId}`}>{issue.message}</a></li>{/each}</ul></div>
	{/if}

	{#if !draft.initialized}
		<p class="loading" role="status">loading Modeling content…</p>
	{:else if setupRequired}
		<section aria-labelledby="setup-modeling-heading">
			<div class="section-heading"><span>01</span><div><h2 id="setup-modeling-heading">set up Modeling content</h2><p>Copy the current words and category names, or begin empty. Add each category's images before publishing.</p></div></div>
			<div class="setup-summary"><strong>{modelingConfig.initialPayload.heading}</strong><span>{modelingConfig.initialPayload.galleries?.length ?? 0} prepared categories · all remain unpublished until you publish them</span></div>
			<div class="actions"><button type="button" class="primary" onclick={() => void beginWithCurrentContent()} disabled={setupStatus === "saving"}>{setupStatus === "saving" ? "copying…" : "copy current structure"}</button><button type="button" onclick={beginBlank} disabled={setupStatus === "saving"}>start blank</button></div>
		</section>
	{:else}
		<form onsubmit={(event) => { event.preventDefault(); void publish(); }}>
			<section aria-labelledby="modeling-copy-heading">
				<div class="section-heading"><div><h2 id="modeling-copy-heading">page copy</h2><p>The heading and introduction shown on this page.</p></div></div>
				<div class="fields">
					<label>page heading<input id="modeling-heading" maxlength="120" bind:value={form.heading} aria-invalid={reviewRequested && publishIssues.some((issue) => issue.fieldId === "modeling-heading")} /></label>
					<label>introduction <small>optional</small><textarea rows="4" maxlength="2000" bind:value={form.intro}></textarea><small>{form.intro?.length ?? 0} / 2000</small></label>
				</div>
			</section>

			<section aria-labelledby="modeling-categories-heading">
				<div class="section-heading categories-heading">
					<div><h2 id="modeling-categories-heading" tabindex="-1">category galleries</h2><p>{form.galleries?.length ?? 0} of {MODELING_GALLERY_MAX}. Categories and their images remain deliberately ordered on phone and desktop.</p></div>
					<button type="button" class="secondary" onclick={addGallery} disabled={(form.galleries?.length ?? 0) >= MODELING_GALLERY_MAX}>add category</button>
				</div>
				{#if (form.galleries?.length ?? 0) === 0}
					<div class="empty"><strong>No categories yet.</strong><p>Add a category, upload its images here, then make it visible when it is ready.</p></div>
				{:else}
					<div class="category-list" aria-label="Reorder Modeling categories" use:dragHandleZone={{ items: visibleGalleries, dragDisabled: (form.galleries?.length ?? 0) < 2, flipDurationMs: 140, morphDisabled: true, dropTargetStyle: {}, type: "modeling-categories" }} onconsider={(event) => galleryDragItems = event.detail.items} onfinalize={finishGalleryReorder}>
					{#each visibleGalleries as gallery, index (gallery.id)}
						<ModelingCategoryEditor
							{gallery}
							{index}
							count={form.galleries?.length ?? 0}
							isDndShadowItem={gallery.isDndShadowItem}
							{mediaById}
							mediaBaseUrl={modelingConfig.mediaBaseUrl}
							{publishIssues}
							{reviewRequested}
							uploadEndpoint={modelingConfig.uploadEndpoint}
							onChange={(next) => updateGallery(gallery.key, next)}
							onRemove={() => removeGallery(gallery.key)}
							onChooseMedia={() => (pickerGalleryKey = gallery.key)}
							onUploadReady={(asset) => addUploadedAsset(gallery.key, asset)}
						/>
					{/each}
					</div>
				{/if}
			</section>

			<section aria-labelledby="modeling-seo-heading">
				<div class="section-heading"><div><h2 id="modeling-seo-heading">search &amp; sharing</h2><p>Write a natural summary of the page for search results and link previews. Example: “Modeling, acting, and portrait portfolio for Margaret Helena, including fashion editorial, comp card digitals, and commercial work.”</p></div></div>
				<div class="fields"><label>search description<textarea id="modeling-seo-description" rows="4" maxlength="320" bind:value={form.seoDescription} aria-invalid={reviewRequested && publishIssues.some((issue) => issue.fieldId === "modeling-seo-description")}></textarea><small>{form.seoDescription?.length ?? 0} / 320. The site uses its default sharing image for link previews.</small></label></div>
			</section>
		</form>
	{/if}
</div>

{#if pickerGalleryKey}
	<PortfolioMediaPicker assets={readyAssets} {selectedAssetIds} mediaBaseUrl={modelingConfig.mediaBaseUrl} hasMore={mediaPage ? !mediaPage.isDone : false} onChoose={(asset) => addAsset(pickerGalleryKey ?? "", asset)} onClose={() => (pickerGalleryKey = null)} />
{/if}

<style>
	.setup-summary { display: flex; flex-direction: column; gap: 8px; margin: 0 0 20px; color: var(--admin-text); text-transform: none; }
	.setup-summary span { color: var(--admin-text-muted); line-height: 1.5; }
	.success, .review { margin-bottom: 18px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--status-sage) 45%, transparent); border-radius: 6px; color: var(--status-sage); }
	.review { border-color: color-mix(in srgb, var(--status-amber) 45%, transparent); color: var(--admin-text); }
	.review strong { color: var(--admin-heading); }
	.review ul { margin: 8px 0 0; padding-left: 20px; }
	.review a { color: var(--admin-text); }
	.categories-heading { align-items: center; }
	.category-list { display: grid; }
	.empty { display: grid; place-items: center; min-height: 170px; border: 1px dashed var(--admin-border); border-radius: 8px; text-align: center; }
	.empty strong { color: var(--admin-heading); }
	.empty p { max-width: 480px; margin: 7px 18px 0; color: var(--admin-text-muted); }
	@media (max-width: 820px) {
		.categories-heading { align-items: flex-start; }
	}
</style>
