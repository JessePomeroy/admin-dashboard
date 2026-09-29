<script lang="ts">
let {
	published,
	hasChanges = false,
	archived = false,
	item = "item",
	onpublish,
	onunpublish,
	publishDisabled = false,
	unpublishDisabled = false,
	busy = false,
}: {
	published: boolean;
	hasChanges?: boolean;
	archived?: boolean;
	item?: string;
	onpublish?: () => Promise<void>;
	onunpublish?: () => Promise<void>;
	publishDisabled?: boolean;
	unpublishDisabled?: boolean;
	busy?: boolean;
} = $props();

let pending = $state<"publish" | "unpublish" | null>(null);
let options = $state<HTMLDetailsElement>();
let primary = $state<HTMLButtonElement>();
let primaryUnpublishes = $derived(published && !hasChanges && Boolean(onunpublish));
let locked = $derived(busy || pending !== null || archived);

function closeOptions(restoreFocus = false) {
	if (!options?.open) return;
	options.open = false;
	if (restoreFocus) primary?.focus();
}

async function run(action: "publish" | "unpublish") {
	const callback = action === "publish" ? onpublish : onunpublish;
	if (!callback || locked || (action === "publish" ? publishDisabled : unpublishDisabled)) return;
	closeOptions(true);
	if (action === "unpublish" && !globalThis.confirm(
		`Unpublish this ${item}? It will be hidden from the public site. Your saved content stays here so you can publish it again.`,
	)) return;
	pending = action;
	try {
		await callback();
	} finally {
		pending = null;
	}
}
</script>

<svelte:window
	onclick={(event) => { if (event.target instanceof Node && !options?.contains(event.target)) closeOptions(); }}
	onkeydown={(event) => { if (event.key === "Escape" && options?.open) { event.preventDefault(); closeOptions(true); } }}
/>

<div class="publication-control">
	<span class="publication-status" aria-live="polite">{archived ? "archived" : published ? hasChanges ? "published · draft changes" : "published" : "unpublished"}</span>
	{#if !archived && (onpublish || (published && onunpublish))}
		<div class="publication-actions" aria-busy={locked}>
			<button
				bind:this={primary}
				type="button"
				class:primary={!primaryUnpublishes}
				disabled={locked || (primaryUnpublishes ? unpublishDisabled : publishDisabled || !onpublish || (published && !hasChanges))}
				onclick={() => void run(primaryUnpublishes ? "unpublish" : "publish")}
			>{pending === "unpublish" ? "unpublishing…" : pending === "publish" ? "publishing…" : primaryUnpublishes ? "unpublish" : published ? "publish changes" : "publish"}</button>
			{#if published && hasChanges && onunpublish}
				<details bind:this={options} class="publication-options">
					<summary aria-label="More publishing options"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></summary>
					<div class="publication-options-panel"><button type="button" disabled={locked || unpublishDisabled} onclick={() => void run("unpublish")}>unpublish</button></div>
				</details>
			{/if}
		</div>
	{/if}
</div>

<style>
.publication-control { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; max-width: 100%; }
.publication-status { color: var(--admin-text); font-size: .8rem; line-height: 1.5; }
.publication-actions { position: relative; display: flex; align-items: stretch; gap: 2px; }
button, summary { min-height: 44px; border: 1px solid var(--admin-border-strong); border-radius: 2px; padding: 10px 16px; background: var(--admin-bg); color: var(--admin-text); font: inherit; font-size: .85rem; cursor: pointer; }
button.primary { background: var(--admin-heading); color: var(--admin-bg); }
button:disabled { opacity: .55; cursor: not-allowed; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 3px; }
.publication-options { flex: none; }
summary { display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 44px; height: 100%; padding: 10px; list-style: none; }
summary::-webkit-details-marker { display: none; }
.publication-options-panel { position: absolute; z-index: 10; top: calc(100% + 6px); left: 0; right: 0; box-sizing: border-box; border: 1px solid var(--admin-border-strong); padding: 6px; background: var(--admin-bg); }
.publication-options-panel button { width: 100%; text-align: left; }

@media (max-width: 640px) {
	.publication-control { width: 100%; flex: 1 1 100%; align-items: stretch; flex-direction: column; gap: 10px; }
	.publication-actions { width: 100%; gap: 0; }
	.publication-actions > button { flex: 1; min-width: 0; }
	summary { border-color: var(--admin-heading); border-left-color: var(--admin-bg); border-bottom-width: 2px; border-radius: 0; background: var(--admin-heading); color: var(--admin-bg); }
}
</style>
