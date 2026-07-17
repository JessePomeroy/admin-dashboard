<script lang="ts">
import { browser } from "$app/environment";
import { onMount, tick } from "svelte";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import {
	ABOUT_PORTRAIT_MAX,
	copyAboutPageDraft,
	emptyAboutPageDraft,
	newAboutPortrait,
	resolveAboutPagePreviewUrl,
	serializeAboutPageDraft,
	validateAboutPageForPublish,
} from "../../aboutPage";
import {
	getAdminConfig,
	type AboutPageDraftPayload,
	type AboutPageEditorState,
} from "../../config";
import {
	mergePortfolioMediaAssets,
	type PortfolioMediaAsset,
	type PortfolioMediaPage,
} from "../../portfolioEditor";
import "../../styles/editorial-page.css";
import AboutPortraits from "./AboutPortraits.svelte";
import AboutStructuredContent from "./AboutStructuredContent.svelte";
import PortfolioMediaPicker from "./PortfolioMediaPicker.svelte";

type SaveState = "loading" | "saved" | "dirty" | "saving" | "offline" | "syncing" | "error" | "conflict";

const config = getAdminConfig();
if (!config.api.siteEditor || !config.editor?.aboutPage) {
	throw new Error("About editor is not configured for this host");
}
const editorApi = config.api.siteEditor;
const aboutConfig = config.editor.aboutPage;
const previewEndpoint = aboutConfig.previewEndpoint;
const getAboutPageEditorState = editorApi.getAboutPageEditorState;
const saveAboutPageDraft = editorApi.saveAboutPageDraft;
const publishAboutPage = editorApi.publishAboutPage;
const discardAboutPageDraft = editorApi.discardAboutPageDraft;
const listMediaAssets = editorApi.listMediaAssets;
const getPlacedMediaAssets = editorApi.getPlacedMediaAssets;
if (
	!getAboutPageEditorState
	|| !saveAboutPageDraft
	|| !publishAboutPage
	|| !discardAboutPageDraft
	|| !listMediaAssets
	|| !getPlacedMediaAssets
) throw new Error("About editor API is incomplete for this host");
const client = useAdminClient();
const editorQuery = useQuery(getAboutPageEditorState, { siteUrl: config.siteUrl });
const mediaQuery = useQuery(listMediaAssets, {
	siteUrl: config.siteUrl,
	paginationOpts: { numItems: 100, cursor: null },
});
const storageKey = `admin:site-editor:about-page:${config.siteUrl}`;

