<script lang="ts">
import { browser } from "$app/environment";
import { onMount } from "svelte";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import {
	getAdminConfig,
	type ContactPageDraftPayload,
	type ContactPageEditorState,
} from "../../config";
import {
	copyContactPageDraft,
	emptyContactPageDraft,
	hasContactPageErrors,
	resolveContactPagePreviewUrl,
	serializeContactPageDraft,
	type ContactPageFieldErrors,
	validateContactPageForPublish,
} from "../../contactPage";
import "../../styles/editorial-page.css";

type SaveState = "loading" | "saved" | "dirty" | "saving" | "offline" | "syncing" | "error" | "conflict";

const config = getAdminConfig();
if (!config.api.siteEditor || !config.editor?.contactPage) {
	throw new Error("Contact & Booking editor is not configured for this host");
}
const editorApi = config.api.siteEditor;
const contactConfig = config.editor.contactPage;
const previewEndpoint = contactConfig.previewEndpoint;
const client = useAdminClient();
const editorQuery = useQuery(editorApi.getContactPageEditorState, { siteUrl: config.siteUrl });
const storageKey = `admin:site-editor:contact-page:${config.siteUrl}`;

let form = $state<ContactPageDraftPayload>(emptyContactPageDraft());
let published = $state<ContactPageDraftPayload>(emptyContactPageDraft());
let serverDraft = $state<ContactPageDraftPayload>(emptyContactPageDraft());
let baseRevisionId = $state<string | undefined>();
let serverRevisionId = $state<string | undefined>();
let initialized = $state(false);
let setupRequired = $state(false);
let setupStatus = $state<"idle" | "saving">("idle");
let previewing = $state(false);
let online = $state(true);
let saveState = $state<SaveState>("loading");
let saveError = $state("");
let fieldErrors = $state<ContactPageFieldErrors>({});
let lastSavedJson = $state("");
let lastAttemptedJson = $state("");
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let currentJson = $derived(serializeContactPageDraft(form));
let hasPendingWork = $derived(["dirty", "saving", "offline", "syncing", "error", "conflict"].includes(saveState));

function clearLocalDraft() {
	if (browser) localStorage.removeItem(storageKey);
}

