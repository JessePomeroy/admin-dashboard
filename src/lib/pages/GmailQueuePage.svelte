<script lang="ts">
import { usePaginatedQuery, useQuery } from "convex-svelte";
import { getAdminConfig } from "../config";
import type { GmailMailbox, GmailWorkflow } from "./gmail/types";
import GmailMailboxData from "./gmail/GmailMailboxData.svelte";
interface QueueRow { _id: string; subject: string; recipient: string; inquiryId?: string; clientId?: string;
 state: GmailWorkflow; followUpAt: number | null; problem: string | null; importPending: boolean; retentionHold: boolean;
 incoming: {text: string; date: number; from: string} | null }
const config = getAdminConfig(), api = config.api.gmailConversations;
let state = $state<GmailWorkflow | "all">("needs_reply");
const labels = {review: "review needed", needs_reply: "needs reply", waiting: "waiting", done: "done / no reply needed", all: "all conversations"};
const query = api?.queue ? usePaginatedQuery(api.queue, () => ({siteUrl: config.siteUrl, ...(state === "all" ? {} : {state})}), {initialNumItems: 25}) : null;
const connection = api ? useQuery(api.connection, () => ({siteUrl: config.siteUrl})) : null;
const mailbox = $derived((connection?.data as {mailbox: GmailMailbox | null} | undefined)?.mailbox);
const rows = $derived((query?.results ?? []) as QueueRow[]);
function filter(value: string) { state = value === "all" || value === "review" || value === "waiting" || value === "done" ? value : "needs_reply"; }
function destination(row: QueueRow) {
 const path = row.inquiryId ? `/admin/inquiries?open=${encodeURIComponent(row.inquiryId)}` : `/admin/crm?client=${encodeURIComponent(row.clientId ?? "")}`;
 return `${path}&conversation=${encodeURIComponent(row._id)}`;
}
</script>
<section class="admin-page gmail-queue">
 <header class="page-header"><h1>correspondence</h1><button type="button" onclick={() => window.dispatchEvent(new CustomEvent("admin:google-connections"))}>Google connection</button></header>
 <p class="intro">Review incoming Gmail conversations and choose what needs a reply. Platform chat stays in messages.</p>
 {#if !query}<p role="status">The correspondence queue is not enabled for this host.</p>
 {:else}
  <div class="filter"><label for="gmail-queue-filter">show</label><select id="gmail-queue-filter" value={state} onchange={event => filter(event.currentTarget.value)}>{#each Object.entries(labels) as [key, label] (key)}<option value={key}>{label}</option>{/each}</select></div>
  {#if query.error}<p role="alert">The queue could not load. Reopen this page to retry.</p>
  {:else if query.status === "LoadingFirstPage"}<p role="status">loading correspondence…</p>
  {:else if !rows.length}<p role="status">No conversations marked {labels[state]}. New incoming messages appear under review needed.</p>{/if}
  <ul class="queue">{#each rows as row (row._id)}<li>
   <div class="row-heading"><a href={destination(row)}>{row.subject}</a><span class="state">{labels[row.state]}</span></div>
   <p class="recipient">{row.recipient} · {row.inquiryId ? "inquiry" : "client"}</p>
   {#if row.incoming}<p class="incoming">{row.incoming.text}</p><p class="date">Latest relevant incoming · {new Date(row.incoming.date).toLocaleString()}</p>
   {:else}<p class="date">No relevant incoming message has been imported.</p>{/if}
   {#if row.followUpAt}<p class="follow-up">Follow up {new Date(row.followUpAt).toLocaleDateString()}</p>{/if}
   {#if row.problem || row.importPending || row.retentionHold}<p class="problem">{row.problem ?? (row.retentionHold ? "Retention ended; an unresolved send is holding deletion." : "Import is incomplete; sending is paused.")}</p>{/if}
   <a class="record-link" href={destination(row)}>open {row.inquiryId ? "inquiry" : "client"} conversation</a>
  </li>{/each}</ul>
  {#if query.status === "CanLoadMore"}<button type="button" onclick={() => query.loadMore(25)}>load more conversations</button>{/if}
  {#if query.status === "LoadingMore"}<p role="status">loading more conversations…</p>{/if}
 {/if}
 {#if api && config.gmail}<GmailMailboxData {mailbox} />{/if}
</section>
<style>
.gmail-queue { color: var(--admin-text); }
.page-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.intro { color: var(--admin-text-muted); font-size: .9rem; line-height: 1.6; max-width: 70ch; }
.filter { display: flex; align-items: center; gap: 12px; font-size: .85rem; margin-block: 24px; }
select { min-height: 44px; padding: 8px 12px; max-width: 100%; color: var(--admin-text); background: var(--admin-bg); border: 1px solid var(--admin-border-strong); font: inherit; }
.queue { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--admin-border); }
.queue li { border-bottom: 1px solid var(--admin-border); padding-block: 24px; min-width: 0; }
.row-heading { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
a { color: var(--admin-accent); text-underline-offset: 3px; overflow-wrap: anywhere; }
.row-heading a { font-size: 1rem; text-transform: none; }
.state, .date, .recipient { font-size: .8rem; color: var(--admin-text-muted); line-height: 1.6; overflow-wrap: anywhere; }
.incoming { max-width: 80ch; font-size: .9rem; line-height: 1.7; text-transform: none; white-space: pre-wrap; overflow-wrap: anywhere; }
.follow-up, .problem, .record-link { font-size: .84rem; line-height: 1.6; }
button { min-height: 44px; padding: 8px 12px; border: 1px solid var(--admin-border-strong); color: var(--admin-text); background: transparent; font: inherit; font-size: .84rem; cursor: pointer; }
a:focus-visible, button:focus-visible, select:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 3px; }
@media (max-width: 600px) { .incoming, select { font-size: 1rem; } }
</style>
