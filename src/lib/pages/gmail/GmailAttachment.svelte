<script lang="ts">
import { onDestroy } from "svelte";
import type { GmailFile } from "./types";
let { file, endpoint }: { file: GmailFile; endpoint: string } = $props();
let preview = $state<string | null>(null), loading = $state(false), problem = $state("");
let request: AbortController | undefined;
const url = $derived(`${endpoint}/attachments/${encodeURIComponent(file._id)}`);
async function show() {
 if (loading) return;
 request = new AbortController(); loading = true; problem = "";
 try {
  const response = await fetch(url, { cache: "no-store", signal: request.signal });
  if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== file.type) throw new Error("Private preview unavailable");
  const blob = await response.blob();
  if (blob.size !== file.size || blob.size > 3 * 1024 * 1024) throw new Error("Private preview unavailable");
  preview = URL.createObjectURL(blob);
 } catch { if (!request.signal.aborted) problem = "Preview could not load. Check the Gmail connection, then retry. The original is unchanged."; }
 finally { loading = false; }
}
function close() { if (preview) URL.revokeObjectURL(preview); preview = null; }
onDestroy(() => { request?.abort(); close(); });
</script>
<div class="file">
 <div class="file-row">
 {#if file.status === "ready"}
  <a href={url} target="_blank" rel="noopener noreferrer">view {file.name}</a>
  <span>{file.type === "application/pdf" ? "private PDF" : "private image"} · {(file.size / 1024).toFixed(0)} KiB</span>
  <a href={`${url}?download=1`}>download original</a>
  {#if file.type.startsWith("image/")}<button type="button" disabled={loading} onclick={preview ? close : show}>{loading ? "loading preview…" : preview ? "close preview" : "preview image"}</button>{/if}
 {:else}<span>{file.name}</span><span role="status">{file.problem ?? "Attachment unavailable; review the original in Gmail."}</span>{/if}
 </div>
 {#if problem}<p role="alert">{problem}</p><button type="button" onclick={show}>retry preview</button>{/if}
 {#if preview}<img src={preview} alt={`Attachment preview: ${file.name}`} onerror={() => { close(); problem = "This image could not be displayed. Download the original or review it in Gmail."; }} />{/if}
</div>
<style>
.file { min-width: 0; width: 100%; }
.file-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; overflow-wrap: anywhere; }
a { color: var(--admin-accent); text-underline-offset: 3px; }
span, p { font-size: .8rem; line-height: 1.6; color: var(--admin-text-muted); }
img { display: block; max-width: 100%; max-height: 300px; margin-block: 12px; object-fit: contain; }
button { min-height: 44px; padding: 8px; color: var(--admin-text); background: transparent; border: 1px solid var(--admin-border-strong); font: inherit; font-size: .8rem; cursor: pointer; }
button:disabled { opacity: .6; }
a:focus-visible, button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 3px; }
</style>
