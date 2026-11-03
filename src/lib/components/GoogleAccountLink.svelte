<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { page } from "$app/stores";
import type { AdminAuthClient } from "../config";
import { modalLifecycle } from "../modalLifecycle";
import { addToast } from "../toast";

type Props = {
	listAccounts: NonNullable<AdminAuthClient["listAccounts"]>;
	linkSocial: NonNullable<AdminAuthClient["linkSocial"]>;
	callbackURL: string;
	gmail?: { endpoint: string };
	loginEmail?: string;
};

let { listAccounts, linkSocial, callbackURL, gmail, loginEmail }: Props = $props();
let optionsOpen = $state(false);
let dialog = $state<HTMLDialogElement>();
let includeGmail = $state(false);
let gmailChecking = $state(false);
let gmailReadGeneration = 0;
let gmailConfigured = $state(false);
let gmailError = $state("");
let consentNotice = $state("");
let mailbox = $state<{ address: string; status: string; lastSyncAt: number | null; problem: string | null } | null>(null);
const gmailScopes = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"];
$effect(() => { if (optionsOpen && dialog && !dialog.open) dialog.showModal(); });
async function readGmail() {
	if (!gmail) return;
	const generation = ++gmailReadGeneration;
	gmailChecking = true; gmailError = "";
	try {
		const response = await fetch(`${gmail.endpoint}/status`);
		const data = await response.json();
		if (!active || generation !== gmailReadGeneration) return;
		if (!response.ok || typeof data.configured !== "boolean") throw new Error();
		gmailConfigured = data.configured; mailbox = data.mailbox ?? null;
	} catch { if (active && generation === gmailReadGeneration) gmailError = "Gmail status is unavailable. Google sign-in still works; retry this check."; }
	finally { if (active && generation === gmailReadGeneration) gmailChecking = false; }
}
function openOptions() { optionsOpen = true; void readGmail(); }
async function stopSync() {
	if (!gmail || gmailChecking || !confirm("Stop Gmail synchronization for this site? Saved conversations remain. This does not unlink Google sign-in or revoke Google’s provider grant.")) return;
	gmailReadGeneration++; gmailChecking = true;
	try { const response = await fetch(`${gmail.endpoint}/disconnect`, { method: "POST" }); if (!response.ok) throw new Error(); await readGmail(); }
	catch { gmailError = "Could not stop synchronization. Retry this action."; }
	finally { gmailChecking = false; }
}
let status = $state<"checking" | "linked" | "unlinked" | "unavailable" | "opening">("checking");
let active = true;
let readGeneration = 0;
onDestroy(() => { active = false; });

function callbackMessage(code: string | null) {
	if (code === "access_denied") return "google connection canceled. you can try again.";
	if (code === "email_doesn't_match") return "use the google account with the same email as your admin login.";
	if (code === "account_already_linked_to_different_user") return "this google account is connected to another login. contact your administrator.";
	return "google wasn't connected. try again.";
}

async function checkConnection(returnedError?: string) {
	const generation = ++readGeneration;
	status = "checking";
	try {
		const result = await listAccounts();
		if (!active || generation !== readGeneration) return;
		if (result.error || !Array.isArray(result.data)) {
			status = "unavailable";
			return;
		}
		status = result.data.some(account => account.providerId === "google") ? "linked" : "unlinked";
		if (status === "unlinked" && returnedError) addToast(returnedError);
	} catch {
		if (active && generation === readGeneration) status = "unavailable";
	}
}

onMount(() => {
	const openGoogle = () => { if (gmail) openOptions(); };
	window.addEventListener("admin:google-connections", openGoogle);
	const result = $page.url.searchParams.get("gmail");
	if (gmail && ["partial_consent", "connection_failed"].includes(result ?? "")) {
		consentNotice = result === "partial_consent" ? "The Gmail permission request was incomplete: read, send and offline access are required. Your admin sign-in remains usable. Current mailbox status is shown below." : "Gmail connection was canceled or failed. Your admin sign-in remains usable; try connecting Gmail again.";
		openOptions();
	}
	const returnedError = $page.url.searchParams.get("google_link") === "error"
		? callbackMessage($page.url.searchParams.get("error")) : undefined;
	void checkConnection(returnedError);
	const restore = (event: PageTransitionEvent) => {
		if (event.persisted) void checkConnection();
	};
	window.addEventListener("pageshow", restore);
	return () => { window.removeEventListener("pageshow", restore); window.removeEventListener("admin:google-connections", openGoogle); };
});

