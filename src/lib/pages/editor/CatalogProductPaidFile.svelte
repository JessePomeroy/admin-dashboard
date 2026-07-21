<script lang="ts">
import type { CatalogEditorPaidFileRelation } from "../../catalogProductEditor";

let {
	relation,
}: {
	relation: CatalogEditorPaidFileRelation | null | undefined;
} = $props();

function formatFileSize(sizeBytes: number) {
	if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return "not available";
	if (sizeBytes < 1024) return `${sizeBytes} B`;
	const units = ["KB", "MB", "GB"];
	const unitIndex = Math.min(
		Math.floor(Math.log(sizeBytes) / Math.log(1024)) - 1,
		units.length - 1,
	);
	const value = sizeBytes / 1024 ** (unitIndex + 1);
	return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}
</script>

<section aria-labelledby="catalog-paid-file-heading">
	<div class="section-heading">
		<span>04</span>
		<div>
			<h2 id="catalog-paid-file-heading">paid download file</h2>
			<p>The verified private ZIP associated with this draft.</p>
		</div>
	</div>
	{#if relation}
		<dl>
			<div><dt>file</dt><dd>{relation.asset.originalFilename}</dd></div>
			<div><dt>status</dt><dd>{relation.asset.status}</dd></div>
			<div><dt>format</dt><dd>{relation.asset.mimeType}</dd></div>
			<div><dt>size</dt><dd>{formatFileSize(relation.asset.sizeBytes)}</dd></div>
			<div><dt>version</dt><dd>{relation.asset.version ?? "not set"}</dd></div>
		</dl>
	{:else}
		<p class="missing" role="status">No verified paid file is linked to this draft.</p>
	{/if}
	<p class="note">Saving product details or prices preserves this file. Upload and replacement controls are not part of this slice.</p>
</section>

<style>
	section { padding: 28px; border: 1px solid var(--admin-border); border-radius: 10px; background: var(--admin-surface); }
	.section-heading { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 24px; }
	.section-heading > span { color: var(--admin-text-subtle); font-size: .72rem; padding-top: 4px; }
	.section-heading > div { flex: 1; }
	h2 { margin: 0; color: var(--admin-heading); font-size: 1rem; font-weight: 500; }
	.section-heading p { margin: 5px 0 0; color: var(--admin-text-muted); font-size: .82rem; }
	dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 12px; margin: 0; }
	dl div { min-width: 0; border: 1px solid var(--admin-border); border-radius: 8px; padding: 13px; background: color-mix(in srgb, var(--admin-bg) 72%, transparent); }
	dt { margin: 0 0 6px; color: var(--admin-text-subtle); font-size: .68rem; letter-spacing: .06em; }
	dd { overflow-wrap: anywhere; margin: 0; color: var(--admin-heading); font-size: .82rem; }
	.note, .missing { margin: 18px 0 0; color: var(--admin-text-muted); font-size: .78rem; line-height: 1.55; }
	.note { border-top: 1px solid var(--admin-border); padding-top: 18px; }
	@media (max-width: 768px) { section { padding: 20px; } }
</style>
