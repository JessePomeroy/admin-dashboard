<script lang="ts">
import { browser } from "$app/environment";
import { onMount, tick } from "svelte";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";
import {
	copyPortfolioGalleryDraft,
	newPortfolioPlacement,
	mergePortfolioMediaAssets,
	resolvePortfolioPreviewUrl,
	serializePortfolioGalleryDraft,
	shouldLoadPortfolioServerRevision,
	type PortfolioGalleryDraftForm,
	type PortfolioGalleryEditorState,
	type PortfolioMediaAsset,
	type PortfolioMediaPage,
	validatePortfolioGalleryForPublish,
} from "../../portfolioEditor";
import PortfolioGalleryImages from "./PortfolioGalleryImages.svelte";
import PortfolioMediaPicker from "./PortfolioMediaPicker.svelte";
import PortfolioPublishReview from "./PortfolioPublishReview.svelte";
import PortfolioWorkbench from "./PortfolioWorkbench.svelte";

type SaveState =
	| "loading"
	| "saved"
	| "dirty"
	| "saving"
	| "offline"
	| "syncing"
	| "error"
	| "conflict";

let { galleryId }: { galleryId: string } = $props();

const config = getAdminConfig();
const portfolioApi = config.api.portfolioEditor;
const portfolioConfig = config.editor?.portfolio;
if (!portfolioApi || !portfolioConfig) {
	throw new Error("Portfolio editor is not configured for this host");
}
const getEditorState = portfolioApi.getEditorState;
const savePortfolioDraft = portfolioApi.saveDraft;
const publishPortfolioGallery = portfolioApi.publish;
const publishingEnabled = Boolean(publishPortfolioGallery);
const listMediaAssets = portfolioApi.listMediaAssets;
const getPlacedMediaAssets = portfolioApi.getPlacedMediaAssets;
const portfolioBaseHref = portfolioConfig.baseHref ?? "/admin/editor/portfolio";
const previewEndpoint = portfolioConfig.previewEndpoint;
let storageKey = $derived(`admin:portfolio-editor:${config.siteUrl}:${galleryId}`);

const client = useAdminClient();
const editorQuery = useQuery(getEditorState, () => ({ galleryId }));
const mediaQuery = useQuery(listMediaAssets, {
	siteUrl: config.siteUrl,
	paginationOpts: { numItems: 100, cursor: null },
});

let form = $state<PortfolioGalleryDraftForm>(copyPortfolioGalleryDraft(null));
let initialized = $state(false);
let online = $state(browser ? navigator.onLine : true);
let baseRevisionId = $state<string | undefined>(undefined);
let loadedServerRevisionId = $state<string | undefined>(undefined);
let publishedRevisionId = $state<string | undefined>(undefined);
let isPublished = $state(false);
let savedJson = $state("");
let lastAttemptedJson = $state("");
let saveState = $state<SaveState>("loading");
let saveError = $state("");
let publishMessage = $state("");
let publishing = $state(false);
let previewing = $state(false);
let reviewRequested = $state(false);
let pickerOpen = $state(false);
let uploadedAssets = $state<PortfolioMediaAsset[]>([]);
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let locallySavedRevisionIds: string[] = [];
let editorState = $derived(editorQuery.data as PortfolioGalleryEditorState | undefined);
let mediaPage = $derived(mediaQuery.data as PortfolioMediaPage | undefined);
let placedAssetIds = $derived([...new Set(form.placements.map((placement) => placement.assetId))]);
const placedMediaQuery = useQuery(getPlacedMediaAssets, () => ({
	siteUrl: config.siteUrl,
	ids: placedAssetIds,
}));
let placedAssets = $derived((placedMediaQuery.data ?? []) as PortfolioMediaAsset[]);
let readyAssets = $derived((mediaPage?.page ?? []).filter((asset) => asset.status === "ready"));
let mediaById = $derived(mergePortfolioMediaAssets(
	[...(mediaPage?.page ?? []), ...uploadedAssets],
	placedAssets,
));
let selectedAssetIds = $derived(new Set(form.placements.map((placement) => placement.assetId)));
let currentJson = $derived(serializePortfolioGalleryDraft(form));
let dirty = $derived(initialized && currentJson !== savedJson);
let publishIssues = $derived(validatePortfolioGalleryForPublish(form));
let publicationCurrent = $derived(
	publishingEnabled
	&& isPublished
	&& !dirty
	&& Boolean(baseRevisionId)
	&& publishedRevisionId === baseRevisionId,
);
let hasPendingWork = $derived(
	["dirty", "saving", "offline", "syncing", "error", "conflict"].includes(saveState),
);

