<script lang="ts">
import type { DocumentSendReceipt } from "./documentSendReceiptState.svelte";

let { documentLabel, items, onopen, ondismiss }: {
	documentLabel: "invoice" | "quote" | "contract";
	items: readonly DocumentSendReceipt[];
	onopen: (id: string) => void;
	ondismiss: (id: string) => void;
} = $props();
</script>

{#if items.length}
	<section class="document-send-receipts" aria-label="saved document email requests">
		<ul>
			{#each items as receipt (receipt.id)}
				<li data-document-id={receipt.id}>
					<div class="receipt-copy">
						<p role={receipt.stage === "failed" ? "alert" : "status"}>
							<strong>{documentLabel} saved.</strong> {receipt.message}
							{#if receipt.label}<span class="receipt-context">{receipt.label}</span>{/if}
						</p>
						{#if receipt.openError}<p class="read-error" role="alert">{receipt.openError}</p>{/if}
					</div>
					<div class="receipt-actions">
						<button type="button" aria-disabled={receipt.opening} aria-busy={receipt.opening} onclick={() => { if (!receipt.opening) onopen(receipt.id); }}>
							{receipt.opening ? `opening saved ${documentLabel}…` : `open saved ${documentLabel}`}
						</button>
						{#if receipt.stage !== "pending"}
							<button type="button" onclick={() => ondismiss(receipt.id)}>dismiss notice</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.document-send-receipts { margin-block: 16px; color: var(--admin-text); }
	ul { list-style: none; padding: 0; margin: 0; }
	li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 12px 16px;
		padding-block: 16px;
		border-bottom: 1px solid var(--admin-border);
	}
	.receipt-copy { min-width: 0; max-width: 70ch; overflow-wrap: anywhere; }
	p { margin: 0; font-size: 0.88rem; line-height: 1.6; }
	strong { color: var(--admin-heading); font-weight: 500; }
	.receipt-context { display: block; margin-top: 4px; color: var(--admin-text-muted); }
	.read-error { margin-top: 6px; }
	.receipt-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
	button {
		min-height: 44px;
		padding: 8px 12px;
		border: 1px solid var(--admin-border-strong);
		background: transparent;
		color: var(--admin-text);
		font: inherit;
		font-size: 0.82rem;
		cursor: pointer;
	}
	button:hover:not([aria-disabled="true"]) { background: var(--admin-active); }
	button[aria-disabled="true"] { opacity: 0.5; cursor: progress; }
	button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 3px; }
	@media (max-width: 768px) {
		li { grid-template-columns: minmax(0, 1fr); }
		.receipt-actions { width: 100%; }
		button { flex: 1; min-width: 0; }
	}
</style>
