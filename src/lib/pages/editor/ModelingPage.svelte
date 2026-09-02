<script lang="ts">
import { browser } from "$app/environment";
import { onMount, tick } from "svelte";
import { useQuery } from "convex-svelte";
import { dragHandleZone } from "svelte-dnd-action";
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

type SaveState = "loading" | "saved" | "dirty" | "saving" | "offline" | "syncing" | "error" | "conflict";

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

let form = $state<ModelingPageDraftPayload>(emptyModelingPageDraft());
let published = $state<ModelingPageDraftPayload>(emptyModelingPageDraft());
let serverDraft = $state<ModelingPageDraftPayload>(emptyModelingPageDraft());
let baseRevisionId = $state<string | undefined>();
let serverRevisionId = $state<string | undefined>();
let initialized = $state(false);
let setupRequired = $state(false);
let setupStatus = $state<"idle" | "saving">("idle");
let online = $state(browser ? navigator.onLine : true);
let saveState = $state<SaveState>("loading");
let saveError = $state("");
let publishMessage = $state("");
let publishing = $state(false);
let previewing = $state(false);
let reviewRequested = $state(false);
let lastSavedJson = $state("");
let lastAttemptedJson = $state("");
let pickerGalleryKey = $state<string | null>(null);
let uploadedAssets = $state<PortfolioMediaAsset[]>([]);
let saveTimer: ReturnType<typeof setTimeout> | undefined;
type DraggableGallery = ModelingGalleryDraft & { id: string; isDndShadowItem?: boolean };
let galleryDragItems = $state<DraggableGallery[] | null>(null);
let visibleGalleries: DraggableGallery[] = $derived(galleryDragItems ?? (form.galleries ?? []).map((gallery) => ({ ...gallery, id: gallery.key })));

let currentJson = $derived(serializeModelingPageDraft(form));
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
let hasPendingWork = $derived(
	["dirty", "saving", "offline", "syncing", "error", "conflict"].includes(saveState),
);

function clearLocalDraft() {
	if (browser) localStorage.removeItem(storageKey);
}

function persistLocalDraft() {
	if (!browser || setupRequired) return;
	try {
		localStorage.setItem(storageKey, JSON.stringify({
			schemaVersion: 1,
			baseRevisionId: baseRevisionId ?? null,
			payload: copyModelingPageDraft(form),
		}));
	} catch {
		saveError = "This browser could not preserve the draft on this device.";
	}
}

function restoreLocalDraft(serverJson: string) {
	if (!browser) return;
	const value = localStorage.getItem(storageKey);
	if (!value) return;
	try {
		const local = JSON.parse(value) as {
			schemaVersion: number;
			baseRevisionId: string | null;
			payload: ModelingPageDraftPayload;
		};
		if (local.schemaVersion !== 1) return;
		form = copyModelingPageDraft(local.payload);
		if ((local.baseRevisionId ?? undefined) !== baseRevisionId) {
			saveState = "conflict";
			saveError = "The server changed while this device had unsynchronized work. Review or reload before publishing.";
			return;
		}
		saveState = serializeModelingPageDraft(form) === serverJson
			? "saved"
			: online ? "dirty" : "offline";
	} catch {
		clearLocalDraft();
	}
}

$effect(() => {
	const state = editorQuery.data as ModelingPageEditorState | null | undefined;
	if (state === undefined) return;
	if (initialized) {
		if (saveState === "conflict" && state?.draft?.revisionId !== serverRevisionId) {
			serverRevisionId = state?.draft?.revisionId;
			serverDraft = copyModelingPageDraft(state?.draft?.payload ?? state?.published?.payload);
		}
		return;
	}
	if (state === null) {
		form = copyModelingPageDraft(modelingConfig.initialPayload);
		lastSavedJson = serializeModelingPageDraft(form);
		setupRequired = true;
		saveState = "saved";
		initialized = true;
		return;
	}
	baseRevisionId = state.draft?.revisionId;
	serverRevisionId = baseRevisionId;
	published = copyModelingPageDraft(state.published?.payload);
	serverDraft = copyModelingPageDraft(state.draft?.payload ?? state.published?.payload);
	form = copyModelingPageDraft(serverDraft);
	lastSavedJson = serializeModelingPageDraft(form);
	saveState = "saved";
	initialized = true;
	restoreLocalDraft(lastSavedJson);
});