function persistLocalDraft() {
	if (!browser || setupRequired) return;
	localStorage.setItem(storageKey, JSON.stringify({
		schemaVersion: 1,
		baseRevisionId: baseRevisionId ?? null,
		payload: copyContactPageDraft(form),
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
			payload: ContactPageDraftPayload;
		};
		if (local.schemaVersion !== 1) return;
		form = copyContactPageDraft(local.payload);
		if ((local.baseRevisionId ?? undefined) !== baseRevisionId) {
			saveState = "conflict";
			saveError = "The server changed while this device had unsynchronized work. Review or reload before publishing.";
			return;
		}
		saveState = serializeContactPageDraft(form) === serverJson ? "saved" : "dirty";
	} catch {
		clearLocalDraft();
	}
}

$effect(() => {
	const state = editorQuery.data as ContactPageEditorState | null | undefined;
	if (state === undefined) return;
	if (initialized) {
		if (saveState === "conflict" && state?.draft?.revisionId !== serverRevisionId) {
			serverRevisionId = state?.draft?.revisionId;
			serverDraft = copyContactPageDraft(state?.draft?.payload ?? state?.published?.payload);
		}
		return;
	}
	if (state === null) {
		form = copyContactPageDraft(contactConfig.initialPayload);
		lastSavedJson = serializeContactPageDraft(form);
		setupRequired = true;
		saveState = "saved";
		initialized = true;
		return;
	}
	baseRevisionId = state.draft?.revisionId;
	serverRevisionId = baseRevisionId;
	published = copyContactPageDraft(state.published?.payload);
	serverDraft = copyContactPageDraft(state.draft?.payload ?? state.published?.payload);
	form = copyContactPageDraft(serverDraft);
	lastSavedJson = serializeContactPageDraft(form);
	saveState = "saved";
	initialized = true;
	restoreLocalDraft(lastSavedJson);
});

async function beginWithCurrentContent() {
	setupStatus = "saving";
	saveError = "";
	try {
		const payload = copyContactPageDraft(contactConfig.initialPayload);
		const result = await client.mutation(editorApi.saveContactPageDraft, {
			siteUrl: config.siteUrl,
			payload,
		}) as { revisionId: string };
		form = copyContactPageDraft(payload);
		serverDraft = copyContactPageDraft(payload);
		baseRevisionId = result.revisionId;
		serverRevisionId = result.revisionId;
		lastSavedJson = serializeContactPageDraft(payload);
		setupRequired = false;
		saveState = "saved";
	} catch (error) {
		saveError = error instanceof Error ? error.message : "Could not copy the current content";
	} finally {
		setupStatus = "idle";
	}
}

function beginBlank() {
	form = emptyContactPageDraft();
	serverDraft = emptyContactPageDraft();
	lastSavedJson = serializeContactPageDraft(form);
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
	const snapshot = copyContactPageDraft(form);
	const snapshotJson = serializeContactPageDraft(snapshot);
	saveState = saveState === "offline" ? "syncing" : "saving";
	saveError = "";
	try {
		const result = await client.mutation(editorApi.saveContactPageDraft, {
			siteUrl: config.siteUrl,
			payload: snapshot,
			...(baseRevisionId ? { expectedDraftRevisionId: baseRevisionId } : {}),
		}) as { revisionId: string };
		baseRevisionId = result.revisionId;
		serverRevisionId = result.revisionId;
		serverDraft = copyContactPageDraft(snapshot);
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
	fieldErrors = validateContactPageForPublish(form);
	if (hasContactPageErrors(fieldErrors)) {
		saveError = "Complete the highlighted fields before publishing.";
		return;
	}
	if (!(await saveNow()) || !baseRevisionId) return;
	try {
		await client.mutation(editorApi.publishContactPage, {
			siteUrl: config.siteUrl,
			draftRevisionId: baseRevisionId,
		});
		published = copyContactPageDraft(form);
		serverDraft = copyContactPageDraft(form);
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
	const previewWindow = window.open("about:blank", "contact-page-preview");
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
		previewWindow.location.href = resolveContactPagePreviewUrl(
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
		form = copyContactPageDraft(serverDraft);
		baseRevisionId = serverRevisionId;
	} else {
		if (!confirm("Discard this draft and return to the published Contact content?")) return;
		if (baseRevisionId) {
			await client.mutation(editorApi.discardContactPageDraft, {
				siteUrl: config.siteUrl,
				draftRevisionId: baseRevisionId,
			});
		}
		form = copyContactPageDraft(published);
		baseRevisionId = undefined;
		serverRevisionId = undefined;
		serverDraft = copyContactPageDraft(published);
	}
	lastSavedJson = serializeContactPageDraft(form);
	lastAttemptedJson = "";
	fieldErrors = {};
	saveError = "";
	saveState = "saved";
	clearLocalDraft();
}

function updateChoice(index: number, value: string) {
	const choices = [...(form.inquiryChoices ?? [])];
	choices[index] = value;
	form.inquiryChoices = choices;
}

function addChoice() {
	if ((form.inquiryChoices?.length ?? 0) >= 12) return;
	form.inquiryChoices = [...(form.inquiryChoices ?? []), ""];
}

function removeChoice(index: number) {
	form.inquiryChoices = (form.inquiryChoices ?? []).filter((_, itemIndex) => itemIndex !== index);
}

function moveChoice(index: number, offset: -1 | 1) {
	const choices = [...(form.inquiryChoices ?? [])];
	const target = index + offset;
	if (target < 0 || target >= choices.length) return;
	[choices[index], choices[target]] = [choices[target], choices[index]];
	form.inquiryChoices = choices;
}
</script>

<svelte:head><title>Contact &amp; booking — {config.siteName}</title></svelte:head>

<div class="settings-page">
	<header class="settings-header">
		<div>
			<h1>contact &amp; booking</h1>
			<p class="description">Edit the words and public destinations visitors see. Form fields, required validation, abuse protection, recipients, and delivery integrations remain platform-managed.</p>
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
		<p class="loading" role="status">loading contact content…</p>
	{:else if setupRequired}
		<section aria-labelledby="setup-contact-heading">
			<div class="section-heading"><span>01</span><div><h2 id="setup-contact-heading">set up contact content</h2><p>Copy the content currently used by the public site or begin with empty fields. This creates an unpublished draft only.</p></div></div>
			<div class="setup-summary"><strong>{contactConfig.initialPayload.heading}</strong><span>{contactConfig.initialPayload.intro}</span></div>
			<div class="actions">
				<button type="button" class="primary" onclick={() => void beginWithCurrentContent()} disabled={setupStatus === "saving"}>{setupStatus === "saving" ? "copying…" : "copy current content"}</button>
				<button type="button" onclick={beginBlank} disabled={setupStatus === "saving"}>start blank</button>
			</div>
		</section>
	{:else}
		<form onsubmit={(event) => { event.preventDefault(); void publish(); }}>
			<section aria-labelledby="contact-copy-heading">
				<div class="section-heading"><span>01</span><div><h2 id="contact-copy-heading">contact copy</h2><p>Visible words around the existing designed contact form.</p></div></div>
				<div class="fields two-column">
					<label class="wide">heading<input maxlength="120" bind:value={form.heading} aria-invalid={Boolean(fieldErrors.heading)} />{#if fieldErrors.heading}<small class="field-error">{fieldErrors.heading}</small>{/if}</label>
					<label class="wide">introduction<textarea rows="5" maxlength="2000" bind:value={form.intro} aria-invalid={Boolean(fieldErrors.intro)}></textarea><small>{form.intro?.length ?? 0} / 2000</small>{#if fieldErrors.intro}<small class="field-error">{fieldErrors.intro}</small>{/if}</label>
					<label>public email<input type="email" maxlength="254" bind:value={form.email} aria-invalid={Boolean(fieldErrors.email)} />{#if fieldErrors.email}<small class="field-error">{fieldErrors.email}</small>{/if}</label>
					<label>public phone <small>optional</small><input maxlength="80" bind:value={form.phone} aria-invalid={Boolean(fieldErrors.phone)} />{#if fieldErrors.phone}<small class="field-error">{fieldErrors.phone}</small>{/if}</label>
					<label>availability guidance <small>optional</small><textarea rows="3" maxlength="500" bind:value={form.availability} aria-invalid={Boolean(fieldErrors.availability)}></textarea>{#if fieldErrors.availability}<small class="field-error">{fieldErrors.availability}</small>{/if}</label>
					<label>response-time guidance <small>optional</small><textarea rows="3" maxlength="300" bind:value={form.responseTime} aria-invalid={Boolean(fieldErrors.responseTime)}></textarea>{#if fieldErrors.responseTime}<small class="field-error">{fieldErrors.responseTime}</small>{/if}</label>
					<label class="wide">message confirmation<textarea rows="3" maxlength="500" bind:value={form.confirmationMessage} aria-invalid={Boolean(fieldErrors.confirmationMessage)}></textarea><small>Shown after the platform confirms successful delivery.</small>{#if fieldErrors.confirmationMessage}<small class="field-error">{fieldErrors.confirmationMessage}</small>{/if}</label>
				</div>
			</section>

			<section aria-labelledby="booking-copy-heading">
				<div class="section-heading"><span>02</span><div><h2 id="booking-copy-heading">booking</h2><p>The frontend keeps its designed booking treatment; these fields supply its visible words and destination.</p></div></div>
				<div class="fields two-column">
					<label class="toggle wide"><span><input type="checkbox" bind:checked={form.bookingEnabled} /> offer an external booking link</span><small>Turning this off keeps the existing inquiry fallback; it does not disable the contact form.</small></label>
					<label>button label<input maxlength="120" bind:value={form.bookingLabel} aria-invalid={Boolean(fieldErrors.bookingLabel)} />{#if fieldErrors.bookingLabel}<small class="field-error">{fieldErrors.bookingLabel}</small>{/if}</label>
					<label>booking URL<input type="url" maxlength="2048" bind:value={form.bookingUrl} disabled={!form.bookingEnabled} aria-invalid={Boolean(fieldErrors.bookingUrl)} />{#if fieldErrors.bookingUrl}<small class="field-error">{fieldErrors.bookingUrl}</small>{/if}</label>
					<label class="wide">booking introduction<textarea rows="4" maxlength="1000" bind:value={form.bookingIntro} aria-invalid={Boolean(fieldErrors.bookingIntro)}></textarea>{#if fieldErrors.bookingIntro}<small class="field-error">{fieldErrors.bookingIntro}</small>{/if}</label>
				</div>
			</section>

			<section aria-labelledby="inquiry-choices-heading">
				<div class="section-heading"><span>03</span><div><h2 id="inquiry-choices-heading">inquiry choices</h2><p>Optional business labels the designed form may offer. They cannot add fields, change validation, or alter delivery.</p></div><button type="button" class="text-action" onclick={addChoice} disabled={(form.inquiryChoices?.length ?? 0) >= 12}>add choice</button></div>
				<div class="choice-list">
					{#each form.inquiryChoices ?? [] as choice, index}
						<div class="choice-row">
							<label><span>choice {index + 1}</span><input maxlength="120" value={choice} oninput={(event) => updateChoice(index, event.currentTarget.value)} /></label>
							<div class="row-actions"><button type="button" onclick={() => moveChoice(index, -1)} disabled={index === 0} aria-label={`move choice ${index + 1} up`}>↑</button><button type="button" onclick={() => moveChoice(index, 1)} disabled={index === (form.inquiryChoices?.length ?? 0) - 1} aria-label={`move choice ${index + 1} down`}>↓</button><button type="button" onclick={() => removeChoice(index)}>remove</button></div>
						</div>
					{/each}
					{#if !(form.inquiryChoices?.length)}<p class="empty">No choices configured. The designed form may continue using its ordinary free-text subject field.</p>{/if}
				</div>
				{#if fieldErrors.inquiryChoices}<small class="field-error">{fieldErrors.inquiryChoices}</small>{/if}
			</section>
		</form>
	{/if}
</div>

<style>
	.setup-summary { display: flex; flex-direction: column; gap: 8px; margin: 0 0 20px; color: var(--admin-text); text-transform: none; }
	.setup-summary span { color: var(--admin-text-muted); line-height: 1.5; }
	.toggle > span { display: flex; align-items: center; gap: 10px; color: var(--admin-text); }
	.toggle input { width: auto; }
	.choice-list { display: grid; gap: 12px; }
	.choice-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: start; }
	.choice-row .row-actions { padding-top: 23px; }
	@media (max-width: 768px) { .choice-row { grid-template-columns: 1fr; } .choice-row .row-actions { padding-top: 0; } }
</style>
