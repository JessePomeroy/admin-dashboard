<script lang="ts">
import { browser } from "$app/environment";
import { useQuery } from "convex-svelte";
import { dragHandle, dragHandleZone } from "svelte-dnd-action";
import { createSingletonDraft } from "../../singletonDraft.svelte";
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

const config = getAdminConfig();
if (!config.api.siteEditor || !config.editor?.contactPage) {
	throw new Error("Contact & Booking editor is not configured for this host");
}
const editorApi = config.api.siteEditor;
const contactConfig = config.editor.contactPage;
const publishContactPage = editorApi.publishContactPage;
const publishingEnabled = Boolean(publishContactPage);
const previewEndpoint = publishingEnabled ? contactConfig.previewEndpoint : undefined;
const client = useAdminClient();
const editorQuery = useQuery(editorApi.getContactPageEditorState, { siteUrl: config.siteUrl });
const storageKey = `admin:site-editor:contact-page:${config.siteUrl}`;

const draft = createSingletonDraft({
	copy: copyContactPageDraft,
	serialize: serializeContactPageDraft,
	storageKey,
	enabled: () => !setupRequired,
	conflictMessage: publishingEnabled
		? "The server changed while this device had unsynchronized work. Review or reload before publishing."
		: "The server changed while this device had unsynchronized work. Review or reload before continuing.",
	save: (payload, expectedDraftRevisionId) => client.mutation(editorApi.saveContactPageDraft, {
		siteUrl: config.siteUrl,
		payload,
		...(expectedDraftRevisionId ? { expectedDraftRevisionId } : {}),
	}) as Promise<{ revisionId: string }>,
});
let form = $derived(draft.form);
let published = $state<ContactPageDraftPayload>(emptyContactPageDraft());
let setupRequired = $state(false);
let setupStatus = $state<"idle" | "saving">("idle");
let previewing = $state(false);
let fieldErrors = $state<ContactPageFieldErrors>({});
type DraggableChoice = { id: string; value: string; isDndShadowItem?: boolean };
let choiceDragItems = $state<DraggableChoice[] | null>(null);
let visibleChoices: DraggableChoice[] = $derived(choiceDragItems ?? (form.inquiryChoices ?? []).map((value, index) => ({ id: `choice-${index}`, value })));

$effect(() => {
	const state = editorQuery.data as ContactPageEditorState | null | undefined;
	if (state === undefined) return;
	const payload = copyContactPageDraft(state?.draft?.payload ?? state?.published?.payload);
	if (draft.initialized) {
		draft.observeServer(payload, state?.draft?.revisionId);
		return;
	}
	if (state === null) {
		setupRequired = true;
		draft.initialize(copyContactPageDraft(contactConfig.initialPayload), undefined, false);
		return;
	}
	published = copyContactPageDraft(state?.published?.payload);
	draft.initialize(payload, state?.draft?.revisionId);
});