async function beginWithCurrentContent() {
	setupStatus = "saving";
	saveError = "";
	try {
		const payload = copyModelingPageDraft(modelingConfig.initialPayload);
		const result = await client.mutation(saveModelingPageDraft, {
			siteUrl: config.siteUrl,
			payload,
		}) as { revisionId: string };
		form = copyModelingPageDraft(payload);
		serverDraft = copyModelingPageDraft(payload);
		baseRevisionId = result.revisionId;
		serverRevisionId = result.revisionId;
		lastSavedJson = serializeModelingPageDraft(payload);
		setupRequired = false;
		saveState = "saved";
	} catch (error) {
		saveError = error instanceof Error ? error.message : "Could not copy the current content";
	} finally {
		setupStatus = "idle";
	}
}

function beginBlank() {
	form = emptyModelingPageDraft();
	serverDraft = emptyModelingPageDraft();
	lastSavedJson = serializeModelingPageDraft(form);
	setupRequired = false;
	saveState = "saved";
}

async function saveNow() {
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = undefined;
	if (!initialized || setupRequired || saveState === "conflict") return false;
	if (currentJson === lastSavedJson) {
		saveState = "saved";
		clearLocalDraft();
		return true;
	}
	if (!online) {
		saveState = "offline";
		persistLocalDraft();
		return false;
	}
	const snapshot = copyModelingPageDraft(form);
	const snapshotJson = serializeModelingPageDraft(snapshot);
	saveState = saveState === "offline" ? "syncing" : "saving";
	saveError = "";
	try {
		const result = await client.mutation(saveModelingPageDraft, {
			siteUrl: config.siteUrl,
			payload: snapshot,
			...(baseRevisionId ? { expectedDraftRevisionId: baseRevisionId } : {}),
		}) as { revisionId: string };
		baseRevisionId = result.revisionId;
		serverRevisionId = result.revisionId;
		serverDraft = copyModelingPageDraft(snapshot);
		lastSavedJson = snapshotJson;
		lastAttemptedJson = "";
		saveState = currentJson === snapshotJson ? "saved" : "dirty";
		if (saveState === "saved") clearLocalDraft(); else persistLocalDraft();
		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not save";
		saveState = message.toLowerCase().includes("conflict") ? "conflict" : "error";
		saveError = message;
		lastAttemptedJson = snapshotJson;
		persistLocalDraft();
		return false;
	}
}

$effect(() => {
	const changedJson = currentJson;
	if (!initialized || setupRequired || changedJson === lastSavedJson || saveState === "conflict") return;
	if (saveState === "error" && changedJson === lastAttemptedJson) return;
	persistLocalDraft();
	saveState = online ? "dirty" : "offline";
	if (saveTimer) clearTimeout(saveTimer);
	if (online) saveTimer = setTimeout(() => void saveNow(), 900);
});

onMount(() => {
	const handleOnline = () => {
		online = true;
		if (hasPendingWork && saveState !== "conflict") void saveNow();
	};
	const handleOffline = () => {
		online = false;
		if (hasPendingWork) saveState = "offline";
	};
	const warnBeforeUnload = (event: BeforeUnloadEvent) => {
		if (!hasPendingWork) return;
		event.preventDefault();
		event.returnValue = "";
	};
	window.addEventListener("online", handleOnline);
	window.addEventListener("offline", handleOffline);
	window.addEventListener("beforeunload", warnBeforeUnload);
	return () => {
		if (saveTimer) clearTimeout(saveTimer);
		window.removeEventListener("online", handleOnline);
		window.removeEventListener("offline", handleOffline);
		window.removeEventListener("beforeunload", warnBeforeUnload);
	};
});

