<script lang="ts">
import StatusDot from "../../components/StatusDot.svelte";
import type { Invoice, InvoiceItem } from "../../types";
import {
	formatCents,
	formatDate,
	getStatusColor,
	INVOICE_STATUS_COLORS,
} from "../../utils";

interface Props {
	invoices: Invoice[];
	onselect: (invoice: Invoice) => void;
}

let { invoices, onselect }: Props = $props();

function calcSubtotal(items: InvoiceItem[]): number {
	return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

function calcTax(subtotal: number, taxPercent: number): number {
	return Math.round(subtotal * (taxPercent / 100));
}
</script>

{#if invoices.length === 0}
	<div class="empty-state">no invoices found</div>
{:else}
	<div class="table-wrap">
		<table class="data-table data-table--clickable data-table--nowrap inv-table">
			<thead>
				<tr>
					<th scope="col">invoice #</th>
					<th scope="col">type</th>
					<th scope="col">client</th>
					<th scope="col">items</th>
					<th scope="col">total</th>
					<th scope="col">due date</th>
					<th scope="col">status</th>
				</tr>
			</thead>
			<tbody>
				{#each invoices as inv (inv._id)}
					{@const subtotal = calcSubtotal(inv.items)}
					{@const tax = calcTax(subtotal, inv.taxPercent || 0)}
					{@const total = subtotal + tax}
					<tr
						class="inv-row"
						role="button"
						tabindex="0"
						onclick={() => onselect(inv)}
						onkeydown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onselect(inv);
							}
						}}
					>
						<td class="td-number">{inv.invoiceNumber}</td>
						<td class="td-type"
							>{inv.invoiceType || "one-time"}</td
						>
						<td class="td-client">{inv.clientName}</td>
						<td class="td-items"
							>{inv.items.length} item{inv.items.length !== 1
								? "s"
								: ""}</td
						>
						<td class="td-total">{formatCents(total)}</td>
						<td class="td-date"
							>{inv.dueDate
								? formatDate(inv.dueDate)
								: "\u{2014}"}</td
						>
						<td>
							<StatusDot
								color={getStatusColor(
									INVOICE_STATUS_COLORS,
									inv.status,
								)}
								label={inv.status}
							/>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	@import "../../styles/data-table.css";

	.td-number {
		font-weight: 500;
		color: var(--admin-heading);
	}

	.td-type {
		color: var(--admin-text-subtle);
		font-size: 0.8rem;
	}

	.td-client {
		color: var(--admin-text);
	}

	.td-items,
	.td-date {
		color: var(--admin-text-muted);
		font-size: 0.82rem;
	}

	.td-total {
		font-weight: 500;
		color: var(--admin-heading);
		font-variant-numeric: tabular-nums;
	}
</style>
