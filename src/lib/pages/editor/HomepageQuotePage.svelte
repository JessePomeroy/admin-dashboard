<script lang="ts">
import { browser } from "$app/environment";
import { onMount } from "svelte";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import {
	getAdminConfig,
	type HomepageQuoteDraftPayload,
	type HomepageQuoteEditorState,
} from "../../config";
import {
	copyHomepageQuoteDraft,
	emptyHomepageQuoteDraft,
	hasHomepageQuoteErrors,
	resolveHomepageQuotePreviewUrl,
	serializeHomepageQuoteDraft,
	type HomepageQuoteFieldErrors,
	validateHomepageQuoteForPublish,
} from "../../homepageQuote";
import "../../styles/editorial-page.css";

type SaveState =
	| "loading"
	| "saved"
	| "dirty"
	| "saving"
	| "offline"
	| "syncing"
	| "error"
	| "conflict";

const config = getAdminConfig();
if (!config.api.siteEditor || !config.editor?.homepageQuote) {
	throw new Error("Homepage Quote editor is not configured for this host");
}
const editorApi = config.api.siteEditor;
const quoteConfig = config.editor.homepageQuote;
const previewEndpoint = quoteConfig.previewEndpoint;
const client = useAdminClient();
const editorQuery = useQuery(editorApi.getHomepageQuoteEditorState, {
	siteUrl: config.siteUrl,
});
const storageKey = `admin:site-editor:homepage-quote:${config.siteUrl}`;

let form = $state<HomepageQuoteDraftPayload>(emptyHomepageQuoteDraft());
let published = $state<HomepageQuoteDraftPayload>(emptyHomepageQuoteDraft());
let serverDraft = $state<HomepageQuoteDraftPayload>(emptyHomepageQuoteDraft());
let baseRevisionId = $state<string | undefined>();
let serverRevisionId = $state<string | undefined>();
let initialized = $state(false);
let setupRequired = $state(false);
let setupStatus = $state<"idle" | "saving">("idle");
let previewing = $state(false);
let online = $state(true);
let saveState = $state<SaveState>("loading");
let saveError = $state("");
let fieldErrors = $state<HomepageQuoteFieldErrors>({});
let lastSavedJson = $state("");
let lastAttemptedJson = $state("");
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let currentJson = $derived(serializeHomepageQuoteDraft(form));
let hasPendingWork = $derived(
	["dirty", "saving", "offline", "syncing", "error", "conflict"].includes(saveState),
);

function clearLocalDraft() {
	if (browser) localStorage.removeItem(storageKey);
}

function persistLocalDraft() {
	if (!browser || setupRequired) return;
	localStorage.setItem(storageKey, JSON.stringify({
		schemaVersion: 1,
		baseRevisionId: baseRevisionId ?? null,
		payload: copyHomepageQuoteDraft(form),
	}));
}

function restoreLocalDraft(serverJson: string) {
	if (!browser) return;
	const value = localStorage.getItem(storageKey);
	if (!value) return;
	try {
		const local = JSON.parse(value) as {
			schemaVersion: number;
			baseRevisionId: string | null;
			payload: HomepageQuoteDraftPayload;
		};
		if (local.schemaVersion !== 1) return;
		form = copyHomepageQuoteDraft(local.payload);
		if ((local.baseRevisionId ?? undefined) !== baseRevisionId) {
			saveState = "conflict";
			saveError = "The server changed while this device had unsynchronized work. Review or reload before publishing.";
			return;
		}
		saveState = serializeHomepageQuoteDraft(form) === serverJson ? "saved" : "dirty";
	} catch {
		clearLocalDraft();
	}
}