async function connect(enableGmail = false) {
	if (status === "opening" || (status !== "unlinked" && !(enableGmail && status === "linked"))) return;
	const previousStatus = status;
	status = "opening";
	try {
		const callback = new URL(callbackURL, window.location.href);
		const errorCallback = new URL(callback);
		errorCallback.searchParams.set("google_link", "error");
		let callbackHref = callback.href, errorCallbackHref = errorCallback.href;
		if (enableGmail) {
			if (!gmail || !gmailConfigured) throw new Error("Gmail unavailable");
			const response = await fetch(`${gmail.endpoint}/link-intent`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ returnTo: $page.url.pathname + $page.url.search }) });
			const intent = await response.json();
			if (!response.ok || typeof intent.callbackURL !== "string" || typeof intent.errorCallbackURL !== "string") throw new Error("Gmail consent unavailable");
			const complete = new URL(intent.callbackURL), failed = new URL(intent.errorCallbackURL);
			if (complete.origin !== window.location.origin || failed.origin !== window.location.origin || complete.pathname !== "/admin/google-connection" || failed.pathname !== "/admin/google-connection") throw new Error("Invalid Gmail callback");
			callbackHref = complete.href; errorCallbackHref = failed.href;
		}
		if (!active) return;
		const result = await linkSocial({
			provider: "google",
			callbackURL: callbackHref,
			errorCallbackURL: errorCallbackHref,
			...(enableGmail ? { scopes: gmailScopes } : {}),
			disableRedirect: true,
		});
		if (!active) return;
		if (result.error || !result.data?.url) throw new Error("Google link request failed");
		const destination = new URL(result.data.url);
		if (destination.protocol !== "https:" || destination.hostname !== "accounts.google.com"
			|| destination.port || destination.username || destination.password) {
			throw new Error("Unexpected Google authorization destination");
		}
		// Explicit linking must let the person choose the matching Google account.
		const prompts = new Set((destination.searchParams.get("prompt") ?? "").split(/\s+/).filter(value => value && value !== "none"));
		prompts.add("select_account");
		if (enableGmail) { prompts.add("consent"); destination.searchParams.set("access_type", "offline"); destination.searchParams.set("include_granted_scopes", "true"); }
		destination.searchParams.set("prompt", [...prompts].join(" "));
		window.location.assign(destination.href);
	} catch {
		if (!active) return;
		status = previousStatus;
		addToast("couldn't open google. try again.");
	}
}
</script>

