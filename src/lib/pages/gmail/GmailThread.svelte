<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { beforeNavigate } from "$app/navigation";
import { usePaginatedQuery, useQuery } from "convex-svelte";
import { getAdminConfig } from "../../config";
import { useAdminClient } from "../../adminClient";
import GmailMessageText from "./GmailMessageText.svelte";
import GmailAttachment from "./GmailAttachment.svelte";
import GmailDataControls from "./GmailDataControls.svelte";
import { gmailMessageUrl } from "./reading";
import type { GmailDetail, GmailFile, GmailMessage, GmailWorkflow } from "./types";
let { conversationId, ondirty = () => {}, onremoved = () => {} }: { conversationId: string; ondirty?: (value: boolean) => void; onremoved?: () => void } = $props();
const config = getAdminConfig(), api = config.api.gmailConversations!, client = useAdminClient(), endpoint = config.gmail!.endpoint;
const detailQuery = useQuery(api.detail, () => ({ conversationId }));
const messagesQuery = usePaginatedQuery(api.messages, () => ({ conversationId }), { initialNumItems: 25 });
const detail = $derived(detailQuery.data as GmailDetail | undefined);
const messages = $derived([...(messagesQuery.results as GmailMessage[])].reverse());
let initialized = $state(false), text = $state(""), files = $state<GmailFile[]>([]), revision = $state(0), saved = $state("");
let saving = $state(false), uploading = $state(false), sending = $state(false), error = $state(""), conflict = $state(false), now = $state(Date.now());
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let picker = $state<HTMLInputElement>();
let retryFile: GmailFile | null = null, active = true;
let requestId: string | null = null;
const fingerprint = (value: string, rows: GmailFile[]) => JSON.stringify([value, rows.map(f => f._id)]);
const dirty = $derived(initialized && fingerprint(text, files) !== saved);
const fileRows = $derived(files.map(f => detail?.draft.attachments.find(s => s._id === f._id) ?? f));
const openAttempt = $derived(Boolean(detail?.attempt && ["queued", "submitting", "uncertain"].includes(detail.attempt.status)));
const stale = $derived(!detail?.mailbox?.lastSyncAt || now - detail.mailbox.lastSyncAt > (detail?.policy.staleAfterMs ?? 120_000));
const canSend = $derived(Boolean(detail && !dirty && !saving && !uploading && !sending && !conflict && !openAttempt && !messagesQuery.error && !detail.recipientChanged && !detail.conversation.problem && !detail.conversation.importPending && !detail.conversation.deletingAt && (!detail.expiresAt || detail.expiresAt > now) && detail.mailbox?.status === "connected" && !detail.mailbox.problem && !detail.mailbox.recovering && !stale && fileRows.every(f => f.status === "ready") && (text.trim() || files.length)));
$effect(() => {
	if (!detail) return;
	if (!initialized || (!dirty && !saving && !uploading && detail.draft.revision > revision)) {
		text = detail.draft.text; files = detail.draft.attachments; revision = detail.draft.revision;
		saved = fingerprint(text, files); initialized = true; conflict = false;
	}
});
$effect(() => { ondirty(dirty || saving || uploading); });
onMount(() => {
	const timer = setInterval(() => { now = Date.now(); }, 15_000);
	function unload(event: BeforeUnloadEvent) { if (dirty || saving || uploading) { event.preventDefault(); event.returnValue = ""; } }
	window.addEventListener("beforeunload", unload);
	return () => { clearInterval(timer); window.removeEventListener("beforeunload", unload); };
});
onDestroy(() => { active = false; clearTimeout(saveTimer); ondirty(false); });
beforeNavigate(navigation => { if ((dirty || saving || uploading) && !confirm("This reply has unsaved work. Stay here to save it or download a copy. Leave without saving?")) navigation.cancel(); });
function edit(value: string) {
	text = value; error = ""; clearTimeout(saveTimer);
	saveTimer = setTimeout(() => { void save(); }, 600);
}
async function save() {
	clearTimeout(saveTimer);
	if (!initialized || saving || uploading || openAttempt || conflict) return false;
	const snapshot = { text, attachmentIds: files.map(f => f._id), expectedRevision: revision, conversationId };
	if (!dirty) return true;
	saving = true; error = "";
	try {
		const next = await client.mutation(api.saveDraft, snapshot);
		if (!active) return true;
		revision = next; saved = JSON.stringify([snapshot.text, snapshot.attachmentIds]);
		return true;
	} catch { if (active) { error = "Could not save this draft. Keep this view open and retry, or download a copy. Another tab may have changed it."; conflict = Boolean(detail && detail.draft.revision !== revision); } return false; }
	finally { if (active) { saving = false; if (dirty && !error) saveTimer = setTimeout(() => { void save(); }, 600); } }
}
async function removeFile(id: string) { files = files.filter(f => f._id !== id); await save(); }
async function selectFile(event: Event) {
	const input = event.currentTarget;
	if (!(input instanceof HTMLInputElement)) return;
	const file = input.files?.[0]; input.value = "";
	if (!file || !detail || uploading || openAttempt) return;
	if (!await save()) return;
	uploading = true; error = "";
	try {
		if (file.size > detail.policy.fileBytes || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) throw new Error("Choose a JPEG, PNG, WebP or PDF up to 3 MiB.");
		if (!retryFile && files.reduce((total, selected) => total + selected.size, file.size) > detail.policy.messageFileBytes) throw new Error("Attachments exceed 6 MiB per reply.");
		const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(b => b.toString(16).padStart(2, "0")).join("");
		let attachmentId: string;
		if (retryFile) {
			if (file.name !== retryFile.name || file.size !== retryFile.size || file.type !== retryFile.type || hash !== retryFile.sha256) throw new Error("Select the original file, or remove this attachment and add a different one.");
			attachmentId = retryFile._id;
			await client.mutation(api.retryAttachment, { attachmentId });
		} else {
			const reservation = await client.mutation(api.reserveAttachment, { conversationId, name: file.name, size: file.size, type: file.type, sha256: hash, expectedRevision: revision });
			attachmentId = reservation.attachmentId; revision = reservation.revision;
			files = [...files, { _id: attachmentId, name: file.name, size: file.size, type: file.type, sha256: hash, status: "pending" }];
			saved = fingerprint(text, files);
		}
		const form = new FormData(); form.set("attachmentId", attachmentId); form.set("file", file);
		const response = await fetch(`${endpoint}/attachments`, { method: "POST", body: form });
		if (!response.ok) throw new Error("Upload did not finish. Select the original file again or remove it; this reply cannot send with a missing file.");
	} catch (e) { if (active) error = e instanceof Error ? e.message : "Attachment upload failed. Nothing was sent."; }
	finally { if (active) { uploading = false; retryFile = null; } }
}
async function send() {
	if (!canSend || !detail) return;
	sending = true; error = ""; requestId ??= crypto.randomUUID();
	try {
		await client.mutation(api.queueSend, { conversationId, requestId, draftRevision: revision, conversationRevision: detail.conversation.revision });
		// The durable attempt owns the outcome; the provider's returning Sent copy never sends again.
		requestId = null;
	} catch { error = "Send could not be confirmed. Check this conversation's delivery state before trying again; your draft is retained."; }
	finally { if (active) sending = false; }
}
async function sync() { try { await client.mutation(api.requestSync, { siteUrl: config.siteUrl }); } catch { error = "Sync could not be started. Reconnect Gmail or try again."; } }
async function reconcile() { if (!detail?.attempt) return; try { await client.mutation(api.reconcile, { attemptId: detail.attempt._id }); } catch { error = "Could not check Gmail Sent. Your earlier send remains unresolved."; } }
async function workflow(state: GmailWorkflow, followUpAt: number | null) {
 if (!api.setWorkflow || !detail) return;
 try { await client.mutation(api.setWorkflow, {conversationId, state, followUpAt, expectedRevision: detail.conversation.revision}); }
 catch { error = "The conversation changed before its workflow could be saved. Review the latest message and try again."; }
}
function workflowState(value: string): GmailWorkflow {
 return value === "review" || value === "needs_reply" || value === "waiting" ? value : "done";
}
function day(value: number | undefined) { if (!value) return ""; const date = new Date(value); return new Date(value - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
async function recover() {
 if (!api.restartRecovery) return;
 try { await client.mutation(api.restartRecovery, {siteUrl: config.siteUrl}); }
 catch { error = "History recovery could not start. Reconnect the same mailbox, then retry. Existing send evidence is retained."; }
}
function downloadDraft() {
	const url = URL.createObjectURL(new Blob([text + "\n\nSelected files:\n" + files.map(f => f.name).join("\n")], { type: "text/plain;charset=utf-8" }));
	const link = document.createElement("a"); link.href = url; link.download = "gmail-reply-draft.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>
<div class="gmail-thread" aria-label="Email conversation">
 {#if detailQuery.error}<p role="alert">This conversation could not be loaded. Reopen the record to try again.</p>
 {:else if !detail}<p role="status">loading conversation…</p>
 {:else}
  <div class="thread-meta"><p>to <strong>{detail.conversation.recipient}</strong></p><button type="button" onclick={sync}>sync now</button></div>
  <p class="hint" role="status">{detail.mailbox?.status === "reconnect" ? "Gmail access needs reconnecting." : detail.mailbox?.status !== "connected" ? "Gmail is disconnected." : detail.mailbox.recovering ? "Recovering conversation history. Sending is paused." : stale ? "Updates are stale. Sync before sending." : "Gmail is connected; new replies appear automatically."} {detail.mailbox?.lastSyncAt ? `Last sync: ${new Date(detail.mailbox.lastSyncAt).toLocaleString()}.` : ""}</p>
  {#if detail.mailbox?.problem}<p role="status">{detail.mailbox.problem}</p>{/if}
  {#if detail.recipientChanged}<p role="alert">This record's email changed. Existing messages keep their original recipient. Open a new conversation for the current email.</p>{/if}
  {#if detail.conversation.problem}<p role="alert">{detail.conversation.problem}. Sending is paused; review the thread in Gmail.</p>{/if}
  {#if detail.conversation.importPending}<p role="status">Importing the reviewed thread in resumable batches. Sending stays paused until recovery and catch-up finish.</p>{/if}
  {#if detail.expiresAt && detail.expiresAt <= now}<p role="status">The pilot retention period has ended. Sending is paused. {detail.conversation.retentionHoldAt ? "An unresolved send is holding deletion; reconcile it without resending." : "Data cleanup is pending."}</p>{/if}
  {#if api.setWorkflow}
   <div class="workflow">
    <div><label for={`gmail-workflow-${conversationId}`}>correspondence status</label><select id={`gmail-workflow-${conversationId}`} value={detail.conversation.workflowState ?? "done"} onchange={e => workflow(workflowState(e.currentTarget.value), detail?.conversation.followUpAt ?? null)}>
     <option value="review">review needed</option><option value="needs_reply">needs reply</option><option value="waiting">waiting</option><option value="done">done / no reply needed</option>
    </select></div>
    <div><label for={`gmail-followup-${conversationId}`}>follow-up date</label><input id={`gmail-followup-${conversationId}`} type="date" value={day(detail.conversation.followUpAt)} onchange={e => workflow(detail?.conversation.workflowState ?? "done", e.currentTarget.value ? new Date(`${e.currentTarget.value}T12:00:00`).getTime() : null)} /></div>
   </div>
   <p class="hint">New incoming mail needs review. Mark whether it needs a reply; a newer reply observed in Gmail Sent changes the status to waiting and clears the follow-up date.</p>
  {/if}
  {#if detail.mailbox?.problem || detail.mailbox?.recovering || stale}
   <details class="recovery"><summary>recovery details and safe next steps</summary>
    <p>Saved messages, drafts, and send evidence remain here. Reconnect the same mailbox if access was revoked. Sync now retries from the durable checkpoint. Restart history recovery rereads registered threads; sending remains paused until catch-up completes.</p>
    {#if detail.mailbox?.progress}<p>Current batch: {detail.mailbox.progress.completed} of {detail.mailbox.progress.total} message references processed.</p>{/if}
    <p>Last authenticated notice: {detail.mailbox?.lastNoticeAt ? new Date(detail.mailbox.lastNoticeAt).toLocaleString() : "none recorded"}. Watch expires: {detail.mailbox?.watchExpiresAt ? new Date(detail.mailbox.watchExpiresAt).toLocaleString() : "not available"}.</p>
    {#if api.restartRecovery}<button type="button" disabled={detail.mailbox?.status !== "connected"} onclick={recover}>restart registered history recovery</button>{/if}
   </details>
  {/if}
  <div class="messages" aria-label="Conversation messages">
   {#if messagesQuery.error}<p role="alert">Messages could not be loaded. Sending is paused; reopen the record to retry.</p>
   {:else if messagesQuery.status === "LoadingFirstPage"}<p role="status">loading messages…</p>
   {:else if messages.length === 0}<p class="empty">Your first reply starts a Gmail thread for this record. Replies sent from Gmail will appear here too.</p>{/if}
   {#if messagesQuery.status === "CanLoadMore"}<button type="button" onclick={() => messagesQuery.loadMore(25)}>load earlier messages</button>{/if}
   {#each messages as message (message._id)}
    {@const gmailUrl = gmailMessageUrl(detail.mailbox?.address, message.rfcId)}
    <article class:outgoing={message.sent}>
     <header><strong>{message.sent ? "you" : message.from || "withheld message"}</strong><span>{message.origin === "admin" ? "from admin" : "from Gmail"} · {new Date(message.date).toLocaleString()}</span></header>
     <GmailMessageText text={message.text} />
     {#if gmailUrl}<a class="gmail-link" href={gmailUrl} target="_blank" rel="noopener noreferrer">Open in Gmail</a>{/if}
     {#if message.attachments.length}<ul class="attachments">{#each message.attachments as f (f._id)}<li>
      <GmailAttachment file={f} {endpoint} />
     </li>{/each}</ul>{/if}
    </article>
   {/each}
  </div>
  {#if detail.attempt}
   <div class="send-state" role="status">
    {#if detail.attempt.status === "accepted"}accepted by Gmail · inbox delivery is not confirmed
    {:else if detail.attempt.status === "queued" || detail.attempt.status === "submitting"}reply {detail.attempt.status === "queued" ? "queued" : "being sent"} · keep the existing send
    {:else}{detail.attempt.problem ?? "Reply was not confirmed."}{/if}
    {#if detail.attempt.status === "uncertain"}<button type="button" onclick={reconcile}>check Gmail Sent</button><p>Do not resend an uncertain reply. If no match is found, it stays unresolved for review.</p>
     {#if detail.attempt.rfcId}<p class="evidence">Exact Message-ID: {detail.attempt.rfcId}</p>{/if}
     {#if detail.attempt.checkedAt}<p>Last Sent check: {new Date(detail.attempt.checkedAt).toLocaleString()} · {detail.attempt.checkOutcome === "not_found" ? "no matching message found; this does not prove the reply was not sent" : detail.attempt.checkOutcome === "ambiguous" ? "multiple or incomplete matches; manual review required" : detail.attempt.checkOutcome === "mismatch" ? "message details did not match the frozen send" : "Gmail could not be checked; reconnect or retry"}.</p>{/if}{/if}
   </div>
  {/if}
  <div class="composer">
   <label for={`gmail-reply-${conversationId}`}>reply</label>
   <textarea id={`gmail-reply-${conversationId}`} value={text} maxlength={detail.policy.bodyCharacters} oninput={e => edit(e.currentTarget.value)} disabled={openAttempt || uploading || sending} rows="5"></textarea>
   <ul class="attachments selected" aria-label="Selected attachments">{#each fileRows as f (f._id)}<li>
    <span>{f.name} · {f.status === "ready" ? "ready" : f.status === "pending" ? "upload incomplete" : f.problem ?? "upload failed"}</span>
    {#if f.status !== "ready"}<button type="button" disabled={uploading || openAttempt} onclick={() => { retryFile = f; picker?.click(); }}>select original again</button>{/if}
    <button type="button" disabled={saving || uploading || openAttempt} aria-label={`Remove ${f.name}`} onclick={() => removeFile(f._id)}>remove</button>
   </li>{/each}</ul>
   <input class="file-picker" type="file" bind:this={picker} accept="image/jpeg,image/png,image/webp,application/pdf" onchange={selectFile} aria-label="Choose reply attachment" />
   <p class="hint">JPEG, PNG, WebP or PDF · 3 MiB per file · 6 MiB total · up to 5 files. Files stay private. For larger phone photos, export a smaller copy explicitly; originals are never resized here. For larger deliveries, review a private delivery gallery and paste its recipient link. Reply text keeps its original capitalization.</p>
   <div class="composer-actions">
    <button type="button" disabled={uploading || saving || openAttempt || files.length >= detail.policy.files} onclick={() => { retryFile = null; picker?.click(); }}>{uploading ? "uploading…" : "attach photo or PDF"}</button>
    <button type="button" disabled={!dirty || saving || uploading || openAttempt || conflict} onclick={() => save()}>{saving ? "saving…" : "save draft"}</button>
    <button type="button" class="send" disabled={!canSend} onclick={send}>{sending ? "queueing…" : "send reply"}</button>
   </div>
   <p class="hint" role="status">{saving ? "saving draft…" : dirty ? "unsaved changes" : "draft saved"}</p>
   {#if error || conflict}<p role="alert">{error || "Another tab changed this draft. Keep your text, then reopen to load the saved version."}</p><button type="button" onclick={downloadDraft}>download draft text</button>{/if}
  </div>
  {#if api.requestDeletion}<GmailDataControls {conversationId} blocked={openAttempt || dirty || saving || uploading} expiresAt={detail.expiresAt} {onremoved} />{/if}
 {/if}
</div>
<style>
.gmail-thread { margin-top: 20px; min-width: 0; color: var(--admin-text); }
.thread-meta, .composer-actions, article header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
p { font-size: 0.88rem; line-height: 1.6; margin: 10px 0; overflow-wrap: anywhere; }
.hint, article header span { color: var(--admin-text-muted); font-size: 0.8rem; line-height: 1.5; }
.messages { max-height: 500px; overflow-y: auto; margin-block: 20px; border-block: 1px solid var(--admin-border); }
article { padding: 18px 12px; border-bottom: 1px solid var(--admin-border); } article:last-child { border-bottom: 0; } article.outgoing { background: var(--admin-surface-raised); }
.workflow { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 16px; }
.workflow > div { flex: 1 1 160px; }
.workflow select, .workflow input { box-sizing: border-box; width: 100%; min-height: 44px; margin-top: 8px; padding: 8px; color: var(--admin-text); background: var(--admin-bg); border: 1px solid var(--admin-border-strong); font: inherit; }
.recovery summary { cursor: pointer; padding-block: 12px; font-size: .83rem; }
.evidence { font-family: monospace; text-transform: none; }
.gmail-link { font-size: .8rem; color: var(--admin-accent); }
article header strong { font-size: 0.83rem; color: var(--admin-heading); font-weight: 500; }
.empty { color: var(--admin-text-muted); padding-block: 12px; }
label { display: block; font-size: 0.85rem; margin-bottom: 8px; }
textarea { display: block; box-sizing: border-box; width: 100%; min-height: 120px; padding: 12px; border: 1px solid var(--admin-border-strong); background: var(--admin-bg); color: var(--admin-text); resize: vertical; font: inherit; line-height: 1.6; text-transform: none; caret-color: var(--admin-accent); }
button { min-height: 44px; padding: 8px 12px; font: inherit; font-size: 0.82rem; border: 1px solid var(--admin-border-strong); background: transparent; color: var(--admin-text); cursor: pointer; }
button:hover:not(:disabled) { background: var(--admin-active); } button:disabled { opacity: 0.55; cursor: not-allowed; }
button:focus-visible, textarea:focus-visible, a:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 3px; }
.send { background: var(--admin-control-selected); color: var(--admin-heading); margin-left: auto; }
.attachments { list-style: none; padding: 0; margin: 12px 0; } .attachments li { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding-block: 5px; font-size: 0.82rem; overflow-wrap: anywhere; }
.attachments span { overflow-wrap: anywhere; min-width: 0; }
.selected li { border-bottom: 1px solid var(--admin-border); } .selected li > span { flex: 1 1 200px; }
.file-picker { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.send-state { padding-block: 12px; font-size: 0.85rem; border-block: 1px solid var(--admin-border); line-height: 1.6; }
@media (max-width: 600px) { .composer-actions { display: grid; grid-template-columns: 1fr; } .send { margin: 0; } .messages { max-height: 420px; } .workflow input, .workflow select { font-size: 1rem; } article { padding-inline: 8px; } }
</style>