$effect(() => {
	const state = editorQuery.data as HomepageQuoteEditorState | null | undefined;
	if (state === undefined) return;
	if (initialized) {
		// Successful mutations return the new revision before the reactive query
		// catches up. Only let query state replace the local server snapshot while
		// recovering an actual stale-write conflict.
		if (saveState === "conflict" && state?.draft?.revisionId !== serverRevisionId) {
			serverRevisionId = state?.draft?.revisionId;
			serverDraft = copyHomepageQuoteDraft(state?.draft?.payload ?? state?.published?.payload);
		}
		return;
	}
	if (state === null) {
		form = copyHomepageQuoteDraft(quoteConfig.initialPayload);
		lastSavedJson = serializeHomepageQuoteDraft(form);
		setupRequired = true;
		saveState = "saved";
		initialized = true;
		return;
	}
	baseRevisionId = state.draft?.revisionId;
	serverRevisionId = baseRevisionId;
	published = copyHomepageQuoteDraft(state.published?.payload);
	serverDraft = copyHomepageQuoteDraft(state.draft?.payload ?? state.published?.payload);
	form = copyHomepageQuoteDraft(serverDraft);
	lastSavedJson = serializeHomepageQuoteDraft(form);
	saveState = "saved";
	initialized = true;
	restoreLocalDraft(lastSavedJson);
});

async function beginWithCurrentQuote() {
	setupStatus = "saving";
	saveError = "";
	try {
		const payload = copyHomepageQuoteDraft(quoteConfig.initialPayload);
		const result = await client.mutation(editorApi.saveHomepageQuoteDraft, {
			siteUrl: config.siteUrl,
			payload,
		}) as { revisionId: string };
		form = copyHomepageQuoteDraft(payload);
		serverDraft = copyHomepageQuoteDraft(payload);
		baseRevisionId = result.revisionId;
		serverRevisionId = result.revisionId;
		lastSavedJson = serializeHomepageQuoteDraft(payload);
		setupRequired = false;
		saveState = "saved";
	} catch (error) {
		saveError = error instanceof Error ? error.message : "Could not copy the current quote";
	} finally {
		setupStatus = "idle";
	}
}

function beginBlank() {
	form = emptyHomepageQuoteDraft();
	serverDraft = emptyHomepageQuoteDraft();
	lastSavedJson = serializeHomepageQuoteDraft(form);
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
	const snapshot = copyHomepageQuoteDraft(form);
	const snapshotJson = serializeHomepageQuoteDraft(snapshot);
	saveState = saveState === "offline" ? "syncing" : "saving";
	saveError = "";
	try {
		const result = await client.mutation(editorApi.saveHomepageQuoteDraft, {
			siteUrl: config.siteUrl,
			payload: snapshot,
			...(baseRevisionId ? { expectedDraftRevisionId: baseRevisionId } : {}),
		}) as { revisionId: string };
		baseRevisionId = result.revisionId;
		serverRevisionId = result.revisionId;
		serverDraft = copyHomepageQuoteDraft(snapshot);
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
	saveTimer = setTimeout(() => void saveNow(), 900);
});

