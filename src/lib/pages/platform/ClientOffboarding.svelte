<script lang="ts">
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";
const api = getAdminConfig().api.platformOffboarding;
if (!api) throw new Error("Offboarding is not configured");
const actions = api;
let { clientId }: { clientId: string } = $props();
const client = useAdminClient();
const result = useQuery(actions.getState, () => ({ clientId }));
type State = { siteUrl: string; isCreator: boolean; offboarding: null | { retainUntil: number; erasureRequestedAt?: number } };
let clientState = $derived(result.data as State | undefined);
let confirmation = $state("");
let immediate = $state(false);
let busy = $state(false);
let message = $state("");
let failure = $state("");
async function act(action: "disable" | "restoreAccess" | "erase") {
 if (busy || !clientState || clientState.isCreator || confirmation !== clientState.siteUrl) return;
 const id = clientId;
 const siteUrl = clientState.siteUrl;
 if (!window.confirm(action === "erase" ? `Permanently erase eligible CRM records for ${siteUrl}? Payment records, accepted quotes and signed contracts remain. Files and content require separate cleanup.` : `${action === "disable" ? "Disable" : "Restore"} the public site and client access for ${siteUrl}?`)) return;
 busy = true; failure = ""; message = "";
 try {
  if (action !== "erase") {
   await client.mutation(actions[action], { clientId: id, confirmSiteUrl: siteUrl });
   message = action === "disable" ? "Public site and client access disabled. Revoke provider credentials and cancel billing separately; existing provider access is not revoked by this action." : "Public site and client access restored. Provider integrations may need separate restoration.";
  } else {
   await client.mutation(actions.requestErasure, { clientId: id, confirmSiteUrl: siteUrl, eraseImmediately: immediate });
   let deleted = 0; let retained = 0;
   for (const collection of ["inquiries", "emailTemplates", "quotePresets", "contractTemplates", "quotes", "contracts", "invoices"]) {
    let cursor: string | null = null;
    let done = false;
    while (!done) {
     const page = await client.mutation(actions.eraseRecords, { clientId: id, confirmSiteUrl: siteUrl, collection, cursor }) as { deleted: number; retained: number; cursor: string; isDone: boolean };
     deleted += page.deleted; retained += page.retained; cursor = page.cursor; done = page.isDone;
    }
   }
   message = `${deleted} eligible records deleted; ${retained} protected records retained. Content, files, client identities, and provider cleanup remain separate steps. Retrying is safe.`;
  }
 } catch (error) { failure = error instanceof Error ? error.message : "Offboarding failed. Refresh and retry."; }
 finally { busy = false; }
}
</script>
{#if clientState && !clientState.isCreator}
<section aria-label="Client offboarding">
 <h3>offboarding</h3>
 <p>{clientState.offboarding ? `Public site offline; client access disabled. Default retention ends ${new Date(clientState.offboarding.retainUntil).toLocaleDateString()}. Nothing is automatically deleted.` : "Take the public site offline immediately and disable this client’s dashboard access and new payment/intake activity. Keep records for 90 days by default."}</p>
 <p>Provider subscriptions, Worker credentials, and issued upload capabilities need separate shutdown. Existing paid orders and audit history remain protected.</p>
 <label>type the site to confirm<input bind:value={confirmation} disabled={busy} placeholder={clientState.siteUrl} autocomplete="off" /></label>
 {#if clientState.offboarding}
  <label class="choice"><input type="checkbox" bind:checked={immediate} disabled={busy} /> erase eligible records before the 90-day period ends</label>
  <button disabled={busy || confirmation !== clientState.siteUrl} onclick={() => void act("erase")}>erase eligible CRM records</button>
  {#if !clientState.offboarding.erasureRequestedAt}<button disabled={busy || confirmation !== clientState.siteUrl} onclick={() => void act("restoreAccess")}>restore site and client access</button>{/if}
 {:else}
  <button disabled={busy || confirmation !== clientState.siteUrl} onclick={() => void act("disable")}>take site offline and disable access</button>
 {/if}
 {#if busy}<p role="status">Working. Keep this dialog open; interrupted cleanup can be retried.</p>{/if}
 {#if failure}<p role="alert">{failure}</p>{/if}
 {#if message}<p role="status">{message}</p>{/if}
</section>
{:else if result.error}<p role="alert">Offboarding status could not be loaded.</p>{/if}
<style>
section { margin-top: 24px; border-top: 1px solid var(--admin-border); padding-top: 16px; color: var(--admin-text-muted); }
h3 { color: var(--admin-text); font-size: 1rem; }
p { font-size: .8rem; line-height: 1.6; }
label { display: grid; gap: 8px; font-size: .8rem; margin: 12px 0; }
input:not([type="checkbox"]), button { min-height: 44px; padding: 10px; border: 1px solid var(--admin-border); background: var(--admin-bg); color: var(--admin-text); font: inherit; max-width: 100%; }
.choice { display: flex; align-items: center; min-height: 44px; }
button { cursor: pointer; margin: 4px 8px 4px 0; font-size: .8rem; }
button:disabled { opacity: .5; cursor: default; }
</style>
