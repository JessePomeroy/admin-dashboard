<script lang="ts">
  import { onDestroy } from "svelte";
  let { endpoint } = $props<{ endpoint: string }>();
  let busy = $state(false);
  let failure = $state("");
  let downloadUrl = $state<string | null>(null);
  let controller: AbortController | null = null;
  function clearDownload() { if (downloadUrl) URL.revokeObjectURL(downloadUrl); downloadUrl = null; }
  onDestroy(() => { controller?.abort(); clearDownload(); });
  async function prepare() {
    if (busy) return;
    failure = ""; clearDownload(); busy = true;
    controller = new AbortController();
    try {
      if (!/^\/(?!\/)[^?#\\]+$/.test(endpoint)) throw new Error("Website export is not configured.");
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", signal: controller.signal });
      if (!response.ok) {
        throw new Error(response.status === 413 ? "This export is too large for an immediate download. Contact your hosting provider to prepare it." : response.status === 401 ? "Please sign in again before exporting." : response.status === 409 ? "Content changed or a retained file is unavailable. Retry, or contact your hosting provider." : "The export could not be completed. Please try again.");
      }
      if (response.headers.get("Content-Type") !== "application/zip") throw new Error("The export could not be verified. Please try again.");
      const file = await response.blob();
      if (controller.signal.aborted) return;
      if (file.size === 0 || file.size > 16 * 1024 * 1024) throw new Error("The export could not be verified. Please try again.");
      downloadUrl = URL.createObjectURL(file);
    } catch (error) {
      if (!controller.signal.aborted) failure = error instanceof Error ? error.message : "The export could not be completed.";
    } finally { busy = false; controller = null; }
  }
</script>

<section class="content-export" aria-labelledby="content-export-title">
  <div><h2 id="content-export-title">your website content</h2><p>Download published content, saved drafts, and retained website files. Customer and payment records are separate.</p></div>
  <div class="export-actions">
    <button class="export-button" disabled={busy} onclick={prepare}>{busy ? "preparing export…" : "export website content"}</button>
    {#if busy}<button class="cancel" onclick={() => controller?.abort()}>cancel</button>{/if}
    {#if downloadUrl}<a class="export-button" href={downloadUrl} download="website-content-export.zip">download verified export</a>{/if}
  </div>
  <p class="status" aria-live="polite">{failure || (downloadUrl ? "Your export is ready. Download it before leaving this page." : busy ? "Preparing and checking your files. Keep this page open." : "")}</p>
</section>

<style>
  .content-export { border-top: 1px solid var(--admin-border); padding-top: 24px; }
  h2 { font-size: 1rem; font-weight: 500; margin: 0 0 8px; color: var(--admin-text); }
  p { color: var(--admin-text-muted); font-size: .875rem; line-height: 1.6; margin: 0; max-width: 64ch; }
  .export-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; align-items: center; }
  .export-button { box-sizing: border-box; display: inline-flex; align-items: center; min-height: 44px; padding: 10px 16px; border: 1px solid var(--admin-border); border-radius: 0; background: var(--admin-surface); color: var(--admin-text); font: inherit; font-size: .875rem; text-decoration: none; cursor: pointer; }
  .export-button:hover { background: var(--admin-control-hover); }
  .export-button:disabled { opacity: .6; cursor: wait; }
  .cancel { min-height: 44px; background: transparent; color: var(--admin-text-muted); border: 0; font: inherit; cursor: pointer; }
  .status { margin-top: 12px; min-height: 1.4em; }
</style>