function persistLocalDraft() {
	if (!browser) return;
	try {
		localStorage.setItem(storageKey, JSON.stringify({
			schemaVersion: 1,
			baseRevisionId: baseRevisionId ?? null,
			payload: copyPortfolioGalleryDraft(form),
		}));
	} catch {
		saveError = "This browser could not preserve the draft on this device.";
	}
}

function clearLocalDraft() {
	if (browser) localStorage.removeItem(storageKey);
}

function restoreLocalDraft(serverJson: string) {
	if (!browser) return;
	const value = localStorage.getItem(storageKey);
	if (!value) return;
	try {
		const local = JSON.parse(value) as {
			schemaVersion: number;
			baseRevisionId: string | null;
			payload: PortfolioGalleryDraftForm;
		};
		if (local.schemaVersion !== 1) return;
		form = copyPortfolioGalleryDraft(local.payload);
		if ((local.baseRevisionId ?? undefined) !== baseRevisionId) {
			saveState = "conflict";
			saveError = "The server changed while this device had unsynchronized work. Reload the server draft or copy your changes before continuing.";
			return;
		}
		saveState = serializePortfolioGalleryDraft(form) === serverJson
			? "saved"
			: online ? "dirty" : "offline";
	} catch {
		clearLocalDraft();
	}
}

function loadRevision(state: PortfolioGalleryEditorState, restoreDeviceDraft = false) {
	const revision = state.draft ?? state.published;
	form = copyPortfolioGalleryDraft({
		title: revision?.title ?? "",
		description: revision?.description ?? "",
		slug: revision?.slug ?? state.slug,
		placements: revision?.placements ?? [],
	});
	baseRevisionId = state.draft?.revisionId;
	loadedServerRevisionId = revision?.revisionId;
	publishedRevisionId = state.published?.revisionId;
	isPublished = state.isPublished;
	savedJson = serializePortfolioGalleryDraft(form);
	saveState = "saved";
	saveError = "";
	publishMessage = "";
	if (restoreDeviceDraft) restoreLocalDraft(savedJson);
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
		currentDraftRevisionId: baseRevisionId,
		locallySavedRevisionIds,
	})) {
		loadRevision(editorState, !initialized);
	}
});

async function saveNow() {
	if (saveTimer) {
		clearTimeout(saveTimer);
		saveTimer = undefined;
	}
	if (!initialized || saveState === "conflict") return false;
	if (currentJson === savedJson) {
		saveState = "saved";
		clearLocalDraft();
		return true;
	}
	if (!online) {
		saveState = "offline";
		persistLocalDraft();
		return false;
	}

	const snapshot = copyPortfolioGalleryDraft(form);
	const snapshotJson = serializePortfolioGalleryDraft(snapshot);
	saveState = saveState === "offline" ? "syncing" : "saving";
	saveError = "";
	try {
		const result = await client.mutation(savePortfolioDraft, {
			siteUrl: config.siteUrl,
			galleryId,
			...(baseRevisionId ? { expectedDraftRevisionId: baseRevisionId } : {}),
			draft: {
				title: snapshot.title,
				description: snapshot.description || undefined,
				slug: snapshot.slug,
				placements: snapshot.placements.map((placement) => ({
					key: placement.key,
					assetId: placement.assetId,
					altText: placement.altText || undefined,
					caption: placement.caption || undefined,
					focalPoint: placement.focalPoint ?? undefined,
				})),
			},
		}) as { revisionId: string };
		baseRevisionId = result.revisionId;
		locallySavedRevisionIds = [...locallySavedRevisionIds, result.revisionId].slice(-50);
		savedJson = snapshotJson;
		lastAttemptedJson = "";
		if (currentJson === snapshotJson) {
			saveState = "saved";
			clearLocalDraft();
		} else {
			saveState = online ? "dirty" : "offline";
			persistLocalDraft();
		}
		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not save draft.";
		saveState = message.toLowerCase().includes("conflict") ? "conflict" : "error";
		saveError = message;
		lastAttemptedJson = snapshotJson;
		persistLocalDraft();
		return false;
	}
}