let form = $state<AboutPageDraftPayload>(emptyAboutPageDraft());
let published = $state<AboutPageDraftPayload>(emptyAboutPageDraft());
let serverDraft = $state<AboutPageDraftPayload>(emptyAboutPageDraft());
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
let pickerOpen = $state(false);
let uploadedAssets = $state<PortfolioMediaAsset[]>([]);
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let currentJson = $derived(serializeAboutPageDraft(form));
let mediaPage = $derived(mediaQuery.data as PortfolioMediaPage | undefined);
let referencedAssetIds = $derived([...new Set([
	...(form.portraits ?? []).map((portrait) => portrait.assetId),
	...(form.seoImageAssetId ? [form.seoImageAssetId] : []),
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
let selectedAssetIds = $derived(new Set((form.portraits ?? []).map((portrait) => portrait.assetId)));
let publishIssues = $derived(validateAboutPageForPublish(form));
let hasPendingWork = $derived(["dirty", "saving", "offline", "syncing", "error", "conflict"].includes(saveState));

function clearLocalDraft() {
	if (browser) localStorage.removeItem(storageKey);
}

function persistLocalDraft() {
	if (!browser || setupRequired) return;
	try {
		localStorage.setItem(storageKey, JSON.stringify({
			schemaVersion: 1,
			baseRevisionId: baseRevisionId ?? null,
			payload: copyAboutPageDraft(form),
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
			payload: AboutPageDraftPayload;
		};
		if (local.schemaVersion !== 1) return;
		form = copyAboutPageDraft(local.payload);
		if ((local.baseRevisionId ?? undefined) !== baseRevisionId) {
			saveState = "conflict";
			saveError = "The server changed while this device had unsynchronized work. Review or reload before publishing.";
			return;
		}
		saveState = serializeAboutPageDraft(form) === serverJson ? "saved" : online ? "dirty" : "offline";
	} catch {
		clearLocalDraft();
	}
}

$effect(() => {
	const state = editorQuery.data as AboutPageEditorState | null | undefined;
	if (state === undefined) return;
	if (initialized) {
		if (saveState === "conflict" && state?.draft?.revisionId !== serverRevisionId) {
			serverRevisionId = state?.draft?.revisionId;
			serverDraft = copyAboutPageDraft(state?.draft?.payload ?? state?.published?.payload);
		}
		return;
	}
	if (state === null) {
		form = copyAboutPageDraft(aboutConfig.initialPayload);
		lastSavedJson = serializeAboutPageDraft(form);
		setupRequired = true;
		saveState = "saved";
		initialized = true;
		return;
	}
	baseRevisionId = state.draft?.revisionId;
	serverRevisionId = baseRevisionId;
	published = copyAboutPageDraft(state.published?.payload);
	serverDraft = copyAboutPageDraft(state.draft?.payload ?? state.published?.payload);
	form = copyAboutPageDraft(serverDraft);
	lastSavedJson = serializeAboutPageDraft(form);
	saveState = "saved";
	initialized = true;
	restoreLocalDraft(lastSavedJson);
});

async function beginWithCurrentContent() {
	setupStatus = "saving";
	saveError = "";
	try {
		const payload = copyAboutPageDraft(aboutConfig.initialPayload);
		const result = await client.mutation(saveAboutPageDraft, {
			siteUrl: config.siteUrl,
			payload,
		}) as { revisionId: string };
		form = copyAboutPageDraft(payload);
		serverDraft = copyAboutPageDraft(payload);
		baseRevisionId = result.revisionId;
		serverRevisionId = result.revisionId;
		lastSavedJson = serializeAboutPageDraft(payload);
		setupRequired = false;
		saveState = "saved";
	} catch (error) {
		saveError = error instanceof Error ? error.message : "Could not copy the current content";
	} finally {
		setupStatus = "idle";
	}
}

function beginBlank() {
	form = emptyAboutPageDraft();
	serverDraft = emptyAboutPageDraft();
	lastSavedJson = serializeAboutPageDraft(form);
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
	const snapshot = copyAboutPageDraft(form);
	const snapshotJson = serializeAboutPageDraft(snapshot);
	saveState = saveState === "offline" ? "syncing" : "saving";
	saveError = "";
	try {
		const result = await client.mutation(saveAboutPageDraft, {
			siteUrl: config.siteUrl,
			payload: snapshot,
			...(baseRevisionId ? { expectedDraftRevisionId: baseRevisionId } : {}),
		}) as { revisionId: string };
		baseRevisionId = result.revisionId;
		serverRevisionId = result.revisionId;
		serverDraft = copyAboutPageDraft(snapshot);
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
	const handleOnline = () => { online = true; if (hasPendingWork && saveState !== "conflict") void saveNow(); };
	const handleOffline = () => { online = false; if (hasPendingWork) saveState = "offline"; };
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
		await client.mutation(publishAboutPage, {
			siteUrl: config.siteUrl,
			draftRevisionId: baseRevisionId,
		});
		published = copyAboutPageDraft(form);
		serverDraft = copyAboutPageDraft(form);
		baseRevisionId = undefined;
		serverRevisionId = undefined;
		lastSavedJson = currentJson;
		saveState = "saved";
		saveError = "";
		publishMessage = "Published. This saved revision is available to the public provider when its rollout is enabled.";
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
	const previewWindow = window.open("about:blank", "about-page-preview");
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
		previewWindow.location.href = resolveAboutPagePreviewUrl(
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
		form = copyAboutPageDraft(serverDraft);
		baseRevisionId = serverRevisionId;
	} else {
		if (!confirm("Discard this draft and return to the published About content?")) return;
		if (baseRevisionId) {
			await client.mutation(discardAboutPageDraft, {
				siteUrl: config.siteUrl,
				draftRevisionId: baseRevisionId,
			});
		}
		form = copyAboutPageDraft(published);
		baseRevisionId = undefined;
		serverRevisionId = undefined;
		serverDraft = copyAboutPageDraft(published);
	}
	lastSavedJson = serializeAboutPageDraft(form);
	lastAttemptedJson = "";
	reviewRequested = false;
	saveError = "";
	publishMessage = "";
	saveState = "saved";
	clearLocalDraft();
}

function addAsset(asset: PortfolioMediaAsset) {
	if (selectedAssetIds.has(asset._id) || (form.portraits?.length ?? 0) >= ABOUT_PORTRAIT_MAX) return;
	form.portraits = [...(form.portraits ?? []), newAboutPortrait(asset)];
	pickerOpen = false;
}

function addUploadedAsset(asset: PortfolioMediaAsset) {
	uploadedAssets = [asset, ...uploadedAssets.filter((item) => item._id !== asset._id)];
	addAsset(asset);
}
</script>

<svelte:head><title>About — {config.siteName}</title></svelte:head>

<div class="settings-page">
	<header class="settings-header">
		<div><h1>about</h1><p class="description">Edit the words, portraits, and structured details supplied to the public About page. The site keeps ownership of composition, motion, typography, and responsive design.</p></div>
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
		<p class="loading" role="status">loading About content…</p>
	{:else if setupRequired}
		<section aria-labelledby="setup-about-heading">
			<div class="section-heading"><span>01</span><div><h2 id="setup-about-heading">set up About content</h2><p>Copy the words currently used by the public site or begin empty. This creates an unpublished draft only; add a ready portrait before publishing.</p></div></div>
			<div class="setup-summary"><strong>{aboutConfig.initialPayload.displayName}</strong><span>{aboutConfig.initialPayload.introduction || aboutConfig.initialPayload.biography}</span></div>
			<div class="actions"><button type="button" class="primary" onclick={() => void beginWithCurrentContent()} disabled={setupStatus === "saving"}>{setupStatus === "saving" ? "copying…" : "copy current content"}</button><button type="button" onclick={beginBlank} disabled={setupStatus === "saving"}>start blank</button></div>
		</section>
	{:else}
		<form onsubmit={(event) => { event.preventDefault(); void publish(); }}>
			<section aria-labelledby="about-copy-heading">
				<div class="section-heading"><div><h2 id="about-copy-heading">identity &amp; biography</h2><p>Public copy only. The frontend decides how much appears in each composition and breakpoint.</p></div></div>
				<div class="fields two-column">
					<label>page heading<input id="about-heading" maxlength="120" bind:value={form.heading} aria-invalid={reviewRequested && publishIssues.some((issue) => issue.fieldId === "about-heading")} /></label>
					<label>display name<input id="about-display-name" maxlength="200" bind:value={form.displayName} aria-invalid={reviewRequested && publishIssues.some((issue) => issue.fieldId === "about-display-name")} /></label>
					<label class="wide">role or practice <small>optional</small><input maxlength="160" bind:value={form.role} /></label>
					<label class="wide">introduction <small>optional</small><textarea id="about-introduction" rows="4" maxlength="2000" bind:value={form.introduction} aria-invalid={reviewRequested && publishIssues.some((issue) => issue.fieldId === "about-introduction")}></textarea><small>{form.introduction?.length ?? 0} / 2000</small></label>
					<label class="wide">biography <small>optional</small><textarea rows="10" maxlength="8000" bind:value={form.biography}></textarea><small>{form.biography?.length ?? 0} / 8000</small></label>
				</div>
			</section>

			<AboutPortraits portraits={form.portraits ?? []} {mediaById} mediaBaseUrl={aboutConfig.mediaBaseUrl} seoImageAssetId={form.seoImageAssetId} {publishIssues} {reviewRequested} uploadEndpoint={aboutConfig.uploadEndpoint} onChange={(portraits) => (form.portraits = portraits)} onSharingImageChange={(assetId) => (form.seoImageAssetId = assetId)} onChooseMedia={() => (pickerOpen = true)} onUploadReady={addUploadedAsset} />

			<AboutStructuredContent sections={form.sections ?? []} highlights={form.highlights ?? []} {publishIssues} {reviewRequested} onSectionsChange={(sections) => (form.sections = sections)} onHighlightsChange={(highlights) => (form.highlights = highlights)} />

			<section aria-labelledby="about-seo-heading">
				<div class="section-heading"><div><h2 id="about-seo-heading">search &amp; sharing</h2><p>Write a concise, natural summary of who this page is about and what visitors will find. Example: “About Margaret Helena, a Michigan photographer and multidisciplinary artist working across portraiture, direction, and performance.”</p></div></div>
				<div class="fields"><label class="wide">search description<textarea id="about-seo-description" rows="4" maxlength="320" bind:value={form.seoDescription} aria-invalid={reviewRequested && publishIssues.some((issue) => issue.fieldId === "about-seo-description")}></textarea><small>{form.seoDescription?.length ?? 0} / 320. Choose “Use for link previews” on a portrait to set the optional sharing image.</small></label></div>
			</section>
		</form>
	{/if}
</div>

{#if pickerOpen}
	<PortfolioMediaPicker assets={readyAssets} {selectedAssetIds} mediaBaseUrl={aboutConfig.mediaBaseUrl} hasMore={mediaPage ? !mediaPage.isDone : false} onChoose={addAsset} onClose={() => (pickerOpen = false)} />
{/if}

<style>
	.setup-summary { display: flex; flex-direction: column; gap: 8px; margin: 0 0 20px; color: var(--admin-text); text-transform: none; }
	.setup-summary span { color: var(--admin-text-muted); line-height: 1.5; }
	.success, .review { margin-bottom: 18px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--status-sage) 45%, transparent); border-radius: 6px; color: var(--status-sage); }
	.review { border-color: color-mix(in srgb, var(--status-amber) 45%, transparent); color: var(--admin-text); }
	.review strong { color: var(--admin-heading); }
	.review ul { margin: 8px 0 0; padding-left: 20px; }
	.review a { color: var(--admin-text); }
</style>