async function publish() {
	reviewRequested = true;
	publishMessage = "";
	if (publishIssues.length > 0) {
		saveError = "Complete the publishing review before making this page public.";
		await tick();
		document.getElementById(publishIssues[0].fieldId)?.focus();
		return;
	}
	if (!(await saveNow()) || !baseRevisionId) return;
	publishing = true;
	try {
		await client.mutation(publishModelingPage, {
			siteUrl: config.siteUrl,
			draftRevisionId: baseRevisionId,
		});
		published = copyModelingPageDraft(form);
		serverDraft = copyModelingPageDraft(form);
		baseRevisionId = undefined;
		serverRevisionId = undefined;
		lastSavedJson = currentJson;
		saveState = "saved";
		saveError = "";
		publishMessage = "Published.";
		clearLocalDraft();
	} catch (error) {
		saveState = "error";
		saveError = error instanceof Error ? error.message : "Could not publish";
	} finally {
		publishing = false;
	}
}

async function preview() {
	if (!browser || !previewEndpoint) return;
	const previewWindow = window.open("about:blank", "modeling-page-preview");
	if (!previewWindow) {
		saveError = "Allow pop-ups for this site to open the draft preview.";
		return;
	}
	previewWindow.opener = null;
	previewing = true;
	saveError = "";
	try {
		if (!(await saveNow()) || !baseRevisionId) {
			previewWindow.close();
			return;
		}
		const response = await fetch(previewEndpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ draftRevisionId: baseRevisionId }),
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
		saveError = error instanceof Error ? error.message : "Could not create the draft preview.";
	} finally {
		previewing = false;
	}
}

async function discard() {
	if (saveState === "conflict") {
		if (!confirm("Discard this device's changes and load the newer server draft?")) return;
		form = copyModelingPageDraft(serverDraft);
		baseRevisionId = serverRevisionId;
	} else {
		if (!confirm("Discard this draft and return to the published Modeling content?")) return;
		if (baseRevisionId) {
			await client.mutation(discardModelingPageDraft, {
				siteUrl: config.siteUrl,
				draftRevisionId: baseRevisionId,
			});
		}
		form = copyModelingPageDraft(published);
		baseRevisionId = undefined;
		serverRevisionId = undefined;
		serverDraft = copyModelingPageDraft(published);
	}
	lastSavedJson = serializeModelingPageDraft(form);
	lastAttemptedJson = "";
	reviewRequested = false;
	saveError = "";
	publishMessage = "";
	saveState = "saved";
	clearLocalDraft();
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
		{#if initialized && !setupRequired}
			<div class="actions">
				<span class="save-state" aria-live="polite">{saveState === "offline" ? "offline — saved on this device" : saveState}</span>
				<button type="button" onclick={() => void discard()} disabled={!baseRevisionId && !hasPendingWork}>{saveState === "conflict" ? "reload server draft" : "discard draft"}</button>
				<button type="button" onclick={() => void saveNow()} disabled={saveState === "saving" || saveState === "conflict"}>save now</button>
				{#if previewEndpoint}<button type="button" onclick={() => void preview()} disabled={previewing || saveState === "saving" || saveState === "syncing" || saveState === "offline" || saveState === "conflict"}>{previewing ? "preparing preview…" : "preview"}</button>{/if}
				<button type="button" class="primary" onclick={() => void publish()} disabled={publishing || saveState === "saving" || saveState === "syncing" || saveState === "offline" || saveState === "conflict"}>{publishing ? "publishing…" : "publish"}</button>
			</div>
		{/if}
	</header>

	{#if saveError}<div class="alert" role="alert">{saveError}</div>{/if}
	{#if publishMessage}<div class="success" role="status">{publishMessage}</div>{/if}
	{#if reviewRequested && publishIssues.length > 0}
		<div class="review" role="status"><strong>{publishIssues.length} {publishIssues.length === 1 ? "item needs" : "items need"} attention</strong><ul>{#each publishIssues as issue}<li><a href={`#${issue.fieldId}`}>{issue.message}</a></li>{/each}</ul></div>
	{/if}

	{#if !initialized}
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
