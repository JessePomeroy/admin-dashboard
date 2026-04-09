<script lang="ts">
import AdminModal from "../../components/AdminModal.svelte";
import StatusDot from "../../components/StatusDot.svelte";
import type { Invoice, InvoiceItem } from "../../types";
import {
	dollarsToCents,
	formatCents,
	formatDollars,
	formatDate,
	formatTimestamp,
	getStatusColor,
	INVOICE_STATUS_COLORS,
} from "../../utils";
import LineItemEditor from "./LineItemEditor.svelte";

interface EmailTemplate {
	_id: string;
	name: string;
	category: string;
	subject: string;
}

interface Props {
	invoice: Invoice;
	templates: EmailTemplate[];
	onsave: (body: Record<string, unknown>) => Promise<void>;
	onaction: (action: string) => Promise<void>;
	onsend: (templateId?: string, changeNote?: string) => Promise<void>;
	ondelete: () => Promise<void>;
	onshare: () => Promise<void>;
	shareLinkCopied: boolean;
	onclose: () => void;
}

let {
	invoice,
	templates,
	onsave,
	onaction,
	onsend,
	ondelete,
	onshare,
	shareLinkCopied,
	onclose,
}: Props = $props();

let editMode = $state(false);
let confirmDelete = $state(false);
let confirmResend = $state(false);
let lastChangeNote = $state("");
let saving = $state(false);
let sending = $state(false);
let sendResult = $state<"success" | "error" | null>(null);
let selectedTemplateId = $state<string>("");

// Edit form state
let editItems = $state<InvoiceItem[]>([]);
let editTaxPercent = $state(0);
let editDueDate = $state("");
let editNotes = $state("");

