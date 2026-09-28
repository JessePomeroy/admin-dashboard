<script lang="ts">
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";
const config = getAdminConfig();
const api = config.api.contentCleanup;
if (!api) throw new Error("Content cleanup is not configured");
const actions = api;
const client = useAdminClient();
type Document = { documentId: string; slug: string; archivedAt: number | null; updatedAt: number };
type Revision = { revisionId: string; createdAt: number; active: boolean };
let kind = $state("post");
let rows = $state<Document[]>([]);
let selected = $state<Document | null>(null);
let revisions = $state<Revision[]>([]);
let cursor = $state<string | null>(null);
let next = $state<string | null>(null);
let revisionNext = $state<string | null>(null);
let busy = $state(false);
let loaded = $state(false);
let error = $state("");
async function load(nextPage = false) {
 if (busy) return;
 busy = true; error = ""; selected = null; revisions = [];
 try {
  cursor = nextPage ? next : null;
  const result = await client.query(actions.list, { siteUrl: config.siteUrl, kind, paginationOpts: { cursor, numItems: 20 } }) as { page: Document[]; isDone: boolean; continueCursor: string };
  rows = result.page; next = result.isDone ? null : result.continueCursor; loaded = true;
 } catch (failure) { error = failure instanceof Error ? failure.message : "Could not load content."; }
 finally { busy = false; }
}
async function showRevisions(doc: Document, nextPage = false) {
 if (busy) return;
 busy = true; error = "";
 try {
  const result = await client.query(actions.listRevisions, { documentId: doc.documentId, paginationOpts: { cursor: nextPage ? revisionNext : null, numItems: 20 } }) as { page: Revision[]; isDone: boolean; continueCursor: string };
  selected = doc; revisions = result.page; revisionNext = result.isDone ? null : result.continueCursor;
 } catch (failure) { error = failure instanceof Error ? failure.message : "Could not load revisions."; }
 finally { busy = false; }
}
async function remove(doc: Document, revision?: Revision) {
 if (busy || !window.confirm(revision ? "Permanently remove this old revision? It will no longer be available to restore." : `Permanently erase all content and revisions for ${doc.slug}? Uploaded files are cleaned up separately. The URL remains reserved.`)) return;
 busy = true; error = "";
 try {
  await client.mutation(revision ? actions.pruneRevision : actions.purgeArchived, { documentId: doc.documentId, expectedUpdatedAt: doc.updatedAt, ...(revision ? { revisionId: revision.revisionId } : {}) });
  if (revision) revisions = revisions.filter(row => row.revisionId !== revision.revisionId);
  else { rows = rows.filter(row => row.documentId !== doc.documentId); selected = null; revisions = []; }
 } catch (failure) { error = failure instanceof Error ? failure.message : "Cleanup failed. Refresh and retry."; }
 finally { busy = false; }
}
</script>
<div class="cleanup">
 <p>Archive content before permanent deletion. Active revisions and referenced content are protected. Uploaded files are managed separately.</p>
 <label>content type<select bind:value={kind} disabled={busy} onchange={() => void load()}><option value="post">posts</option><option value="author">authors</option><option value="category">categories</option></select></label>
 <button disabled={busy} onclick={() => void load()}>refresh / first page</button>
 {#if error}<p role="alert">{error}</p>{/if}
 {#if loaded && rows.length === 0}<p>No content on this page.</p>{/if}
 {#each rows as row (row.documentId)}
  <article><span>{row.slug} — {row.archivedAt === null ? "active" : "archived"}</span>
   <div><button disabled={busy} onclick={() => void showRevisions(row)}>review revisions</button>
   {#if row.archivedAt !== null}<button disabled={busy} onclick={() => void remove(row)}>permanently delete</button>{/if}</div>
  </article>
 {/each}
 {#if next}<button disabled={busy} onclick={() => void load(true)}>next content page</button>{/if}
 {#if selected}
  <h3>revisions — {selected.slug}</h3>
  {#each revisions as revision (revision.revisionId)}
   <article><span>{new Date(revision.createdAt).toLocaleString()} {revision.active ? "— active" : ""}</span><button disabled={busy || revision.active} onclick={() => selected && void remove(selected, revision)}>delete revision</button></article>
  {/each}
  {#if revisionNext}<button disabled={busy} onclick={() => selected && void showRevisions(selected, true)}>next revision page</button>{/if}
 {/if}
 {#if busy}<p role="status">Working…</p>{/if}
</div>
<style>
.cleanup { padding: 20px; color: var(--admin-text-muted); font-size: .85rem; }
p { line-height: 1.6; }
label { display: grid; gap: 8px; }
button, select { min-height: 44px; padding: 10px; border: 1px solid var(--admin-border); background: var(--admin-bg); color: var(--admin-text); font: inherit; max-width: 100%; }
button { margin: 6px 8px 6px 0; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
article { padding: 12px 0; border-bottom: 1px solid var(--admin-border); overflow-wrap: anywhere; }
article span { display: block; }
h3 { font-size: 1rem; color: var(--admin-text); }
</style>
