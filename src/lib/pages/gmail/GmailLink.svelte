<script lang="ts">
import { onDestroy } from "svelte";
interface Preview {
 threadId: string; subject: string; participants: string[]; messageCount: number; blocked: boolean;
 mailbox: string; destination: string; recipient: string; token: string | null;
}
let { endpoint, inquiryId, clientId, onlinked }: { endpoint: string; inquiryId?: string; clientId?: string; onlinked: (id: string) => void } = $props();
let search = $state(""), busy = $state(false), error = $state(""), more = $state(false), searched = $state(false);
let results = $state<{id: string; summary: string}[]>([]), preview = $state<Preview | null>(null), acknowledged = $state(false);
let request: AbortController | undefined, active = true;
const record = () => inquiryId ? { inquiryId } : { clientId };
function object(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
async function post(fields: Record<string, unknown>) {
 request?.abort(); request = new AbortController();
 const response = await fetch(`${endpoint}/threads`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({...record(), ...fields}), signal: request.signal });
 const value: unknown = await response.json();
 if (!object(value)) throw new Error("The Gmail selection response was invalid. Preview again.");
 if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : "Could not complete this selection.");
 return value;
}
async function find() {
 busy = true; error = ""; preview = null; results = []; searched = false;
 try {
  const value = await post({operation: "search", search});
  if (!Array.isArray(value.threads)) throw new Error("Search is unavailable. Retry.");
  const rows = value.threads.map((row: unknown) => {
   if (!object(row) || typeof row.id !== "string" || typeof row.summary !== "string") throw new Error("Search is unavailable. Retry.");
   return {id: row.id, summary: row.summary};
  });
  if (active) { results = rows; more = value.more === true; searched = true; }
 } catch (cause) { if (active) error = cause instanceof Error ? cause.message : "Search failed."; }
 finally { if (active) busy = false; }
}
async function inspect(threadId: string) {
 busy = true; error = ""; preview = null; acknowledged = false;
 try {
  const value = await post({operation: "preview", threadId});
  if (typeof value.threadId !== "string" || typeof value.subject !== "string" || !Array.isArray(value.participants) || !value.participants.every((p: unknown) => typeof p === "string") ||
      typeof value.messageCount !== "number" || typeof value.blocked !== "boolean" || typeof value.mailbox !== "string" || typeof value.destination !== "string" || typeof value.recipient !== "string" || !(value.token === null || typeof value.token === "string")) throw new Error("Preview is unavailable. Search again.");
  if (active) preview = {threadId: value.threadId, subject: value.subject, participants: value.participants, messageCount: value.messageCount, blocked: value.blocked,
   mailbox: value.mailbox, destination: value.destination, recipient: value.recipient, token: value.token};
 } catch (cause) { if (active) error = cause instanceof Error ? cause.message : "Preview failed."; }
 finally { if (active) busy = false; }
}
async function link() {
 if (!preview?.token || preview.blocked || !acknowledged || busy) return;
 busy = true; error = "";
 try {
  const value = await post({operation: "confirm", token: preview.token});
  if (typeof value.conversationId !== "string") throw new Error("Link was not confirmed. Preview again; a retry cannot create a second association.");
  if (active) onlinked(value.conversationId);
 } catch (cause) { if (active) error = cause instanceof Error ? cause.message : "Link was not confirmed. Preview again before retrying."; }
 finally { if (active) busy = false; }
}
onDestroy(() => { active = false; request?.abort(); });
</script>
<div class="link-picker" aria-label="Link an existing Gmail conversation">
 <p>Search only when you want to link a conversation to this record. Up to 10 results are shown; no inbox import occurs.</p>
 <form onsubmit={event => { event.preventDefault(); void find(); }}>
  <label for="gmail-thread-search">specific Gmail search</label>
  <div class="search"><input id="gmail-thread-search" bind:value={search} minlength="3" maxlength="120" placeholder="a distinctive subject or address" required /><button disabled={busy}>search conversations</button></div>
 </form>
 {#if searched && !results.length}<p role="status">No matching conversations. Try a more specific search.</p>{/if}
 {#if more}<p>Only the first 10 matches are shown. Refine your search to find the intended conversation.</p>{/if}
 <ul>{#each results as row (row.id)}<li><p>{row.summary}</p><button type="button" disabled={busy} onclick={() => inspect(row.id)}>preview conversation <span class="identifier">{row.id}</span></button></li>{/each}</ul>
 {#if preview}
  <section aria-label="Confirm conversation association">
   <h4>{preview.subject}</h4>
   <dl><dt>mailbox</dt><dd>{preview.mailbox}</dd><dt>participants</dt><dd>{preview.participants.join(", ") || "could not verify"}</dd><dt>destination</dt><dd>{preview.destination} · {preview.recipient}</dd></dl>
   <p>Import {preview.messageCount} existing messages from this thread, plus future incoming and Sent replies. Native Gmail drafts are excluded. Only plain text and supported private attachments are available here; unsupported content remains in Gmail.</p>
   <p>Pilot retention: this imported conversation and its drafts expire 30 days after linking. Unresolved sends place deletion on hold. Other mailbox conversations remain unlinked.</p>
   {#if preview.blocked}<p role="alert">This conversation has unexpected participants or ambiguous headers. It cannot be linked to this record. Review it in Gmail; no content has been imported.</p>
   {:else}<label class="confirm"><input type="checkbox" bind:checked={acknowledged} />I checked the participants, destination, and import scope.</label><button type="button" disabled={busy || !acknowledged} onclick={link}>{busy ? "linking…" : "link this conversation"}</button>{/if}
  </section>
 {/if}
 {#if busy}<p role="status">checking Gmail…</p>{/if}
 {#if error}<p role="alert">{error}</p>{/if}
</div>
<style>
.link-picker { margin-top: 16px; padding: 16px; border: 1px solid var(--admin-border); background: var(--admin-surface-raised); min-width: 0; }
p, dl { font-size: .84rem; line-height: 1.6; overflow-wrap: anywhere; }
h4 { font-size: .95rem; font-weight: 500; text-transform: none; overflow-wrap: anywhere; }
label { display: block; font-size: .82rem; margin-bottom: 8px; }
.search { display: flex; flex-wrap: wrap; gap: 8px; }
input:not([type="checkbox"]) { flex: 1; min-width: 0; min-height: 44px; padding: 8px; border: 1px solid var(--admin-border-strong); background: var(--admin-bg); color: var(--admin-text); font: inherit; box-sizing: border-box; }
button { min-height: 44px; padding: 8px 12px; font: inherit; font-size: .82rem; border: 1px solid var(--admin-border-strong); background: transparent; color: var(--admin-text); cursor: pointer; }
button:disabled { opacity: .6; cursor: not-allowed; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 3px; }
ul { list-style: none; padding: 0; } li { padding-block: 12px; border-bottom: 1px solid var(--admin-border); }
dt { color: var(--admin-text-muted); } dd { margin: 0 0 8px; text-transform: none; }
.confirm { display: flex; align-items: center; gap: 8px; min-height: 44px; margin-block: 12px; }
.identifier { display: block; font-size: .7rem; overflow-wrap: anywhere; color: var(--admin-text-muted); }
@media(max-width: 600px) { .search { display: grid; grid-template-columns: 1fr; } .link-picker { padding: 12px; } input:not([type="checkbox"]) { font-size: 1rem; } }
</style>
