<script lang="ts">
import { browser } from "$app/environment";
import { useQuery } from "convex-svelte";
import { createSingletonDraft } from "../../singletonDraft.svelte";
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

const draft = createSingletonDraft({
	copy: copyHomepageQuoteDraft,
	serialize: serializeHomepageQuoteDraft,
	storageKey,
	enabled: () => !setupRequired,
	conflictMessage: "The server changed while this device had unsynchronized work. Review or reload before publishing.",
	save: (payload, expectedDraftRevisionId) => client.mutation(editorApi.saveHomepageQuoteDraft, {
		siteUrl: config.siteUrl,
		payload,
		...(expectedDraftRevisionId ? { expectedDraftRevisionId } : {}),
	}) as Promise<{ revisionId: string }>,
});
let form = $derived(draft.form);
let published = $state<HomepageQuoteDraftPayload>(emptyHomepageQuoteDraft());
let setupRequired = $state(false);
let setupStatus = $state<"idle" | "saving">("idle");
let previewing = $state(false);
let fieldErrors = $state<HomepageQuoteFieldErrors>({});

$effect(() => {
	const state = editorQuery.data as HomepageQuoteEditorState | null | undefined;
	if (state === undefined) return;
	const payload = copyHomepageQuoteDraft(state?.draft?.payload ?? state?.published?.payload);
	if (draft.initialized) {
		draft.observeServer(payload, state?.draft?.revisionId);
		return;
	}
	if (state === null) {
		setupRequired = true;
		draft.initialize(copyHomepageQuoteDraft(quoteConfig.initialPayload), undefined, false);
		return;
	}
	published = copyHomepageQuoteDraft(state?.published?.payload);
	draft.initialize(payload, state?.draft?.revisionId);
});

async function beginWithCurrentQuote() {
	setupStatus = "saving";
	draft.error = "";
	try {
		const payload = copyHomepageQuoteDraft(quoteConfig.initialPayload);
		const result = await client.mutation(editorApi.saveHomepageQuoteDraft, {
			siteUrl: config.siteUrl,
			payload,
		}) as { revisionId: string };
		draft.initialize(payload, result.revisionId, false);
		setupRequired = false;
	} catch (error) {
		draft.error = error instanceof Error ? error.message : "Could not copy the current quote";
	} finally {
		setupStatus = "idle";
	}
}

function beginBlank() {
	draft.initialize(emptyHomepageQuoteDraft(), undefined, false);
	setupRequired = false;
}

async function publish() {
	fieldErrors = validateHomepageQuoteForPublish(form);
	if (hasHomepageQuoteErrors(fieldErrors)) {
		draft.error = "Complete the highlighted fields before publishing.";
		return;
	}
	const snapshot = await draft.publish((draftRevisionId) => client.mutation(editorApi.publishHomepageQuote, {
		siteUrl: config.siteUrl,
		draftRevisionId,
	}));
	if (snapshot) {
		published = snapshot;
	}
}

async function preview() {
	if (!browser || !previewEndpoint) return;
	const previewWindow = window.open("about:blank", "homepage-quote-preview");
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
		previewWindow.location.href = resolveHomepageQuotePreviewUrl(
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
		if (!confirm("Discard this draft and return to the published quote?")) return;
		if (!(await draft.discard(published, (draftRevisionId) => client.mutation(editorApi.discardHomepageQuoteDraft, {
			siteUrl: config.siteUrl,
			draftRevisionId,
		})))) return;
	}
	fieldErrors = {};
}
</script>

<svelte:head><title>Homepage quote — {config.siteName}</title></svelte:head>

<div class="settings-page">
	<header class="settings-header">
		<h1>homepage quote</h1>
		{#if draft.initialized && !setupRequired}
			<div class="actions">
				<span class="save-state" aria-live="polite">{draft.state === "offline" ? "offline — saved on this device" : draft.state}</span>
				<button type="button" onclick={() => void discard()} disabled={!draft.revisionId && !draft.hasPendingWork}>{draft.state === "conflict" ? "reload server draft" : "discard draft"}</button>
				<button type="button" onclick={() => void draft.saveNow()} disabled={draft.state === "saving" || draft.state === "conflict"}>save now</button>
				{#if previewEndpoint}<button type="button" onclick={() => void preview()} disabled={previewing || draft.state === "saving" || draft.state === "syncing" || draft.state === "offline" || draft.state === "conflict"}>{previewing ? "preparing preview…" : "preview"}</button>{/if}
				<button type="button" class="primary" onclick={() => void publish()} disabled={draft.state === "saving" || draft.state === "syncing" || draft.state === "offline" || draft.state === "conflict"}>publish</button>
			</div>
		{/if}
	</header>

	{#if draft.error}<div class="alert" role="alert">{draft.error}</div>{/if}
	{#if !draft.initialized}
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
				<div class="section-heading"><span>01</span><div><h2 id="quote-heading">quote</h2><p>The quotation shown on the homepage.</p></div></div>
				<div class="fields">
					<label>quote text<textarea rows="9" maxlength="2000" bind:value={form.text} aria-invalid={Boolean(fieldErrors.text)} aria-describedby="quote-count"></textarea><small id="quote-count">{form.text?.length ?? 0} / 2000 characters</small>{#if fieldErrors.text}<small class="field-error">{fieldErrors.text}</small>{/if}</label>
					<label>attribution<input maxlength="160" bind:value={form.attribution} aria-invalid={Boolean(fieldErrors.attribution)} />{#if fieldErrors.attribution}<small class="field-error">{fieldErrors.attribution}</small>{/if}</label>
				</div>
			</section>
		</form>
	{/if}
</div>
