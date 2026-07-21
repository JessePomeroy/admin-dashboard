<script lang="ts">
import { onMount } from "svelte";
import {
	portfolioMediaUrl,
	type PortfolioMediaAsset,
} from "../../portfolioEditor";

let {
	assets,
	selectedAssetIds,
	mediaBaseUrl,
	hasMore = false,
	onChoose,
	onClose,
}: {
	assets: PortfolioMediaAsset[];
	selectedAssetIds: Set<string>;
	mediaBaseUrl: string;
	hasMore?: boolean;
	onChoose: (asset: PortfolioMediaAsset) => void;
	onClose: () => void;
} = $props();

let closeButton: HTMLButtonElement;
let pickerElement: HTMLDivElement;
onMount(() => {
	const previousFocus = document.activeElement;
	closeButton.focus();
	return () => {
		if (previousFocus instanceof HTMLElement) previousFocus.focus();
	};
});

function handleKeydown(event: KeyboardEvent) {
	if (event.key === "Escape") {
		onClose();
		return;
	}
	if (event.key !== "Tab") return;
	const focusable = [...pickerElement.querySelectorAll<HTMLElement>(
		'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
	)];
	if (focusable.length === 0) return;
	const first = focusable[0];
	const last = focusable[focusable.length - 1];
	if (event.shiftKey && document.activeElement === first) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && document.activeElement === last) {
		event.preventDefault();
		first.focus();
	}
}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="backdrop" role="presentation">
	<div bind:this={pickerElement} class="picker" role="dialog" aria-modal="true" aria-labelledby="media-picker-heading">
		<header>
			<div>
				<h2 id="media-picker-heading">choose from media</h2>
				<p>Reuse a ready web image without uploading another copy.</p>
			</div>
			<button bind:this={closeButton} type="button" class="close" onclick={onClose} aria-label="Close media picker">close</button>
		</header>

		{#if assets.length === 0}
			<div class="empty">
				<strong>No ready media yet.</strong>
				<p>Upload an image from an editor, then reuse it here.</p>
			</div>
		{:else}
			<ul>
				{#each assets as asset (asset._id)}
					{@const selected = selectedAssetIds.has(asset._id)}
					<li>
						<img src={portfolioMediaUrl(mediaBaseUrl, asset.derivatives.thumb.key)} alt="" />
						<div>
							<strong>{asset.originalFilename}</strong>
							<span>{asset.source.width} × {asset.source.height}</span>
						</div>
						<button type="button" onclick={() => onChoose(asset)} disabled={selected || asset.status !== "ready"}>
							{selected ? "added" : "add"}
						</button>
					</li>
				{/each}
			</ul>
			{#if hasMore}<p class="limit-note">Showing the newest 100 ready assets. Search and additional pages arrive with the full Media library.</p>{/if}
		{/if}
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 24px; background: color-mix(in srgb, var(--admin-bg) 82%, transparent); }
	.picker { width: min(860px, 100%); max-height: min(720px, calc(100vh - 48px)); overflow: auto; border: 1px solid var(--admin-border-strong); border-radius: 10px; background: var(--admin-surface-raised); box-shadow: 0 24px 80px color-mix(in srgb, black 35%, transparent); }
	header { position: sticky; top: 0; z-index: 1; display: flex; justify-content: space-between; gap: 24px; padding: 22px 24px; border-bottom: 1px solid var(--admin-border); background: var(--admin-surface-raised); }
	h2 { margin: 0; color: var(--admin-heading); font-size: 1rem; font-weight: 500; }
	header p { margin: 5px 0 0; color: var(--admin-text-muted); font-size: .8rem; }
	button { min-height: 40px; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 8px 12px; background: transparent; color: var(--admin-text); font: inherit; font-size: .74rem; cursor: pointer; }
	button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	button:disabled { opacity: .45; cursor: default; }
	ul { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; margin: 0; padding: 1px; list-style: none; background: var(--admin-border); }
	li { display: grid; grid-template-columns: 74px 1fr auto; gap: 12px; align-items: center; min-width: 0; padding: 14px; background: var(--admin-surface); }
	img { width: 74px; height: 64px; object-fit: cover; border-radius: 5px; background: var(--admin-bg); }
	li div { min-width: 0; }
	li strong, li span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	li strong { color: var(--admin-heading); font-size: .78rem; font-weight: 500; }
	li span { margin-top: 5px; color: var(--admin-text-subtle); font-size: .68rem; }
	.empty { display: grid; place-items: center; min-height: 260px; padding: 32px; text-align: center; }
	.empty strong { color: var(--admin-heading); }
	.empty p { margin: 8px 0 0; color: var(--admin-text-muted); }
	.limit-note { margin: 0; padding: 12px 18px; border-top: 1px solid var(--admin-border); color: var(--admin-text-subtle); font-size: .72rem; }
	@media (max-width: 700px) {
		.backdrop { padding: 0; align-items: end; }
		.picker { width: 100%; max-height: 92vh; border-radius: 12px 12px 0 0; }
		ul { grid-template-columns: 1fr; }
		button { min-height: 44px; }
	}
</style>
