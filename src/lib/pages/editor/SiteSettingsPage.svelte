<script lang="ts">
import { browser } from "$app/environment";
import { onMount } from "svelte";
import { useQuery } from "convex-svelte";
import { dragHandle, dragHandleZone } from "svelte-dnd-action";
import { useAdminClient } from "../../adminClient";
import {
	getAdminConfig,
	type SiteSettingsDraftPayload,
	type SiteSettingsEditorState,
} from "../../config";
import {
	copySiteSettingsDraft,
	emptySiteSettingsDraft,
	hasSiteSettingsErrors,
	serializeSiteSettingsDraft,
	type SiteSettingsFieldErrors,
	validateSiteSettingsForPublish,
} from "../../siteSettings";
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
if (!config.api.siteEditor || !config.editor?.siteSettings) {
	throw new Error("Site editor is not configured for this host");
}
const editorApi = config.api.siteEditor;
const siteSettingsConfig = config.editor.siteSettings;
const publishSiteSettings = editorApi.publishSiteSettings;
const publishingEnabled = Boolean(publishSiteSettings);

const client = useAdminClient();
const editorQuery = useQuery(editorApi.getSiteSettingsEditorState, {
	siteUrl: config.siteUrl,
});
const storageKey = `admin:site-editor:site-settings:${config.siteUrl}`;

let form = $state<SiteSettingsDraftPayload>(emptySiteSettingsDraft());
let published = $state<SiteSettingsDraftPayload>(emptySiteSettingsDraft());
let serverDraft = $state<SiteSettingsDraftPayload>(emptySiteSettingsDraft());
let baseRevisionId = $state<string | undefined>(undefined);
let initialized = $state(false);
let online = $state(true);
let saveState = $state<SaveState>("loading");
let saveError = $state("");
let fieldErrors = $state<SiteSettingsFieldErrors>({});
let lastSavedJson = $state("");
let lastAttemptedJson = $state("");
let saveTimer: ReturnType<typeof setTimeout> | undefined;
type DraggableSocialLink = NonNullable<SiteSettingsDraftPayload["socialLinks"]>[number] & { id: string; isDndShadowItem?: boolean };
let socialDragItems = $state<DraggableSocialLink[] | null>(null);
let visibleSocialLinks: DraggableSocialLink[] = $derived(socialDragItems ?? (form.socialLinks ?? []).map((link, index) => ({ ...link, id: `social-${index}` })));
let currentJson = $derived(serializeSiteSettingsDraft(form));
let hasPendingWork = $derived(
	["dirty", "saving", "offline", "syncing", "error", "conflict"].includes(
		saveState,
	),
);

function persistLocalDraft() {
	if (!browser) return;
	localStorage.setItem(
		storageKey,
		JSON.stringify({
			schemaVersion: 1,
			baseRevisionId: baseRevisionId ?? null,
			payload: copySiteSettingsDraft(form),
		}),
	);
}

function clearLocalDraft() {
	if (browser) localStorage.removeItem(storageKey);
}

function restoreLocalDraft(serverJson: string) {
	if (!browser) return false;
	const value = localStorage.getItem(storageKey);
	if (!value) return false;
	try {
		const local = JSON.parse(value) as {
			schemaVersion: number;
			baseRevisionId: string | null;
			payload: SiteSettingsDraftPayload;
		};
		if (local.schemaVersion !== 1) return false;
		form = copySiteSettingsDraft(local.payload);
		if ((local.baseRevisionId ?? undefined) !== baseRevisionId) {
			saveState = "conflict";
			saveError = publishingEnabled
				? "The server changed while this device had unsynchronized work. Review or discard this draft before publishing."
				: "The server changed while this device had unsynchronized work. Review or discard this draft before continuing.";
			return true;
		}
		saveState = serializeSiteSettingsDraft(form) === serverJson ? "saved" : "dirty";
		return true;
	} catch {
		clearLocalDraft();
		return false;
	}
}

$effect(() => {
	const state = editorQuery.data as SiteSettingsEditorState | null | undefined;
	if (state === undefined || initialized) return;
	baseRevisionId = state?.draft?.revisionId;
	published = copySiteSettingsDraft(state?.published?.payload);
	serverDraft = copySiteSettingsDraft(state?.draft?.payload ?? state?.published?.payload);
	form = copySiteSettingsDraft(serverDraft);
	lastSavedJson = serializeSiteSettingsDraft(form);
	saveState = "saved";
	restoreLocalDraft(lastSavedJson);
	initialized = true;
});

