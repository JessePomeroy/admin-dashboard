<script lang="ts">
import { tryInvoiceAmounts } from "../../invoiceAmounts";
import { dollarsToCents } from "../../utils";
import type { InvoiceDraftItem } from "./invoiceDraft";

interface Props {
	items: InvoiceDraftItem[];
	onitems: (items: InvoiceDraftItem[]) => void;
	pricePlaceholder?: string;
	priceLabel?: string;
	formatTotal: (cents: number) => string;
	convertPrice?: (price: number) => number;
	required?: boolean;
}

let {
	items,
	onitems,
	pricePlaceholder = "price ($)",
	priceLabel = "line items",
	formatTotal,
	convertPrice,
	required = false,
}: Props = $props();

function addItem() {
	onitems([...items, { description: "", quantity: 1, unitPrice: 0 }]);
}

function removeItem(index: number) {
	onitems(items.filter((_, i) => i !== index));
}

function lineTotal(item: InvoiceDraftItem): string {
	if (item.quantity === undefined || item.unitPrice === undefined
		|| !Number.isFinite(item.unitPrice) || item.unitPrice < 0) return "—";
	const amounts = tryInvoiceAmounts([{
		quantity: item.quantity,
		unitPrice: (convertPrice ?? dollarsToCents)(item.unitPrice),
	}]);
	return amounts ? formatTotal(convertPrice ? amounts.total : amounts.total / 100) : "—";
}

function autoGrow(e: Event) {
	const el = e.target as HTMLTextAreaElement;
	el.style.height = "auto";
	el.style.height = el.scrollHeight + "px";
}
</script>

<div class="items-section">
	<div class="items-header">
		<span class="form-label"
			>{priceLabel}
			{#if required}<span class="required">*</span>{/if}</span
		>
	</div>
	{#each items as item, i}
		<div class="item-block">
			<div class="item-desc-row">
				<textarea
					class="form-input item-desc"
					placeholder="description"
					aria-label="Item description"
					bind:value={item.description}
					oninput={autoGrow}
					rows="1"
					required
				></textarea>
				{#if items.length > 1}
					<button
						type="button"
						class="btn-remove-item"
						onclick={() => removeItem(i)}
						aria-label="Remove item"
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							><line x1="18" y1="6" x2="6" y2="18" /><line
								x1="6"
								y1="6"
								x2="18"
								y2="18"
							/></svg
						>
					</button>
				{/if}
			</div>
			<div class="item-numbers-row">
				<input
					class="form-input item-qty"
					type="number"
					min="0"
					step="any"
					placeholder="qty"
					aria-label="Quantity"
					bind:value={item.quantity}
					required
				/>
				<input
					class="form-input item-price"
					type="number"
					min="0"
					step="0.01"
					placeholder={pricePlaceholder}
					aria-label="Unit price"
					bind:value={item.unitPrice}
					required
				/>
				<span class="item-line-total">{lineTotal(item)}</span>
			</div>
		</div>
	{/each}
	<button type="button" class="btn-add-item" onclick={addItem}
		>+ add item</button
	>
</div>

<style>
	@import "../../styles/form-controls.css";
	.items-section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.items-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.form-label {
		font-size: 0.76rem;
		color: var(--admin-text-muted);
		font-weight: 400;
		letter-spacing: 0.02em;
	}

	.required {
		color: var(--status-rose);
	}

	.item-block {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-bottom: 10px;
		border-bottom: 1px solid var(--admin-border);
	}

	.item-block:last-of-type {
		border-bottom: none;
		padding-bottom: 0;
	}

	.item-desc-row {
		display: flex;
		gap: 8px;
		align-items: flex-start;
	}

	.item-numbers-row {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.item-desc {
		flex: 1;
		min-width: 0;
		resize: none;
		overflow: hidden;
		line-height: 1.4;
		font-family: inherit;
	}

	.item-qty {
		width: 64px;
		flex-shrink: 0;
		text-align: center;
	}

	.item-price {
		width: 100px;
		flex-shrink: 0;
		text-align: right;
	}

	.item-line-total {
		flex: 1;
		text-align: right;
		font-size: 0.82rem;
		color: var(--admin-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.btn-remove-item {
		background: none;
		border: none;
		color: var(--admin-text-subtle);
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		transition: color 0.15s;
		flex-shrink: 0;
		margin-top: 4px;
	}

	.btn-remove-item:hover {
		color: var(--status-rose);
	}

	.btn-add-item {
		background: none;
		border: none;
		color: var(--admin-text-muted);
		cursor: pointer;
		font-size: 0.8rem;
		font-family: "Synonym", system-ui, sans-serif;
		padding: 4px 0;
		text-align: left;
		transition: color 0.15s;
		align-self: flex-start;
	}

	.btn-add-item:hover {
		color: var(--admin-heading);
	}

	@media (max-width: 768px) {
		.item-numbers-row {
			flex-wrap: wrap;
		}

		.item-line-total {
			flex: 1 1 100%;
			text-align: left;
			margin-top: 2px;
		}
	}
</style>