function calcSubtotal(items: InvoiceItem[]): number {
	return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

function calcTax(subtotal: number, taxPercent: number): number {
	return Math.round(subtotal * (taxPercent / 100));
}

let detailSubtotal = $derived(calcSubtotal(invoice.items));
let detailTax = $derived(calcTax(detailSubtotal, invoice.taxPercent || 0));
let detailTotal = $derived(detailSubtotal + detailTax);

let editSubtotal = $derived(editItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
let editTax = $derived(editSubtotal * (editTaxPercent / 100));
let editTotal = $derived(editSubtotal + editTax);

function startEdit() {
	editItems = invoice.items.map((it: InvoiceItem) => ({
		...it,
		unitPrice: it.unitPrice / 100,
	}));
	editTaxPercent = invoice.taxPercent || 0;
	editDueDate = invoice.dueDate || "";
	editNotes = invoice.notes || "";
	editMode = true;
}

function cancelEdit() {
	editMode = false;
}

function buildChangeNote(): string {
	const changes: string[] = [];
	const oldItems = invoice.items;
	const newItems = editItems;
	if (oldItems.length !== newItems.length) {
		changes.push("line items updated");
	} else {
		const itemsChanged = newItems.some((item, i) => {
			const old = oldItems[i];
			return item.description !== old.description
				|| item.quantity !== old.quantity
				|| dollarsToCents(item.unitPrice) !== old.unitPrice;
		});
		if (itemsChanged) changes.push("line items updated");
	}
	if ((editTaxPercent || 0) !== (invoice.taxPercent || 0)) changes.push("tax updated");
	if ((editDueDate || "") !== (invoice.dueDate || "")) changes.push("due date updated");
	if ((editNotes || "") !== (invoice.notes || "")) changes.push("notes updated");
	return changes.join(", ");
}

async function handleSaveEdit() {
	if (editItems.length === 0) return;
	saving = true;
	try {
		const items = editItems.map((item) => ({
			description: item.description,
			quantity: item.quantity,
			unitPrice: dollarsToCents(item.unitPrice),
		}));
		// Capture changes before saving
		lastChangeNote = buildChangeNote();
		const body: Record<string, unknown> = { items };
		if (editTaxPercent > 0) body.taxPercent = editTaxPercent;
		body.dueDate = editDueDate || undefined;
		body.notes = editNotes || undefined;
		await onsave(body);
		editMode = false;
		if (invoice.status !== "draft") {
			confirmResend = true;
		}
	} catch (err) {
		console.error("Failed to update invoice:", err);
	} finally {
		saving = false;
	}
}

async function handleResend() {
	confirmResend = false;
	await handleSendEmail(selectedTemplateId || undefined, lastChangeNote);
}

function dismissResend() {
	confirmResend = false;
}

async function handleSendEmail(templateId?: string, changeNote?: string) {
	sending = true;
	sendResult = null;
	try {
		await onsend(templateId, changeNote);
		sendResult = "success";
	} catch {
		sendResult = "error";
	} finally {
		sending = false;
	}
}

async function handleAction(action: string) {
	saving = true;
	try {
		await onaction(action);
	} catch (err) {
		console.error("Failed to update invoice:", err);
	} finally {
		saving = false;
	}
}

async function handleDelete() {
	saving = true;
	try {
		await ondelete();
	} catch (err) {
		console.error("Failed to delete invoice:", err);
	} finally {
		saving = false;
	}
}
</script>

<AdminModal
	title={editMode ? "edit invoice" : invoice.invoiceNumber}
	{onclose}
	size="wide"
>
	{#if editMode}
		<form
			class="modal-form"
			onsubmit={(e) => {
				e.preventDefault();
				handleSaveEdit();
			}}
		>
			<LineItemEditor
				items={editItems}
				onitems={(v) => {
					editItems = v;
				}}
				formatTotal={(n) => formatDollars(n)}
			/>

			<div class="form-row">
				<div class="form-group">
					<label class="form-label" for="edit-tax">tax %</label>
					<input
						id="edit-tax"
						class="form-input"
						type="number"
						min="0"
						step="0.1"
						bind:value={editTaxPercent}
					/>
				</div>
				<div class="form-group">
					<label class="form-label" for="edit-due">due date</label>
					<input
						id="edit-due"
						class="form-input"
						type="date"
						bind:value={editDueDate}
					/>
				</div>
			</div>

			<div class="form-group">
				<label class="form-label" for="edit-notes">notes</label>
				<textarea
					id="edit-notes"
					class="form-input form-textarea"
					bind:value={editNotes}
					rows="2"
				></textarea>
			</div>

			<div class="totals-line">
				<span>subtotal: {formatDollars(editSubtotal)}</span>
				{#if editTaxPercent > 0}
					<span class="stat-sep">&middot;</span>
					<span>tax: {formatDollars(editTax)}</span>
				{/if}
				<span class="stat-sep">&middot;</span>
				<span class="total-amount"
					>total: {formatDollars(editTotal)}</span
				>
			</div>

			<div class="modal-actions">
				<button type="button" class="btn-cancel" onclick={cancelEdit}
					>cancel</button
				>
				<button
					type="submit"
					class="btn-save"
					disabled={saving || editItems.length === 0}
				>
					{saving ? "saving..." : "save changes"}
				</button>
			</div>
		</form>
	{:else}
		<div class="detail-body">
			<div class="detail-meta-line">
				<StatusDot
					color={getStatusColor(
						INVOICE_STATUS_COLORS,
						invoice.status,
					)}
					label={invoice.status}
				/>
				{#if invoice.invoiceType && invoice.invoiceType !== "one-time"}
					<span class="meta-sep">&middot;</span>
					<span class="detail-type">{invoice.invoiceType}</span>
				{/if}
				<span class="meta-sep">&middot;</span>
				<span class="detail-client">{invoice.clientName}</span>
				{#if invoice.dueDate}
					<span class="meta-sep">&middot;</span>
					<span class="detail-due"
						>due {formatDate(invoice.dueDate)}</span
					>
				{/if}
			</div>

			{#if invoice.invoiceType === "recurring" && invoice.recurring}
				<div class="type-info">
					<span class="type-info-item"
						>interval: {invoice.recurring.interval}</span
					>
					{#if invoice.recurring.nextDueDate}
						<span class="stat-sep">&middot;</span>
						<span class="type-info-item"
							>next due: {formatDate(
								invoice.recurring.nextDueDate,
							)}</span
						>
					{/if}
					{#if invoice.recurring.endDate}
						<span class="stat-sep">&middot;</span>
						<span class="type-info-item"
							>ends: {formatDate(
								invoice.recurring.endDate,
							)}</span
						>
					{/if}
				</div>
			{/if}

			{#if invoice.invoiceType === "deposit"}
				<div class="type-info">
					{#if invoice.depositPercent}
						<span class="type-info-item"
							>deposit: {invoice.depositPercent}%</span
						>
					{/if}
					{#if invoice.totalProject}
						<span class="stat-sep">&middot;</span>
						<span class="type-info-item"
							>total project: {formatCents(
								invoice.totalProject,
							)}</span
						>
						<span class="stat-sep">&middot;</span>
						<span class="type-info-item"
							>amount due: {formatCents(
								Math.round(
									invoice.totalProject *
										((invoice.depositPercent || 0) / 100),
								),
							)}</span
						>
						<span class="stat-sep">&middot;</span>
						<span class="type-info-item"
							>remaining: {formatCents(
								invoice.totalProject -
									Math.round(
										invoice.totalProject *
											((invoice.depositPercent || 0) /
												100),
									),
							)}</span
						>
					{/if}
				</div>
			{/if}

			{#if invoice.invoiceType === "milestone"}
				<div class="type-info">
					{#if invoice.milestoneName}
						<span class="type-info-item"
							>{invoice.milestoneName}</span
						>
						<span class="stat-sep">&middot;</span>
					{/if}
					{#if invoice.milestoneIndex}
						<span class="type-info-item"
							>milestone {invoice.milestoneIndex}</span
						>
					{/if}
				</div>
			{/if}

			<div class="detail-fields">
				<div class="detail-items-table">
					<div class="items-table-header">
						<span class="itcol-desc">description</span>
						<span class="itcol-qty">qty</span>
						<span class="itcol-price">price</span>
						<span class="itcol-total">total</span>
					</div>
					{#each invoice.items as item}
						<div class="items-table-row">
							<span class="itcol-desc">{item.description}</span>
							<span class="itcol-qty">{item.quantity}</span>
							<span class="itcol-price"
								>{formatCents(item.unitPrice)}</span
							>
							<span class="itcol-total"
								>{formatCents(
									item.quantity * item.unitPrice,
								)}</span
							>
						</div>
					{/each}
				</div>

				<div class="totals-line">
					<span>subtotal: {formatCents(detailSubtotal)}</span>
					{#if invoice.taxPercent}
						<span class="stat-sep">&middot;</span>
						<span
							>tax ({invoice.taxPercent}%): {formatCents(
								detailTax,
							)}</span
						>
					{/if}
					<span class="stat-sep">&middot;</span>
					<span class="total-amount"
						>total: {formatCents(detailTotal)}</span
					>
				</div>

				{#if invoice.notes}
					<div class="detail-field">
						<span class="detail-label">notes</span>
						<span class="detail-value detail-notes"
							>{invoice.notes}</span
						>
					</div>
				{/if}

				{#if invoice.sentAt}
					<div class="detail-field">
						<span class="detail-label">sent</span>
						<span class="detail-value"
							>{formatTimestamp(invoice.sentAt)}</span
						>
					</div>
				{/if}

				{#if invoice.paidAt}
					<div class="detail-field">
						<span class="detail-label">paid</span>
						<span class="detail-value"
							>{formatTimestamp(invoice.paidAt)}</span
						>
					</div>
				{/if}

				<div class="detail-field">
					<span class="detail-label">created</span>
					<span class="detail-value"
						>{formatTimestamp(invoice._creationTime)}</span
					>
				</div>
			</div>

			<div class="share-link-row">
				<button class="btn-share" onclick={onshare}>
					{shareLinkCopied ? "link copied!" : "copy share link"}
				</button>
			</div>

			{#if invoice.status === "draft" && templates.length > 0}
				<div class="email-template-picker">
					<label class="detail-label" for="email-template">email template</label>
					<select id="email-template" class="template-select" bind:value={selectedTemplateId}>
						<option value="">default email</option>
						{#each templates as t}
							<option value={t._id}>{t.name}</option>
						{/each}
					</select>
				</div>
			{/if}

			<div class="modal-actions detail-actions">
				{#if confirmResend}
					<span class="confirm-text">resend updated invoice to client?</span>
					<button
						class="btn-save"
						onclick={handleResend}
						disabled={sending}
					>
						{sending ? "sending..." : "yes, resend"}
					</button>
					<button
						class="btn-cancel"
						onclick={dismissResend}>no</button
					>
				{:else if confirmDelete}
					<span class="confirm-text">delete this invoice?</span>
					<button
						class="btn-danger"
						onclick={handleDelete}
						disabled={saving}
					>
						{saving ? "deleting..." : "yes, delete"}
					</button>
					<button
						class="btn-cancel"
						onclick={() => {
							confirmDelete = false;
						}}>no</button
					>
				{:else if sendResult === "success"}
					<span class="send-success" role="status">email sent</span>
				{:else if sendResult === "error"}
					<span class="send-error" role="alert">failed to send</span>
					<button
						class="btn-cancel"
						onclick={() => {
							sendResult = null;
						}}>dismiss</button
					>
				{:else if invoice.status === "draft"}
					<button
						class="btn-danger-outline"
						onclick={() => {
							confirmDelete = true;
						}}>delete</button
					>
					<button class="btn-cancel" onclick={startEdit}
						>edit</button
					>
					<button
						class="btn-send"
						onclick={handleSendEmail}
						disabled={sending}
					>
						{sending ? "sending..." : "send email"}
					</button>
					<button
						class="btn-save"
						onclick={() => handleAction("send")}
						disabled={saving}
					>
						{saving ? "..." : "mark as sent"}
					</button>
				{:else if invoice.status === "sent"}
					<button class="btn-cancel" onclick={startEdit}>edit</button>
					<button
						class="btn-action"
						onclick={() => handleAction("overdue")}
						disabled={saving}>mark overdue</button
					>
					<button
						class="btn-save"
						onclick={() => handleAction("pay")}
						disabled={saving}
					>
						{saving ? "..." : "mark as paid"}
					</button>
				{:else if invoice.status === "overdue"}
					<button class="btn-cancel" onclick={startEdit}>edit</button>
					<button
						class="btn-save"
						onclick={() => handleAction("pay")}
						disabled={saving}
					>
						{saving ? "..." : "mark as paid"}
					</button>
				{:else if invoice.status === "paid"}
					<span class="paid-note"
						>paid on {formatTimestamp(invoice.paidAt ?? 0)}</span
					>
				{/if}
			</div>
		</div>
	{/if}
</AdminModal>

<style>
	@import "../../styles/detail-modal.css";

	.totals-line {
		flex-wrap: wrap;
	}

	.detail-type {
		color: var(--admin-text-muted);
		font-size: 0.82rem;
	}

	.type-info {
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
		font-size: 0.82rem;
		color: var(--admin-text-muted);
	}

	.type-info-item {
		color: var(--admin-text-muted);
	}

	.detail-items-table {
		display: flex;
		flex-direction: column;
	}

	.items-table-header {
		display: flex;
		gap: 8px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--admin-border);
		font-size: 0.72rem;
		color: var(--admin-text-subtle);
		letter-spacing: 0.04em;
	}

	.items-table-row {
		display: flex;
		gap: 8px;
		padding: 8px 0;
		border-bottom: 1px solid var(--admin-border);
		font-size: 0.85rem;
		color: var(--admin-text);
	}

	.itcol-desc {
		flex: 3;
		min-width: 0;
	}

	.itcol-qty {
		flex: 0 0 40px;
		text-align: center;
	}

	.itcol-price {
		flex: 0 0 80px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.itcol-total {
		flex: 0 0 80px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.paid-note {
		font-size: 0.82rem;
		color: var(--status-sage);
		margin-left: auto;
	}
</style>