onMount(() => {
	online = navigator.onLine;
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
	fieldErrors = validateHomepageQuoteForPublish(form);
	if (hasHomepageQuoteErrors(fieldErrors)) {
		saveError = "Complete the highlighted fields before publishing.";
		return;
	}
	if (!(await saveNow()) || !baseRevisionId) return;
	try {
		await client.mutation(editorApi.publishHomepageQuote, {
			siteUrl: config.siteUrl,
			draftRevisionId: baseRevisionId,
		});
		published = copyHomepageQuoteDraft(form);
		serverDraft = copyHomepageQuoteDraft(form);
		baseRevisionId = undefined;
		serverRevisionId = undefined;
		lastSavedJson = currentJson;
		saveState = "saved";
		saveError = "";
		clearLocalDraft();
	} catch (error) {
		saveState = "error";
		saveError = error instanceof Error ? error.message : "Could not publish";
	}
}

async function preview() {
	if (!browser || !previewEndpoint) return;
	const previewWindow = window.open("about:blank", "homepage-quote-preview");
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
		previewWindow.location.href = resolveHomepageQuotePreviewUrl(
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
		form = copyHomepageQuoteDraft(serverDraft);
		baseRevisionId = serverRevisionId;
	} else {
		if (!confirm("Discard this draft and return to the published quote?")) return;
		if (baseRevisionId) {
			await client.mutation(editorApi.discardHomepageQuoteDraft, {
				siteUrl: config.siteUrl,
				draftRevisionId: baseRevisionId,
			});
		}
		form = copyHomepageQuoteDraft(published);
		baseRevisionId = undefined;
		serverRevisionId = undefined;
		serverDraft = copyHomepageQuoteDraft(published);
	}
	lastSavedJson = serializeHomepageQuoteDraft(form);
	lastAttemptedJson = "";
	fieldErrors = {};
	saveError = "";
	saveState = "saved";
	clearLocalDraft();
}
</script>

<svelte:head><title>Homepage quote — {config.siteName}</title></svelte:head>

<div class="settings-page">
	<header class="settings-header">
		<div>
			<h1>homepage quote</h1>
			<p class="description">Edit only the quote and attribution. Its placement, typography, and responsive design remain part of the designed Homepage.</p>
		</div>
		{#if initialized && !setupRequired}
			<div class="actions">
				<span class="save-state" aria-live="polite">{saveState === "offline" ? "offline — saved on this device" : saveState}</span>
				<button type="button" onclick={() => void discard()} disabled={!baseRevisionId && !hasPendingWork}>{saveState === "conflict" ? "reload server draft" : "discard draft"}</button>
				<button type="button" onclick={() => void saveNow()} disabled={saveState === "saving" || saveState === "conflict"}>save now</button>
				{#if previewEndpoint}<button type="button" onclick={() => void preview()} disabled={previewing || saveState === "saving" || saveState === "syncing" || saveState === "offline" || saveState === "conflict"}>{previewing ? "preparing preview…" : "preview"}</button>{/if}
				<button type="button" class="primary" onclick={() => void publish()} disabled={saveState === "saving" || saveState === "syncing" || saveState === "offline" || saveState === "conflict"}>publish</button>
			</div>
		{/if}
	</header>

	{#if saveError}<div class="alert" role="alert">{saveError}</div>{/if}
	{#if !initialized}
		<p class="loading" role="status">loading homepage content…</p>
	{:else if setupRequired}
		<section aria-labelledby="setup-heading">
			<div class="section-heading"><span>01</span><div><h2 id="setup-heading">set up homepage content</h2><p>Copy the quote currently used by the public site or begin with empty fields. This creates an unpublished draft only.</p></div></div>
			<blockquote class="quote-preview">{quoteConfig.initialPayload.text}<footer>— {quoteConfig.initialPayload.attribution}</footer></blockquote>
			<div class="actions">
				<button type="button" class="primary" onclick={() => void beginWithCurrentQuote()} disabled={setupStatus === "saving"}>{setupStatus === "saving" ? "copying…" : "copy current quote"}</button>
				<button type="button" onclick={beginBlank} disabled={setupStatus === "saving"}>start blank</button>
			</div>
		</section>
	{:else}
		<form onsubmit={(event) => { event.preventDefault(); void publish(); }}>
			<section aria-labelledby="quote-heading">
				<div class="section-heading"><span>01</span><div><h2 id="quote-heading">quote</h2><p>These words appear in the existing designed quote block on the Homepage.</p></div></div>
				<div class="fields">
					<label>quote text<textarea rows="9" maxlength="2000" bind:value={form.text} aria-invalid={Boolean(fieldErrors.text)} aria-describedby="quote-count"></textarea><small id="quote-count">{form.text?.length ?? 0} / 2000 characters</small>{#if fieldErrors.text}<small class="field-error">{fieldErrors.text}</small>{/if}</label>
					<label>attribution<input maxlength="160" bind:value={form.attribution} aria-invalid={Boolean(fieldErrors.attribution)} />{#if fieldErrors.attribution}<small class="field-error">{fieldErrors.attribution}</small>{/if}</label>
				</div>
			</section>
		</form>
	{/if}
</div>