{#if gmail || status === "unlinked" || status === "opening" || status === "unavailable"}
	<button
		type="button"
		class="theme-toggle google-link"
		disabled={status === "opening"}
		aria-label={gmail && status === "linked" ? "google connections" : status === "unavailable" ? "retry google connection check" : "connect google"}
		title={status === "unavailable" ? "couldn't check google connection. try again." : "connect google"}
		onclick={() => gmail ? openOptions() : status === "unavailable" ? checkConnection() : connect()}
	>
			<svg class="nav-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
			</svg>
		<span>
			{status === "opening" ? "opening google…" : gmail && status === "linked" ? "google connections" : status === "unavailable" ? "retry google check" : "connect google"}
		</span>
	</button>
{/if}


{#if gmail && optionsOpen}
 <dialog use:modalLifecycle={() => dialog?.close()} bind:this={dialog} onclose={() => { optionsOpen = false; }} aria-labelledby="google-connections-heading">
  <div class="connections">
   <header><h2 id="google-connections-heading">google connection</h2><button type="button" class="close" aria-label="Close Google connections" onclick={() => dialog?.close()}>close</button></header>
   <section aria-label="Admin sign-in">
    <h3>admin sign-in</h3>
    <p>{status === "linked" ? "Google is linked to your admin login." : status === "checking" ? "Checking your Google sign-in…" : status === "unavailable" ? "Google sign-in status could not be checked." : "Add Google as a way to sign in."} {loginEmail ?? ""}</p>
    {#if status === "unavailable"}<button type="button" onclick={() => checkConnection()}>retry sign-in check</button>{/if}
    {#if status === "unlinked" || status === "opening"}
     <label class="optional"><input type="checkbox" bind:checked={includeGmail} disabled={!gmailConfigured || gmailChecking || status === "opening"} /> also enable Gmail conversations for this account</label>
     <button type="button" disabled={status === "opening"} onclick={() => connect(includeGmail)}>{status === "opening" ? "opening google…" : "connect google sign-in"}</button>
    {/if}
   </section>
   <section aria-label="Gmail conversations">
    <h3>gmail conversations</h3>
    <p>Gmail access is optional. Linked conversations are shared with authorized site administrators. Mail is rendered as plain text; it never triggers privileged actions.</p>
    <p>Pilot retention is 30 days per imported conversation, including drafts and cached files. Unresolved sends hold deletion. Export and deletion controls are in correspondence; stopping sync alone does not erase data.</p>
    {#if consentNotice}<p role="alert">{consentNotice}</p>{/if}
    {#if gmailChecking}<p role="status">checking Gmail…</p>
    {:else if gmailError}<p role="alert">{gmailError}</p><button type="button" onclick={readGmail}>retry Gmail check</button>
    {:else if !gmailConfigured}<p>Gmail setup is not available yet. Google sign-in does not need Gmail permission.</p>
    {:else}
     {#if mailbox && mailbox.status !== "disconnected"}
      <p><strong>{mailbox.address}</strong> · {mailbox.status === "reconnect" ? "reconnect required" : "connected"}</p>
      <p>{mailbox.lastSyncAt ? `last synced ${new Date(mailbox.lastSyncAt).toLocaleString()}` : "waiting for the first sync"}</p>
      {#if mailbox.problem}<p role="status">{mailbox.problem}</p>{/if}
     {:else}<p>Gmail is optional. Read and send relevant conversations from inquiries and CRM.</p>{/if}
     <p class="hint">Google grants mailbox-wide read access. Admin imports only conversations explicitly linked to records. This is separate from Google sign-in.</p>
     {#if status === "linked" && (!mailbox || mailbox.address.toLowerCase() === loginEmail?.toLowerCase())}<button type="button" onclick={() => connect(true)}>{mailbox ? "reconnect Gmail for my sign-in account" : "enable Gmail for my sign-in account"}</button>{/if}
     {#if mailbox && mailbox.address.toLowerCase() !== loginEmail?.toLowerCase()}<p class="hint">Reconnect {mailbox.address} below. Changing the site’s connected mailbox requires a separate reviewed migration.</p>{/if}
     {#if !mailbox || status !== "linked" || mailbox.address.toLowerCase() !== loginEmail?.toLowerCase()}<form method="POST" action={`${gmail.endpoint}/connect`}>
      <input type="hidden" name="returnTo" value={$page.url.pathname + $page.url.search} />
      <button type="submit">{mailbox ? `reconnect ${mailbox.address}` : "connect a separate business Gmail"}</button>
     </form>{/if}
     <p class="hint">A separate mailbox never becomes a sign-in method or gains site access. Choose and consent directly at Google; no password or client setup file is shared.</p>
     {#if mailbox && mailbox.status !== "disconnected"}<button type="button" onclick={stopSync}>stop Gmail synchronization</button>{/if}
     <p class="hint">Stopping sync keeps Google sign-in. Unlinking sign-in and revoking Google's provider grant are different actions. Revoking combined Google access may affect both; keep another sign-in method available.</p>
    {/if}
   </section>
  </div>
 </dialog>
{/if}

<style>
	.google-link:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.google-link:disabled { cursor: wait; opacity: 0.6; }
	dialog { width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 40px); padding: 0; border: 1px solid var(--admin-border-strong); background: var(--admin-bg); color: var(--admin-text); font-family: inherit; }
	dialog::backdrop { background: rgba(0, 0, 0, 0.45); }
	.connections { padding: 24px; } header { display: flex; align-items: start; justify-content: space-between; gap: 16px; }
	h2 { font: 500 1.15rem "Chillax", sans-serif; margin: 0; color: var(--admin-heading); } h3 { font-size: 0.95rem; font-weight: 500; margin: 0 0 12px; color: var(--admin-heading); }
	section { border-top: 1px solid var(--admin-border); margin-top: 24px; padding-top: 20px; }
	p { font-size: 0.88rem; line-height: 1.6; overflow-wrap: anywhere; margin: 8px 0; } .hint { color: var(--admin-text-muted); font-size: 0.82rem; }
	.connections button { min-height: 44px; padding: 8px 14px; font: inherit; border: 1px solid var(--admin-border-strong); background: var(--admin-surface-raised); color: var(--admin-text); cursor: pointer; margin-block: 6px; text-align: left; }
	.connections button:hover:not(:disabled) { background: var(--admin-active); } .connections button:focus-visible, input:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 3px; } .connections button:disabled { opacity: 0.6; cursor: wait; }
	.optional { display: flex; align-items: start; gap: 10px; font-size: 0.88rem; line-height: 1.5; margin: 16px 0; } input[type="checkbox"] { margin-top: 4px; accent-color: var(--admin-accent); }
	.connections .close { background: transparent; border-color: transparent; margin: -8px -8px 0 0; }
	@media (max-width: 600px) { .connections { padding: 20px; } .connections form button { width: 100%; } }
</style>
