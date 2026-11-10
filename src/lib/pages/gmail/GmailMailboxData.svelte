<script lang="ts">
import { useQuery } from "convex-svelte";
import { getAdminConfig } from "../../config";
import { useAdminClient } from "../../adminClient";
import type { GmailMailbox } from "./types";
let { mailbox }: { mailbox: GmailMailbox | null | undefined } = $props();
const config = getAdminConfig(), api = config.api.gmailConversations!, client = useAdminClient();
const query = api.dataStatus ? useQuery(api.dataStatus, () => ({siteUrl: config.siteUrl})) : null;
const status = $derived(query?.data as {hasData: boolean; holds: {conversationId: string; status: string}[]; deleting: boolean; lastDeletedAt: number | null} | undefined);
let address = $state(""), busy = $state(false), error = $state("");
async function remove() {
 if (!api.deleteMailboxData || busy || address !== mailbox?.address) return;
 busy = true; error = "";
 try { await client.mutation(api.deleteMailboxData, {siteUrl: config.siteUrl, confirmAddress: address}); address = ""; }
 catch { error = "Data deletion could not start. Stop synchronization and resolve any outstanding send first, then retry. Nothing was resent or discarded."; }
 finally { busy = false; }
}
</script>
{#if api.dataStatus && api.deleteMailboxData}
<details class="data-controls">
 <summary>Gmail data and offboarding</summary>
 <p>Imported conversations are kept for at most 30 days from creation in this app; later replies do not restart that period. This includes messages, drafts, cached attachments and resolved send records. Unresolved sends hold cleanup until reconciliation.</p>
 <p>Open each conversation to export its text and send evidence and download private attachment originals. Other administrators' private drafts are excluded from your export.</p>
 <p>To remove all imported Gmail data for this site, stop synchronization using Google connection first. Then type the mailbox address below. Deletion includes every administrator's Gmail drafts and cached files. Original Gmail mail, ordinary Google sign-in, and Google's access grant are managed separately. The mailbox/site ownership registry remains to prevent reassignment.</p>
 <button type="button" onclick={() => window.dispatchEvent(new CustomEvent("admin:google-connections"))}>manage Google connection</button>
 {#if query?.error}<p role="alert">Data status is unavailable. Reopen this page before requesting deletion.</p>
 {:else if !status}<p role="status">checking imported data…</p>
 {:else}
  {#if status.holds.length}<p role="status">Deletion is on hold for {status.holds.map(a => a.status).join(", ")} sends. Reconcile them from their conversations. Absence from Sent alone does not prove non-delivery.</p>{/if}
  {#if status.deleting}<p role="status">Deleting imported data in resumable batches. Reconnection is paused until cleanup completes.</p>
  {:else if !status.hasData}<p role="status">No imported Gmail conversations remain.{status.lastDeletedAt ? ` Cleanup confirmed ${new Date(status.lastDeletedAt).toLocaleString()}.` : ""}</p>
  {:else}<label for="gmail-delete-address">confirm mailbox address<input id="gmail-delete-address" type="email" autocomplete="off" bind:value={address} placeholder={mailbox?.address} /></label>
   <button type="button" disabled={busy || mailbox?.status !== "disconnected" || address !== mailbox?.address || status.holds.length > 0} onclick={remove}>delete all imported Gmail data</button>
  {/if}
 {/if}
 {#if error}<p role="alert">{error}</p>{/if}
</details>
{/if}
<style>
.data-controls { margin-top: 32px; padding-block: 16px; border-top: 1px solid var(--admin-border); }
summary { cursor: pointer; padding-block: 8px; font-size: .9rem; }
p { max-width: 80ch; color: var(--admin-text-muted); font-size: .84rem; line-height: 1.6; overflow-wrap: anywhere; }
label { display: block; font-size: .84rem; margin-block: 16px; }
input { display: block; box-sizing: border-box; max-width: 100%; width: 360px; padding: 10px; margin-top: 8px; min-height: 44px; border: 1px solid var(--admin-border-strong); background: var(--admin-bg); color: var(--admin-text); font: inherit; }
button { min-height: 44px; padding: 8px 12px; font: inherit; font-size: .84rem; border: 1px solid var(--admin-border-strong); background: transparent; color: var(--admin-text); cursor: pointer; }
button:disabled { opacity: .55; cursor: not-allowed; }
summary:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 3px; }
</style>
