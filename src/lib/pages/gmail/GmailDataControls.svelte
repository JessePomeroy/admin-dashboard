<script lang="ts">
import { getAdminConfig } from "../../config";
import { useAdminClient } from "../../adminClient";
let { conversationId, blocked, expiresAt, onremoved }: { conversationId: string; blocked: boolean; expiresAt?: number; onremoved: () => void } = $props();
const config = getAdminConfig(), client = useAdminClient();
let confirm = $state(false), busy = $state(false), problem = $state("");
async function download() {
 busy = true; problem = "";
 try {
  const response = await fetch(`${config.gmail!.endpoint}/export/${encodeURIComponent(conversationId)}`, {cache: "no-store"});
  if (!response.ok) throw new Error("Export did not complete. Retry after synchronization; larger exports need the paginated operator procedure.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a"); link.href = url; link.download = "gmail-conversation.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
 } catch (cause) { problem = cause instanceof Error ? cause.message : "Export could not complete."; }
 finally { busy = false; }
}
async function remove() {
 if (!confirm || blocked || !config.api.gmailConversations?.requestDeletion) return;
 busy = true; problem = "";
 try { await client.mutation(config.api.gmailConversations.requestDeletion, {conversationId, confirm: "delete imported conversation"}); onremoved(); }
 catch { problem = "Deletion could not start. Check for an unresolved send, then retry. Existing evidence is retained."; }
 finally { busy = false; }
}
</script>
<details>
 <summary>export and delete imported data</summary>
 <p>Pilot retention: this conversation, drafts, attachments, and resolved send records {expiresAt ? `expire ${new Date(expiresAt).toLocaleString()}` : "expire after 30 days"}. Unresolved sends hold deletion until safely resolved.</p>
 <button type="button" disabled={busy} onclick={download}>export conversation JSON</button>
 <p>The export includes imported text, your saved draft, send evidence, and attachment metadata. Download attachment originals separately above. It excludes other administrators' private drafts and all credentials.</p>
 <p>Deletion removes this imported conversation, every administrator's associated drafts, private cached files, and resolved send records. The Gmail originals, Google sign-in, provider grant, and other conversations remain. Export first if you need a copy.</p>
 {#if blocked}<p role="status">Deletion is paused while a send is unresolved or this reply has unsaved work. Save or download unfinished work; checking Gmail Sent never resends a reply.</p>{/if}
 <label><input type="checkbox" bind:checked={confirm} disabled={blocked || busy} />I want to delete this imported conversation and its associated drafts and files.</label>
 <button type="button" disabled={!confirm || blocked || busy || !config.api.gmailConversations?.requestDeletion} onclick={remove}>delete imported conversation</button>
 {#if problem}<p role="alert">{problem}</p>{/if}
</details>
<style>
details { margin-top: 24px; border-top: 1px solid var(--admin-border); padding-block: 12px; }
summary { cursor: pointer; padding-block: 10px; font-size: .84rem; }
p { font-size: .8rem; line-height: 1.6; color: var(--admin-text-muted); overflow-wrap: anywhere; }
label { display: flex; align-items: flex-start; gap: 8px; font-size: .82rem; line-height: 1.6; margin-block: 16px; }
button { min-height: 44px; padding: 8px 12px; border: 1px solid var(--admin-border-strong); background: transparent; color: var(--admin-text); font: inherit; font-size: .82rem; cursor: pointer; }
button:disabled { opacity: .55; cursor: not-allowed; }
summary:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 3px; }
</style>
