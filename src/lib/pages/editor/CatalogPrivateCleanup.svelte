<script lang="ts">
import { isRootedQuerylessEndpoint } from "../../catalogPrivateEditorUpload";
import { onMount } from "svelte";
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";

const config = getAdminConfig();
const client = useAdminClient();
const api = config.api.catalogPrivateAssets;
const endpoint = config.editor?.products?.privateAssetDeleteEndpoint;
const webEndpoint = config.editor?.products?.mediaDeleteEndpoint;
const webApi = config.api.mediaAssets?.listForEditor;
const privateEnabled = Boolean(api && endpoint && isRootedQuerylessEndpoint(endpoint));
const webEnabled = Boolean(webApi && webEndpoint && isRootedQuerylessEndpoint(webEndpoint));
type Kind = "web" | "print_source" | "paid_digital_file";
type FileRow = { id: string; kind: Kind; filename: string; sizeBytes: number; status: string };
let expiredUploads = $state(false);
let kind = $state<Kind>(webEnabled ? "web" : "print_source");
let files = $state<FileRow[]>([]);
let cursor = $state<string | null>(null);
let nextCursor = $state<string | null>(null);
let busy = $state(false);
let message = $state("");
let alive = true;

function record(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function cleanupPage(value: unknown, requestedKind: Kind) {
	if (!record(value) || !Array.isArray(value.page) || typeof value.isDone !== "boolean" || typeof value.continueCursor !== "string") throw new Error("Invalid cleanup page");
	const page = value.page.map((row: unknown): FileRow => {
		if (!record(row)) throw new Error("Invalid cleanup file");
		const id = requestedKind === "web" ? row._id : row.id;
		const filename = requestedKind === "web" ? row.originalFilename : row.filename;
		const sizeBytes = requestedKind === "web" && record(row.source) ? row.source.sizeBytes : row.sizeBytes;
		if (typeof id !== "string" || typeof filename !== "string" || typeof sizeBytes !== "number" || typeof row.status !== "string") throw new Error("Invalid cleanup file");
		return { id, filename, sizeBytes, status: row.status, kind: requestedKind };
	});
	return { page, isDone: value.isDone, continueCursor: value.continueCursor };
}

async function load(pageCursor: string | null = null) {
	if (busy) return;
	const query = kind === "web" ? webApi : expiredUploads && api?.listExpiredUploadsForCleanup ? api.listExpiredUploadsForCleanup : api?.listForCleanup;
	if (!query) return;
	busy = true;
	message = "";
	try {
		const result = cleanupPage(await client.query(query, { siteUrl: config.siteUrl, ...(kind === "web" ? {} : { kind }), paginationOpts: { cursor: pageCursor, numItems: 25 } }), kind);
		if (!alive) return;
		files = result.page;
		cursor = pageCursor;
		nextCursor = result.isDone ? null : result.continueCursor;
	} catch { if (alive) message = "Could not load private uploads. Try again."; }
	finally { if (alive) busy = false; }
}
async function remove(file: FileRow) {
	const deleteEndpoint = file.kind === "web" ? webEndpoint : endpoint;
	if (!deleteEndpoint || !isRootedQuerylessEndpoint(deleteEndpoint) || busy || !globalThis.confirm(`Permanently erase “${file.filename}”? Files referenced by product history cannot be deleted. Upload audit records will remain.`)) return;
	busy = true;
	message = "";
	try {
		const response = await fetch(deleteEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: file.id, ...(file.kind === "web" ? {} : { kind: file.kind }) }) });
		if (!response.ok) {
			const body = await response.json().catch(() => null);
			throw new Error(typeof body?.message === "string" ? body.message : "Cleanup is incomplete. Retry the same file.");
		}
		const result = await response.json();
		if (result.deleted !== true || result.id !== file.id) throw new Error("Cleanup was not confirmed. Retry the same file.");
		if (alive) { files = files.filter((row) => row.id !== file.id); message = "File bytes deleted. Upload audit records retained."; }
	} catch (error) { if (alive) message = error instanceof Error ? error.message : "Cleanup is incomplete. Retry the same file."; }
	finally { if (alive) busy = false; }
}
onMount(() => { void load(); return () => { alive = false; }; });
</script>

{#if privateEnabled || webEnabled}
<section class="private-cleanup" aria-label="Upload cleanup files">
	<p>Remove unused web images, print masters and paid download files. Delete unused products first to release their file references. Orders and checkout retain their products and files. Save your work first; unsaved selections do not reserve files.</p>
	<div class="cleanup-controls">
	{#if kind !== "web" && api?.listExpiredUploadsForCleanup}<label class="expired-choice"><input type="checkbox" checked={expiredUploads} disabled={busy} onchange={(event) => { expiredUploads = event.currentTarget.checked; void load(); }} /> expired unfinished uploads</label>{/if}
	<label class="file-type">file type <select value={kind} disabled={busy} onchange={(event) => { const value = event.currentTarget.value; if (value === "web" || value === "print_source" || value === "paid_digital_file") { kind = value; void load(); } }}>{#if webEnabled}<option value="web">web images</option>{/if}{#if privateEnabled}<option value="print_source">print masters</option><option value="paid_digital_file">paid download files</option>{/if}</select></label>
	<button type="button" disabled={busy} onclick={() => void load(cursor)}>refresh</button>
	</div>
	{#if message}<p role="status">{message}</p>{/if}
	{#if busy}<p role="status">working…</p>{/if}
	<ul>{#each files as file (file.id)}<li><span>{file.filename} · {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB</span><button type="button" disabled={busy} onclick={() => void remove(file)}>{file.status === "deleting" ? "retry cleanup" : "delete file"}</button></li>{/each}</ul>
	{#if !busy && files.length === 0}<p>No files on this page.</p>{/if}
	{#if cursor}<button type="button" disabled={busy} onclick={() => void load()}>first page</button>{/if}
	{#if nextCursor}<button type="button" disabled={busy} onclick={() => void load(nextCursor)}>next page</button>{/if}
</section>
{/if}

<style>
.private-cleanup { padding: 0 24px 24px; }
p, label, li { font-size: .8rem; line-height: 1.6; color: var(--admin-text-muted); }
.cleanup-controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: end; margin-top: 16px; }
.expired-choice { min-height: 44px; grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; }
.file-type { display: grid; gap: 6px; }
ul { padding: 0; list-style: none; }
li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--admin-border); }
li span { overflow-wrap: anywhere; min-width: 0; }
button, select { min-height: 44px; color: var(--admin-text); background: var(--admin-bg); border: 1px solid var(--admin-border); padding: 8px 10px; border-radius: 4px; cursor: pointer; }
button:disabled, select:disabled { opacity: .5; cursor: default; }
@media (max-width: 480px) { li { align-items: stretch; flex-direction: column; } }
</style>