$effect(() => {
	const changedJson = currentJson;
	if (!initialized || changedJson === savedJson || saveState === "conflict") return;
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
		if (dirty) {
			saveState = "offline";
			persistLocalDraft();
		}
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
	if (!publishPortfolioGallery) return;
	reviewRequested = true;
	publishMessage = "";
	if (publishIssues.length > 0) {
		saveError = "Complete the publishing review before making this gallery public.";
		await tick();
		document.getElementById(publishIssues[0].fieldId)?.focus();
		return;
	}
	if (!(await saveNow()) || !baseRevisionId) return;
	publishing = true;
	try {
		const result = await client.mutation(publishPortfolioGallery, {
			galleryId,
			draftRevisionId: baseRevisionId,
		}) as { revisionId: string };
		publishedRevisionId = result.revisionId;
		isPublished = true;
		saveError = "";
		publishMessage = "Published. This saved revision is now available to the public site.";
		clearLocalDraft();
	} catch (error) {
		saveState = "error";
		saveError = error instanceof Error ? error.message : "Could not publish gallery.";
	} finally {
		publishing = false;
	}
}

async function preview() {
	if (!browser || !previewEndpoint) return;
	const previewWindow = window.open("about:blank", "portfolio-preview");
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
			body: JSON.stringify({ galleryId, draftRevisionId: baseRevisionId }),
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
		previewWindow.location.href = resolvePortfolioPreviewUrl(
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

function addAsset(asset: PortfolioMediaAsset) {
	if (selectedAssetIds.has(asset._id)) return;
	form.placements = [...form.placements, newPortfolioPlacement(asset)];
	pickerOpen = false;
}

function addUploadedAsset(asset: PortfolioMediaAsset) {
	uploadedAssets = [asset, ...uploadedAssets.filter((item) => item._id !== asset._id)];
	addAsset(asset);
}

function reloadServerDraft() {
	if (!editorState || saveState !== "conflict") return;
	if (!confirm("Discard this device's changes and load the newer server draft?")) return;
	clearLocalDraft();
	loadRevision(editorState);
	lastAttemptedJson = "";
}
</script>

<svelte:head><title>Edit portfolio gallery — {config.siteName}</title></svelte:head>

<PortfolioWorkbench selectedGalleryId={galleryId}>
{#if !initialized}
	<p class="loading" role="status">loading gallery…</p>
{:else}
	<div class="gallery-page">
		<header>
			<div>
				<a class="back" href={portfolioBaseHref}>← portfolio</a>
				<h1>{form.title || "untitled gallery"}</h1>
				<p>{publishingEnabled
					? "Changes autosave as a private draft. Publishing makes the current saved revision available to the public site immediately."
					: "Changes autosave as a private draft. Saved work remains in this editor until publishing is connected."}</p>
			</div>
			<div class="actions">
				<span aria-live="polite">{saveState === "offline"
					? "offline — saved on this device"
					: publicationCurrent
						? "published"
						: !publishingEnabled && saveState === "saved" ? "draft saved" : saveState}</span>
				{#if saveState === "conflict"}
					<button type="button" class="secondary" onclick={reloadServerDraft}>reload server draft</button>
				{:else}
					<button type="button" class="secondary" onclick={() => void saveNow()} disabled={!dirty || saveState === "saving" || saveState === "syncing"}>save now</button>
				{/if}
				{#if previewEndpoint}
					<button type="button" class="secondary" onclick={() => void preview()} disabled={previewing || saveState === "saving" || saveState === "syncing" || saveState === "offline" || saveState === "conflict"}>{previewing ? "preparing preview…" : "preview"}</button>
				{/if}
				{#if publishingEnabled}
					<button type="button" onclick={() => void publish()} disabled={publicationCurrent || publishing || saveState === "saving" || saveState === "syncing" || saveState === "offline" || saveState === "conflict"}>{publishing ? "publishing…" : "publish"}</button>
				{/if}
			</div>
		</header>

		{#if saveError}<p class="alert" role="alert">{saveError}</p>{/if}
		{#if publishingEnabled && publishMessage}<p class="success" role="status">{publishMessage}</p>{/if}

		{#if publishingEnabled}
			<PortfolioPublishReview issues={publishIssues} />
		{/if}

		<section aria-labelledby="gallery-details-heading">
			<div class="section-heading"><h2 id="gallery-details-heading">gallery details</h2><p>{publishingEnabled ? "Name, description, and public path." : "Name, description, and saved URL name."}</p></div>
			<div class="fields">
				<label>gallery name<input id="gallery-title" maxlength="120" bind:value={form.title} aria-invalid={reviewRequested && !form.title.trim()} /></label>
				<label>{publishingEnabled ? "public URL" : "URL name"}<input id="gallery-slug" maxlength="80" bind:value={form.slug} spellcheck="false" aria-invalid={reviewRequested && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)} /></label>
				<label class="wide">description<textarea rows="3" maxlength="2000" bind:value={form.description}></textarea></label>
			</div>
		</section>

		<PortfolioGalleryImages
			placements={form.placements}
			{mediaById}
			mediaBaseUrl={portfolioConfig.mediaBaseUrl}
			{publishIssues}
			{reviewRequested}
			{publishingEnabled}
			uploadEndpoint={portfolioConfig.uploadEndpoint}
			onChange={(placements) => (form.placements = placements)}
			onChooseMedia={() => (pickerOpen = true)}
			onUploadReady={addUploadedAsset}
		/>
	</div>
{/if}

{#if pickerOpen}
	<PortfolioMediaPicker assets={readyAssets} {selectedAssetIds} mediaBaseUrl={portfolioConfig.mediaBaseUrl} hasMore={mediaPage ? !mediaPage.isDone : false} onChoose={addAsset} onClose={() => (pickerOpen = false)} />
{/if}
</PortfolioWorkbench>

<style>
	.loading { padding: 48px 40px; color: var(--admin-text-muted); }
	.gallery-page { max-width: 1120px; padding: 32px 32px 96px; }
	header { display: flex; justify-content: space-between; gap: 28px; align-items: flex-end; margin-bottom: 30px; }
	.back { color: var(--admin-text-muted); font-size: .74rem; text-decoration: none; }
	h1 { margin: 10px 0 0; color: var(--admin-heading); font-family: var(--admin-font-display); font-size: 1.8rem; font-weight: 500; }
	header p { max-width: 620px; margin: 8px 0 0; color: var(--admin-text-muted); line-height: 1.55; }
	.actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
	.actions span { color: var(--admin-text-subtle); font-size: .72rem; white-space: nowrap; }
	button { min-height: 40px; border: 1px solid transparent; border-radius: 6px; padding: 9px 13px; background: var(--admin-accent); color: var(--admin-bg); font: inherit; font-size: .76rem; cursor: pointer; }
	button:disabled { opacity: .45; cursor: default; }
	button:focus-visible, input:focus, textarea:focus, .back:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.secondary { border-color: var(--admin-border-strong); background: transparent; color: var(--admin-text); }
	.alert { padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--status-rose) 45%, transparent); border-radius: 6px; color: var(--status-rose); }
	.success { padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--status-sage) 45%, transparent); border-radius: 6px; color: var(--status-sage); }
	section { margin-top: 20px; padding: 26px; border: 1px solid var(--admin-border); border-radius: 10px; background: var(--admin-surface); }
	.section-heading { margin-bottom: 22px; }
	.section-heading h2 { margin: 0; color: var(--admin-heading); font-size: 1rem; font-weight: 500; }
	.section-heading p { margin: 5px 0 0; color: var(--admin-text-muted); font-size: .8rem; }
	.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
	.wide { grid-column: 1 / -1; }
	label { display: flex; flex-direction: column; gap: 7px; color: var(--admin-text-muted); font-size: .76rem; }
	input, textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 10px 11px; background: var(--admin-bg); color: var(--admin-heading); font: inherit; text-transform: none; }
	[aria-invalid="true"] { border-color: var(--status-rose); }
	@media (max-width: 820px) {
		.gallery-page { padding: 24px 20px 72px; }
		header { align-items: flex-start; flex-direction: column; }
		.actions { justify-content: flex-start; }
		.fields { grid-template-columns: 1fr; }
		.wide { grid-column: auto; }
		button { min-height: 44px; }
	}
</style>
