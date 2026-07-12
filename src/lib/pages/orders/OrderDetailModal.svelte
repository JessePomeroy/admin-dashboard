<script lang="ts">
import AdminModal from "../../components/AdminModal.svelte";
import { formatCents, formatDateTime, formatTimestamp } from "../../utils";
import type { OrderStatus } from "../../types";
import {
	getStripeFeeCapturePresentation,
	type AdminOrder,
} from "./orderPresentation";

interface Props {
	order: AdminOrder;
	onclose: () => void;
	onupdatestatus: (orderId: string, newStatus: string) => void;
	onsavenotes: (orderId: string, notes: string) => Promise<void>;
}

let { order, onclose, onupdatestatus, onsavenotes }: Props = $props();
let stripeFee = $derived(getStripeFeeCapturePresentation(order));

const statuses: OrderStatus[] = [
	"new",
	"printing",
	"ready",
	"shipped",
	"delivered",
	"refunded",
];

let notesValue = $state("");
let notesSaving = $state(false);
let loadedOrderId = $state<string | null>(null);

$effect(() => {
	if (loadedOrderId === order._id) return;
	loadedOrderId = order._id;
	notesValue = order.notes || "";
});

async function saveNotes() {
	notesSaving = true;
	try {
		await onsavenotes(order._id, notesValue);
	} finally {
		notesSaving = false;
	}
}
</script>

<AdminModal title={order.orderNumber} {onclose} size="wide">
	<div class="modal-sub-header">
		<p class="modal-meta">{formatDateTime(order.createdAt)}</p>
	</div>

	<div class="modal-body">
		<div class="modal-field">
			<label class="field-label" for="modal-status">status</label>
			<select
				id="modal-status"
				value={order.status}
				onchange={(e) => onupdatestatus(order._id, e.currentTarget.value)}
				class="form-input"
			>
				{#each statuses as status}
					<option value={status}>{status}</option>
				{/each}
			</select>
		</div>

		<div class="modal-section">
			<h3 class="section-label">customer</h3>
			<p class="section-text">{order.customerName || "\u2014"}</p>
			<p class="section-text-muted">{order.customerEmail || "\u2014"}</p>
		</div>

		{#if order.shippingAddress}
			<div class="modal-section">
				<h3 class="section-label">shipping address</h3>
				<p class="section-text">{order.shippingAddress.line1}</p>
				{#if order.shippingAddress.line2}<p class="section-text">{order.shippingAddress.line2}</p>{/if}
				<p class="section-text">{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}</p>
				<p class="section-text">{order.shippingAddress.country}</p>
			</div>
		{/if}

		<div class="modal-section">
			<h3 class="section-label">items</h3>
			<ul class="items-list">
				{#each order.items || [] as item}
					<li>
						{item.productName} x {item.quantity} — {formatCents(item.price, order.currency)}
					</li>
				{/each}
			</ul>
			<p class="items-total">total: {formatCents(order.total, order.currency)}</p>
		</div>

		<div class="modal-section fee-section">
			<h3 class="section-label">stripe fee capture</h3>
			<p class="fee-status fee-status--{stripeFee.tone}">{stripeFee.label}</p>
			<p class="section-text-muted">{stripeFee.detail}</p>
			{#if stripeFee.feeCents !== null}
				<p class="fee-amounts">
					fee: {formatCents(stripeFee.feeCents, order.currency)}
					<span aria-hidden="true">&middot;</span>
					net: {formatCents(stripeFee.netRevenueCents ?? 0, order.currency)}
				</p>
			{/if}
			{#if stripeFee.nextAttemptAt !== null}
				<p class="fee-timestamp">next attempt: {formatTimestamp(stripeFee.nextAttemptAt)}</p>
			{:else if stripeFee.lastAttemptAt !== null}
				<p class="fee-timestamp">last attempt: {formatTimestamp(stripeFee.lastAttemptAt)}</p>
			{/if}
		</div>

		<div class="modal-field">
			<label class="field-label" for="modal-notes">notes</label>
			<textarea
				id="modal-notes"
				bind:value={notesValue}
				class="form-input form-textarea"
				rows="3"
				placeholder="add fulfillment notes"
			></textarea>
			<button
				class="btn-save"
				disabled={notesSaving}
				onclick={saveNotes}
			>
				{notesSaving ? "saving..." : "save notes"}
			</button>
		</div>
	</div>
</AdminModal>

<style>
	.modal-sub-header {
		padding: 0 28px 4px;
	}

	.modal-meta {
		font-size: 0.82rem;
		color: var(--admin-text-muted);
		margin: 0;
	}

	.modal-body {
		padding: 20px 28px 28px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.modal-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		font-size: 0.76rem;
		color: var(--admin-text-subtle);
		letter-spacing: 0.04em;
	}

	.modal-section {
		padding-top: 4px;
	}

	.section-label {
		font-family: "Synonym", system-ui, sans-serif;
		font-size: 0.76rem;
		font-weight: 400;
		color: var(--admin-text-subtle);
		letter-spacing: 0.04em;
		margin: 0 0 8px;
	}

	.section-text {
		font-size: 0.88rem;
		color: var(--admin-heading);
		margin: 0 0 2px;
	}

	.section-text-muted {
		font-size: 0.82rem;
		color: var(--admin-text-muted);
		margin: 0;
	}

	.items-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.86rem;
		color: var(--admin-text);
	}

	.items-total {
		margin: 10px 0 0;
		font-weight: 500;
		font-size: 0.9rem;
		color: var(--admin-heading);
	}

	.fee-section {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}

	.fee-status {
		margin: 0;
		padding: 3px 8px;
		border: 1px solid var(--admin-border-strong);
		border-radius: 999px;
		font-size: 0.76rem;
	}

	.fee-status--pending {
		color: var(--status-amber);
	}

	.fee-status--captured {
		color: var(--status-sage);
	}

	.fee-status--failed {
		color: var(--status-rose);
	}

	.fee-status--legacy {
		color: var(--admin-text-muted);
	}

	.fee-amounts,
	.fee-timestamp {
		margin: 0;
		font-size: 0.8rem;
		color: var(--admin-text-muted);
	}

	.fee-amounts {
		display: flex;
		gap: 6px;
	}

	.form-input {
		padding: 8px 10px;
		background: rgba(255, 255, 255, 0.03);
		color: var(--admin-text);
		border: 1px solid var(--admin-border-strong);
		border-radius: 6px;
		font-size: 0.85rem;
		font-family: "Synonym", system-ui, sans-serif;
		outline: none;
		transition: border-color 0.15s;
	}

	.form-input:focus {
		border-color: var(--admin-accent);
	}

	.form-textarea {
		resize: vertical;
		min-height: 60px;
	}

	.btn-save {
		align-self: flex-start;
		margin-top: 4px;
		padding: 7px 16px;
		background: rgba(129, 140, 248, 0.15);
		border: 1px solid rgba(129, 140, 248, 0.25);
		border-radius: 6px;
		color: var(--admin-accent-hover);
		font-size: 0.82rem;
		font-family: "Synonym", system-ui, sans-serif;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
	}

	.btn-save:hover {
		background: rgba(129, 140, 248, 0.22);
	}

	.btn-save:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.modal-sub-header {
			padding: 0 20px 4px;
		}

		.modal-body {
			padding: 20px;
		}
	}
</style>
