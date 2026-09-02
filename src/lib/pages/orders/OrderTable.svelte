<script lang="ts">
import type { OrderStatus } from "../../types";
import {
	formatStripeMinorUnits,
	getStripeFeeCapturePresentation,
	type AdminOrder,
} from "./orderPresentation";
import { formatDateTime, getStatusColor, ORDER_STATUS_COLORS } from "../../utils";

interface Props {
	orders: AdminOrder[];
	onorderclick: (order: AdminOrder) => void;
	onupdatestatus: (orderId: string, newStatus: string) => void;
}

let { orders, onorderclick, onupdatestatus }: Props = $props();

const statuses: OrderStatus[] = [
	"new",
	"printing",
	"ready",
	"shipped",
	"delivered",
	"refunded",
];

</script>

{#if orders.length === 0}
	<div class="empty-state">no orders found</div>
{:else}
	<div class="table-wrap">
		<table class="data-table data-table--clickable orders-table">
			<thead>
				<tr>
					<th scope="col">order</th>
					<th scope="col">date</th>
					<th scope="col">customer</th>
					<th scope="col">items</th>
					<th scope="col">total</th>
					<th scope="col">processing fee</th>
					<th scope="col">status</th>
				</tr>
			</thead>
			<tbody>
				{#each orders as order (order._id)}
					{@const stripeFee = getStripeFeeCapturePresentation(order)}
					<tr
						class="order-row"
						role="button"
						tabindex="0"
						onclick={() => onorderclick(order)}
						onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onorderclick(order); }}}
					>
						<td class="td-order">{order.orderNumber}</td>
						<td class="td-date">{formatDateTime(order.createdAt)}</td>
						<td>
							<div class="customer-cell">
								<span class="customer-name">{order.customerName || "\u2014"}</span>
								<span class="customer-email">{order.customerEmail || "\u2014"}</span>
							</div>
						</td>
						<td class="td-items">
							{order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? "s" : ""}
						</td>
						<td class="td-total">{formatStripeMinorUnits(order.total, order.currency)}</td>
						<td>
							<span class="fee-state fee-state--{stripeFee.tone}">{stripeFee.label}</span>
						</td>
						<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
						<td onclick={(e) => e.stopPropagation()}>
							<div class="status-cell">
								<span class="status-dot" style="background: {getStatusColor(ORDER_STATUS_COLORS, order.status)}"></span>
								<select
									value={order.status}
									onchange={(e) => onupdatestatus(order._id, e.currentTarget.value)}
									class="status-select"
								>
									{#each statuses as status}
										<option value={status}>{status}</option>
									{/each}
								</select>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	@import "../../styles/data-table.css";

	.td-order {
		font-family: monospace;
		font-size: 0.8rem;
		color: var(--admin-text-muted);
	}

	.td-date {
		font-size: 0.82rem;
		color: var(--admin-text-muted);
		white-space: nowrap;
	}

	.customer-cell {
		display: flex;
		flex-direction: column;
	}

	.customer-name {
		color: var(--admin-heading);
	}

	.customer-email {
		font-size: 0.78rem;
		color: var(--admin-text-subtle);
	}

	.td-items {
		font-size: 0.82rem;
		color: var(--admin-text-muted);
	}

	.td-total {
		font-weight: 500;
		color: var(--admin-heading);
	}

	.fee-state {
		font-size: 0.76rem;
		color: var(--admin-text-muted);
		white-space: nowrap;
	}

	.fee-state--pending {
		color: var(--status-amber);
	}

	.fee-state--captured {
		color: var(--status-sage);
	}

	.fee-state--failed {
		color: var(--status-rose);
	}

	.status-cell {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.status-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.status-select {
		padding: 4px 8px;
		background: var(--admin-dropdown-bg);
		border: 1px solid var(--admin-border-strong);
		border-radius: 5px;
		color: var(--admin-text);
		font-size: 0.78rem;
		font-family: "Synonym", system-ui, sans-serif;
	}
</style>
