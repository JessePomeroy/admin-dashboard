<script lang="ts">
import { usePaginatedQuery, useQuery } from "convex-svelte";
import { getAdminConfig } from "../../config";
import { useAdminClient } from "../../adminClient";
import type { GmailConversation, GmailMailbox } from "./types";
import GmailThread from "./GmailThread.svelte";
import GmailLink from "./GmailLink.svelte";
import { page } from "$app/stores";
let { inquiryId, clientId, ondirty = () => {} }: { inquiryId?: string; clientId?: string; ondirty?: (dirty: boolean) => void } = $props();
const config = getAdminConfig(), api = config.api.gmailConversations!, client = useAdminClient();
const connection = useQuery(api.connection, () => ({ siteUrl: config.siteUrl }));
const list = usePaginatedQuery(api.list, () => inquiryId ? { inquiryId } : { clientId }, { initialNumItems: 25 });
const mailbox = $derived((connection.data as { mailbox: GmailMailbox | null } | undefined)?.mailbox);
const conversations = $derived(list.results as GmailConversation[]);
let linking = $state(false);
let selected = $state<string | null>($page.url.searchParams.get("conversation")), creating = $state(false), error = $state(""), dirty = $state(false);
$effect(() => { ondirty(dirty); });
function choose(id: string) {
	if (dirty && !confirm("This reply has unsaved changes. Leave it without saving?")) return;
	selected = id; dirty = false;
}
async function create() {
	if (creating) return;
	creating = true; error = "";
	try { const id = await client.mutation(api.create, inquiryId ? { inquiryId } : { clientId }); choose(id); }
	catch { error = "Could not open a conversation. Check the record email and Gmail connection, then retry."; }
	finally { creating = false; }
}
function manageConnection() { window.dispatchEvent(new CustomEvent("admin:google-connections")); }
</script>
<section class="gmail-conversations" aria-label="Gmail conversations">
 <header><h3>gmail conversations</h3><button type="button" onclick={manageConnection}>google connection</button></header>
 {#if connection.error || list.error}
  <p role="alert">Gmail conversations are unavailable. Reopen this record to retry.</p>
 {:else if connection.isLoading}<p role="status">loading Gmail connection…</p>
 {:else if !mailbox || mailbox.status !== "connected"}
  <p>{mailbox?.status === "reconnect" ? "Gmail needs to be reconnected. Saved conversations and drafts are retained." : "Connect a Gmail mailbox to reply here and keep replies from Gmail in this conversation."}</p>
 {:else}<p class="hint">{mailbox.address} · {mailbox.recovering ? "recovering conversation history" : mailbox.problem ?? "updates automatically"}</p>{/if}
 {#if conversations.length}
  <label for={`gmail-conversation-${inquiryId ?? clientId}`}>conversation</label>
  <select id={`gmail-conversation-${inquiryId ?? clientId}`} value={selected ?? ""} onchange={e => {
   choose(e.currentTarget.value);
   // The native picker changes before confirmation; keep it on the accepted conversation.
   e.currentTarget.value = selected ?? "";
  }}>
   <option value="">choose a conversation</option>
   {#each conversations as c (c._id)}<option value={c._id}>{c.subject} · {c.recipient}</option>{/each}
  </select>
  {#if list.status === "CanLoadMore"}<button type="button" onclick={() => list.loadMore(25)}>load more conversations</button>{/if}
 {/if}
 {#if !selected}<button type="button" class="start" disabled={creating || mailbox?.status !== "connected"} onclick={create}>{creating ? "opening conversation…" : "open conversation for this record"}</button>{/if}
 {#if config.gmail?.linking}<button type="button" class="start" disabled={mailbox?.status !== "connected" || dirty} onclick={() => linking = !linking}>{linking ? "close conversation picker" : "link an existing Gmail conversation"}</button>{/if}
 {#if linking && config.gmail}{#key inquiryId ?? clientId}<GmailLink endpoint={config.gmail.endpoint} {inquiryId} {clientId} onlinked={id => { choose(id); linking = false; }} />{/key}{/if}
 {#if error}<p role="alert">{error}</p>{/if}
 {#if selected}{#key selected}<GmailThread conversationId={selected} ondirty={value => { dirty = value; }} onremoved={() => { selected = null; dirty = false; }} />{/key}{/if}
</section>
<style>
.gmail-conversations { border-top: 1px solid var(--admin-border); margin-top: 28px; padding-top: 24px; color: var(--admin-text); }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
h3 { font-size: 0.95rem; font-weight: 500; margin: 0; color: var(--admin-heading); }
p { font-size: 0.88rem; line-height: 1.6; margin: 12px 0; overflow-wrap: anywhere; } .hint { color: var(--admin-text-muted); font-size: 0.8rem; }
label { display: block; color: var(--admin-text-muted); font-size: 0.8rem; margin-block: 16px 6px; }
select { width: 100%; min-height: 44px; padding: 9px; background: var(--admin-surface-raised); color: var(--admin-text); border: 1px solid var(--admin-border-strong); font: inherit; }
button { min-height: 44px; padding: 8px 12px; font: inherit; font-size: 0.82rem; border: 1px solid var(--admin-border-strong); color: var(--admin-text); background: transparent; cursor: pointer; }
button:hover:not(:disabled) { background: var(--admin-active); } button:disabled { opacity: 0.6; cursor: not-allowed; } button:focus-visible, select:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 3px; } .start { margin-top: 12px; }
</style>
