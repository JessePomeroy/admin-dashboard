<script lang="ts">
import StatusDot from "../../components/StatusDot.svelte";
import type { Quote, QuotePackage } from "../../types";
import {
	formatCents,
	formatDate,
	getStatusColor,
	QUOTE_STATUS_COLORS,
} from "../../utils";

interface Props {
	quotes: Quote[];
	onselect: (quote: Quote) => void;
}

let { quotes, onselect }: Props = $props();

function calcTotal(pkgs: QuotePackage[]): number {
	return pkgs.reduce((sum, pkg) => sum + pkg.price, 0);
}
</script>

{#if quotes.length === 0}
	<div class="empty-state">no quotes found</div>
{:else}
	<div class="table-wrap">
		<table class="data-table data-table--clickable data-table--nowrap q-table">
			<thead>
				<tr>
					<th scope="col">quote #</th>
					<th scope="col">client</th>
					<th scope="col">category</th>
					<th scope="col">packages</th>
					<th scope="col">total</th>
					<th scope="col">valid until</th>
					<th scope="col">status</th>
				</tr>
			</thead>
			<tbody>
				{#each quotes as q (q._id)}
					{@const total = calcTotal(q.packages)}
					<tr
						class="q-row"
						role="button"
						tabindex="0"
						onclick={() => onselect(q)}
						onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onselect(q); } }}
					>
						<td class="td-number">{q.quoteNumber}</td>
						<td class="td-client">{q.clientName}</td>
						<td class="td-category">{q.category || "\u2014"}</td>
						<td class="td-packages">{q.packages.length} package{q.packages.length !== 1 ? "s" : ""}</td>
						<td class="td-total">{formatCents(total)}</td>
						<td class="td-date">{q.validUntil ? formatDate(q.validUntil) : "\u2014"}</td>
						<td>
							<StatusDot color={getStatusColor(QUOTE_STATUS_COLORS, q.status)} label={q.status} />
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

	.td-client {
		color: var(--admin-text);
	}

	.td-category {
		color: var(--admin-text-subtle);
		font-size: 0.8rem;
	}

	.td-packages,
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