async function saveNow() {
	if (saveTimer) {
		clearTimeout(saveTimer);
		saveTimer = undefined;
	}
	if (!initialized || saveState === "conflict") return false;
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

	const snapshot = copySiteSettingsDraft(form);
	const snapshotJson = serializeSiteSettingsDraft(snapshot);
	saveState = saveState === "offline" ? "syncing" : "saving";
	saveError = "";
	try {
		const mutationArgs = {
			siteUrl: config.siteUrl,
			payload: snapshot,
			...(baseRevisionId
				? { expectedDraftRevisionId: baseRevisionId }
				: {}),
		};
		const result = (await client.mutation(
			editorApi.saveSiteSettingsDraft,
			mutationArgs,
		)) as { revisionId: string };
		baseRevisionId = result.revisionId;
		serverDraft = copySiteSettingsDraft(snapshot);
		lastSavedJson = snapshotJson;
		lastAttemptedJson = "";
		if (currentJson === snapshotJson) {
			saveState = "saved";
			clearLocalDraft();
		} else {
			saveState = "dirty";
			persistLocalDraft();
		}
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
	if (!initialized || changedJson === lastSavedJson || saveState === "conflict") return;
	if (saveState === "error" && changedJson === lastAttemptedJson) return;
	persistLocalDraft();
	saveState = online ? "dirty" : "offline";
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => void saveNow(), 900);
});