async function beginWithCurrentContent() {
	setupStatus = "saving";
	draft.error = "";
	try {
		const payload = copyContactPageDraft(contactConfig.initialPayload);
		const result = await client.mutation(editorApi.saveContactPageDraft, {
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
	draft.initialize(emptyContactPageDraft(), undefined, false);
	setupRequired = false;
}

async function publish() {
	if (!publishContactPage) {
		await draft.saveNow();
		return;
	}
	fieldErrors = validateContactPageForPublish(form);
	if (hasContactPageErrors(fieldErrors)) {
		draft.error = "Complete the highlighted fields before publishing.";
		return;
	}
	const snapshot = await draft.publish((draftRevisionId) => client.mutation(publishContactPage, {
		siteUrl: config.siteUrl,
		draftRevisionId,
	}));
	if (snapshot) {
		published = snapshot;
	}
}

async function preview() {
	if (!browser || !previewEndpoint) return;
	const previewWindow = window.open("about:blank", "contact-page-preview");
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
		previewWindow.location.href = resolveContactPagePreviewUrl(
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
		if (!confirm(publishingEnabled
			? "Discard this draft and return to the published Contact content?"
			: "Discard this private draft and reset the form?")) return;
		if (!(await draft.discard(published, (draftRevisionId) => client.mutation(editorApi.discardContactPageDraft, {
			siteUrl: config.siteUrl,
			draftRevisionId,
		})))) return;
	}
	fieldErrors = {};
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

function finishChoiceReorder(event: CustomEvent<{ items: DraggableChoice[] }>) {
	choiceDragItems = null;
	form.inquiryChoices = event.detail.items.filter((item) => !item.isDndShadowItem).map((item) => item.value);
}
</script>

<svelte:head><title>Contact &amp; booking — {config.siteName}</title></svelte:head>

<div class="settings-page">
	<header class="settings-header">
		<h1>contact &amp; booking</h1>
		{#if draft.initialized && !setupRequired}
			<div class="actions">
				<span class="save-state" aria-live="polite">{draft.state === "offline" ? "offline — saved on this device" : draft.state}</span>
				<button type="button" onclick={() => void discard()} disabled={!draft.revisionId && !draft.hasPendingWork}>{draft.state === "conflict" ? "reload server draft" : "discard draft"}</button>
				<button type="button" onclick={() => void draft.saveNow()} disabled={draft.state === "saving" || draft.state === "conflict"}>save now</button>
				{#if previewEndpoint}<button type="button" onclick={() => void preview()} disabled={previewing || draft.state === "saving" || draft.state === "syncing" || draft.state === "offline" || draft.state === "conflict"}>{previewing ? "preparing preview…" : "preview"}</button>{/if}
				{#if publishingEnabled}<button type="button" class="primary" onclick={() => void publish()} disabled={draft.state === "saving" || draft.state === "syncing" || draft.state === "offline" || draft.state === "conflict"}>publish</button>{/if}
			</div>
		{/if}
	</header>

	{#if draft.error}<div class="alert" role="alert">{draft.error}</div>{/if}
	{#if !draft.initialized}
		<p class="loading" role="status">loading contact content…</p>
	{:else if setupRequired}
		<section aria-labelledby="setup-contact-heading">
			<div class="section-heading"><span>01</span><div><h2 id="setup-contact-heading">set up contact content</h2><p>{publishingEnabled
				? "Copy the content currently used by the public site or begin with empty fields. This creates an unpublished draft only."
				: "Copy the content currently used by the public site or begin with empty fields. This creates a private draft in this editor."}</p></div></div>
			<div class="setup-summary"><strong>{contactConfig.initialPayload.heading}</strong><span>{contactConfig.initialPayload.intro}</span></div>
			<div class="actions">
				<button type="button" class="primary" onclick={() => void beginWithCurrentContent()} disabled={setupStatus === "saving"}>{setupStatus === "saving" ? "copying…" : "copy current content"}</button>
				<button type="button" onclick={beginBlank} disabled={setupStatus === "saving"}>start blank</button>
			</div>
		</section>
	{:else}
		<form onsubmit={(event) => { event.preventDefault(); publishingEnabled ? void publish() : void draft.saveNow(); }}>
			<section aria-labelledby="contact-copy-heading">
				<div class="section-heading"><span>01</span><div><h2 id="contact-copy-heading">contact copy</h2><p>The introduction and contact details shown above the form.</p></div></div>
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
				<div class="section-heading"><span>02</span><div><h2 id="booking-copy-heading">booking</h2><p>The words and destination for the optional booking link.</p></div></div>
				<div class="fields two-column">
					<label class="toggle wide"><span><input type="checkbox" bind:checked={form.bookingEnabled} /> offer an external booking link</span><small>Turning this off keeps the existing inquiry fallback; it does not disable the contact form.</small></label>
					<label>button label<input maxlength="120" bind:value={form.bookingLabel} aria-invalid={Boolean(fieldErrors.bookingLabel)} />{#if fieldErrors.bookingLabel}<small class="field-error">{fieldErrors.bookingLabel}</small>{/if}</label>
					<label>booking URL<input type="url" maxlength="2048" bind:value={form.bookingUrl} disabled={!form.bookingEnabled} aria-invalid={Boolean(fieldErrors.bookingUrl)} />{#if fieldErrors.bookingUrl}<small class="field-error">{fieldErrors.bookingUrl}</small>{/if}</label>
					<label class="wide">booking introduction<textarea rows="4" maxlength="1000" bind:value={form.bookingIntro} aria-invalid={Boolean(fieldErrors.bookingIntro)}></textarea>{#if fieldErrors.bookingIntro}<small class="field-error">{fieldErrors.bookingIntro}</small>{/if}</label>
				</div>
			</section>

			<section aria-labelledby="inquiry-choices-heading">
				<div class="section-heading"><span>03</span><div><h2 id="inquiry-choices-heading">inquiry choices</h2><p>Optional subjects visitors can choose when they write.</p></div><button type="button" class="text-action" onclick={addChoice} disabled={(form.inquiryChoices?.length ?? 0) >= 12}>add choice</button></div>
				<div class="choice-list" aria-label="Reorder inquiry choices" use:dragHandleZone={{ items: visibleChoices, dragDisabled: (form.inquiryChoices?.length ?? 0) < 2, flipDurationMs: 140, morphDisabled: true, dropTargetStyle: {}, type: "contact-inquiry-choices" }} onconsider={(event) => choiceDragItems = event.detail.items} onfinalize={finishChoiceReorder}>
					{#each visibleChoices as choice, index (choice.id)}
						<div class="choice-row" class:dnd-shadow={choice.isDndShadowItem}>
							<label><span>choice {index + 1}</span><input maxlength="120" value={choice.value} oninput={(event) => updateChoice(index, event.currentTarget.value)} disabled={choice.isDndShadowItem} /></label>
							<div class="row-actions"><button type="button" class="drag-handle" use:dragHandle disabled={(form.inquiryChoices?.length ?? 0) < 2 || choice.isDndShadowItem} aria-label={`Drag choice ${index + 1} to reorder`}><span aria-hidden="true"></span></button><button type="button" onclick={() => removeChoice(index)} disabled={choice.isDndShadowItem}>remove</button></div>
						</div>
					{/each}
					{#if !(form.inquiryChoices?.length)}<p class="empty">No choices yet. Visitors can still write their own subject.</p>{/if}
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
	.drag-handle { display: grid; place-items: center; min-width: 42px; padding: 0; border-color: transparent; color: var(--admin-text-muted); touch-action: none; }
	.drag-handle span { width: 12px; height: 18px; background: radial-gradient(circle, currentColor 1.3px, transparent 1.5px) 0 0 / 6px 6px; opacity: .62; }
	.drag-handle:hover:not(:disabled) { color: var(--admin-heading); }
	.dnd-shadow { opacity: .34; }
	@media (max-width: 768px) { .choice-row { grid-template-columns: 1fr; } .choice-row .row-actions { padding-top: 0; } }
</style>