onMount(() => {
	online = navigator.onLine;
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
	if (!publishSiteSettings) {
		await saveNow();
		return;
	}
	fieldErrors = validateSiteSettingsForPublish(form);
	if (hasSiteSettingsErrors(fieldErrors)) {
		saveError = "Complete the highlighted fields before publishing.";
		return;
	}
	if (!(await saveNow()) || !baseRevisionId) return;
	try {
		await client.mutation(publishSiteSettings, {
			siteUrl: config.siteUrl,
			draftRevisionId: baseRevisionId,
		});
		published = copySiteSettingsDraft(form);
		baseRevisionId = undefined;
		lastSavedJson = currentJson;
		saveState = "saved";
		saveError = "";
		clearLocalDraft();
	} catch (error) {
		saveState = "error";
		saveError = error instanceof Error ? error.message : "Could not publish";
	}
}

async function discard() {
	if (saveState === "conflict") {
		if (!confirm("Discard this device's unsynchronized changes and load the newer server draft?")) return;
		form = copySiteSettingsDraft(serverDraft);
		lastSavedJson = serializeSiteSettingsDraft(form);
		lastAttemptedJson = "";
		fieldErrors = {};
		saveError = "";
		saveState = "saved";
		clearLocalDraft();
		return;
	}
	if (!confirm(publishingEnabled
		? "Discard this draft and return to the currently published settings?"
		: "Discard this private draft and reset the form?")) return;
	if (baseRevisionId) {
		await client.mutation(editorApi.discardSiteSettingsDraft, {
			siteUrl: config.siteUrl,
			draftRevisionId: baseRevisionId,
		});
	}
	form = copySiteSettingsDraft(published);
	baseRevisionId = undefined;
	lastSavedJson = serializeSiteSettingsDraft(form);
	lastAttemptedJson = "";
	fieldErrors = {};
	saveError = "";
	saveState = "saved";
	clearLocalDraft();
}

function addSocialLink() {
	form.socialLinks = [...(form.socialLinks ?? []), { platform: "", url: "" }];
}

function removeSocialLink(index: number) {
	form.socialLinks = (form.socialLinks ?? []).filter((_, itemIndex) => itemIndex !== index);
}

function updateSocialLink(index: number, change: Partial<NonNullable<SiteSettingsDraftPayload["socialLinks"]>[number]>) {
	form.socialLinks = (form.socialLinks ?? []).map((link, itemIndex) => itemIndex === index ? { ...link, ...change } : link);
}

function finishSocialReorder(event: CustomEvent<{ items: DraggableSocialLink[] }>) {
	socialDragItems = null;
	form.socialLinks = event.detail.items.filter((item) => !item.isDndShadowItem).map(({ id: _id, isDndShadowItem: _shadow, ...link }) => link);
}
</script>

<svelte:head><title>Site settings — {config.siteName}</title></svelte:head>

<div class="settings-page">
	<header class="settings-header">
		<h1>site settings</h1>
		<div class="actions">
			<span class="save-state" aria-live="polite">{saveState === "offline" ? "offline — saved on this device" : saveState}</span>
			{#if publishingEnabled && siteSettingsConfig.previewHref}
				<a href={siteSettingsConfig.previewHref} target="_blank" rel="noopener">preview</a>
			{/if}
			<button type="button" class="secondary" onclick={() => void discard()} disabled={!initialized || (!baseRevisionId && !hasPendingWork)}>{saveState === "conflict" ? "reload server draft" : "discard draft"}</button>
			<button type="button" class="secondary" onclick={() => void saveNow()} disabled={!initialized || saveState === "saving" || saveState === "conflict"}>save now</button>
			{#if publishingEnabled}
				<button type="button" class="primary" onclick={() => void publish()} disabled={!initialized || saveState === "saving" || saveState === "syncing" || saveState === "offline" || saveState === "conflict"}>publish</button>
			{/if}
		</div>
	</header>

	{#if saveError}
		<div class="alert" role="alert">{saveError}</div>
	{/if}

	{#if !initialized}
		<p class="loading" role="status">loading site settings…</p>
	{:else}
		<form onsubmit={(event) => { event.preventDefault(); publishingEnabled ? void publish() : void saveNow(); }}>
			<section aria-labelledby="identity-heading">
				<div class="section-heading"><span>01</span><div><h2 id="identity-heading">site identity</h2><p>{publishingEnabled ? "The public name and short description of this site." : "The name and short description prepared for a future public rollout."}</p></div></div>
				<div class="fields two-column">
					<label>artist or business name<input maxlength="120" bind:value={form.artistName} aria-invalid={Boolean(fieldErrors.artistName)} />{#if fieldErrors.artistName}<small class="field-error">{fieldErrors.artistName}</small>{/if}</label>
					<label>browser and site title<input maxlength="120" bind:value={form.siteTitle} aria-invalid={Boolean(fieldErrors.siteTitle)} />{#if fieldErrors.siteTitle}<small class="field-error">{fieldErrors.siteTitle}</small>{/if}</label>
					<label class="wide">tagline<textarea rows="3" maxlength="300" bind:value={form.tagline} aria-invalid={Boolean(fieldErrors.tagline)}></textarea>{#if fieldErrors.tagline}<small class="field-error">{fieldErrors.tagline}</small>{/if}</label>
				</div>
			</section>

			<section aria-labelledby="social-heading">
				<div class="section-heading"><span>02</span><div><h2 id="social-heading">social links</h2><p>Shown in the deliberate order below.</p></div><button type="button" class="text-action" onclick={addSocialLink} disabled={(form.socialLinks?.length ?? 0) >= 20}>add link</button></div>
				<div class="social-list" aria-label="Reorder social links" use:dragHandleZone={{ items: visibleSocialLinks, dragDisabled: (form.socialLinks?.length ?? 0) < 2, flipDurationMs: 140, morphDisabled: true, dropTargetStyle: {}, type: "site-social-links" }} onconsider={(event) => socialDragItems = event.detail.items} onfinalize={finishSocialReorder}>
					{#each visibleSocialLinks as link, index (link.id)}
						<div class="social-row" class:dnd-shadow={link.isDndShadowItem}>
							<label>platform<input maxlength="50" value={link.platform} oninput={(event) => updateSocialLink(index, { platform: event.currentTarget.value })} aria-invalid={Boolean(fieldErrors[`socialLinks.${index}.platform`])} disabled={link.isDndShadowItem} />{#if fieldErrors[`socialLinks.${index}.platform`]}<small class="field-error">{fieldErrors[`socialLinks.${index}.platform`]}</small>{/if}</label>
							<label>public URL<input type="url" maxlength="2048" value={link.url} oninput={(event) => updateSocialLink(index, { url: event.currentTarget.value })} aria-invalid={Boolean(fieldErrors[`socialLinks.${index}.url`])} disabled={link.isDndShadowItem} />{#if fieldErrors[`socialLinks.${index}.url`]}<small class="field-error">{fieldErrors[`socialLinks.${index}.url`]}</small>{/if}</label>
							<div class="row-actions">
								<button type="button" class="drag-handle" use:dragHandle disabled={(form.socialLinks?.length ?? 0) < 2 || link.isDndShadowItem} aria-label={`Drag ${link.platform || `social link ${index + 1}`} to reorder`}><span aria-hidden="true"></span></button>
								<button type="button" onclick={() => removeSocialLink(index)} aria-label="Remove link" disabled={link.isDndShadowItem}>remove</button>
							</div>
						</div>
					{/each}
					{#if (form.socialLinks?.length ?? 0) === 0}<p class="empty">No social links yet.</p>{/if}
				</div>
			</section>

			<section aria-labelledby="seo-heading">
				<div class="section-heading"><span>03</span><div><h2 id="seo-heading">search defaults</h2><p>Used when an individual page does not provide a more specific description.</p></div></div>
				<label>default SEO description<textarea rows="4" maxlength="320" bind:value={form.seoDescription} placeholder="For example: Detroit-based photographer creating…" aria-describedby="seo-help" aria-invalid={Boolean(fieldErrors.seoDescription)}></textarea><small id="seo-help">Describe who the site belongs to, what they create, and where they work in one or two natural sentences.</small>{#if fieldErrors.seoDescription}<small class="field-error">{fieldErrors.seoDescription}</small>{/if}</label>
			</section>
		</form>
	{/if}
</div>

<style>
	.drag-handle { display: grid; place-items: center; min-width: 42px; padding: 0; border-color: transparent; color: var(--admin-text-muted); touch-action: none; }
	.drag-handle span { width: 12px; height: 18px; background: radial-gradient(circle, currentColor 1.3px, transparent 1.5px) 0 0 / 6px 6px; opacity: .62; }
	.drag-handle:hover:not(:disabled) { color: var(--admin-heading); }
	.dnd-shadow { opacity: .34; }
</style>
