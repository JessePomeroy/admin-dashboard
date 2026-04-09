<script lang="ts">
import AdminModal from "../../components/AdminModal.svelte";
import StatusDot from "../../components/StatusDot.svelte";
import type { Contract } from "../../types";
import {
	CONTRACT_STATUS_COLORS,
	dollarsToCents,
	formatCents,
	formatDate,
	formatTimestamp,
	getStatusColor,
} from "../../utils";

interface EmailTemplate {
	_id: string;
	name: string;
	category: string;
	subject: string;
}

interface Props {
	contract: Contract;
	emailTemplates: EmailTemplate[];
	onclose: () => void;
	onsave: (id: string, payload: Record<string, unknown>) => Promise<void>;
	onaction: (id: string, action: string) => Promise<void>;
	onsend: (id: string, templateId?: string, changeNote?: string) => Promise<boolean>;
	ondelete: (id: string) => Promise<void>;
	onsharelink: (id: string, clientId: string) => Promise<void>;
}

let {
	contract,
	emailTemplates,
	onclose,
	onsave,
	onaction,
	onsend,
	ondelete,
	onsharelink,
}: Props = $props();

let editMode = $state(false);
let confirmDelete = $state(false);
let confirmResend = $state(false);
let lastChangeNote = $state("");
let saving = $state(false);
let sending = $state(false);
let sendResult = $state<"success" | "error" | null>(null);
let shareLinkCopied = $state(false);
let selectedTemplateId = $state<string>("");

let editTitle = $state("");
let editBody = $state("");
let editEventDate = $state("");
let editEventLocation = $state("");
let editTotalPrice = $state(0);
let editDepositAmount = $state(0);

function startEdit() {
	editTitle = contract.title;
	editBody = contract.body;
	editEventDate = contract.eventDate || "";
	editEventLocation = contract.eventLocation || "";
	editTotalPrice = contract.totalPrice ? contract.totalPrice / 100 : 0;
	editDepositAmount = contract.depositAmount ? contract.depositAmount / 100 : 0;
	editMode = true;
}

function cancelEdit() {
	editMode = false;
}

function buildChangeNote(): string {
	const changes: string[] = [];
	if (editTitle !== contract.title) changes.push("title updated");
	if (editBody !== contract.body) changes.push("body updated");
	if ((editEventDate || "") !== (contract.eventDate || "")) changes.push("event date updated");
	if ((editEventLocation || "") !== (contract.eventLocation || "")) changes.push("location updated");
	const oldTotal = contract.totalPrice ? contract.totalPrice / 100 : 0;
	const oldDeposit = contract.depositAmount ? contract.depositAmount / 100 : 0;
	if (editTotalPrice !== oldTotal) changes.push("total price updated");
	if (editDepositAmount !== oldDeposit) changes.push("deposit amount updated");
	return changes.join(", ");
}

async function handleSaveEdit() {
	if (!editTitle || !editBody) return;
	saving = true;
	try {
		lastChangeNote = buildChangeNote();
		const payload: Record<string, unknown> = {
			title: editTitle,
			body: editBody,
			eventDate: editEventDate || undefined,
			eventLocation: editEventLocation || undefined,
			totalPrice:
				editTotalPrice > 0 ? dollarsToCents(editTotalPrice) : undefined,
			depositAmount:
				editDepositAmount > 0 ? dollarsToCents(editDepositAmount) : undefined,
		};
		await onsave(contract._id, payload);
		editMode = false;
		if (contract.status !== "draft") {
			confirmResend = true;
		}
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
		const ok = await onsend(contract._id, templateId, changeNote);
		sendResult = ok ? "success" : "error";
	} catch {
		sendResult = "error";
	} finally {
		sending = false;
	}
}

async function handleAction(action: string) {
	saving = true;
	try {
		await onaction(contract._id, action);
	} finally {
		saving = false;
	}
}

async function handleDelete() {
	saving = true;
	try {
		await ondelete(contract._id);
	} finally {
		saving = false;
	}
}

async function handleShareLink() {
	shareLinkCopied = false;
	await onsharelink(contract._id, contract.clientId);
	shareLinkCopied = true;
	setTimeout(() => {
		shareLinkCopied = false;
	}, 3000);
}
</script>

<AdminModal
	title={editMode ? "edit contract" : contract.title}
	onclose={onclose}
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
			<div class="form-group">
				<label class="form-label" for="edit-title"
					>title <span class="required">*</span></label
				>
				<input
					id="edit-title"
					class="form-input"
					type="text"
					bind:value={editTitle}
					required
				/>
			</div>

			<div class="form-group">
				<label class="form-label" for="edit-body"
					>body <span class="required">*</span></label
				>
				<textarea
					id="edit-body"
					class="form-input form-textarea form-textarea-large"
					bind:value={editBody}
					rows="10"
					required
				></textarea>
			</div>

			<div class="form-row">
				<div class="form-group">
					<label class="form-label" for="edit-event-date"
						>event date</label
					>
					<input
						id="edit-event-date"
						class="form-input"
						type="date"
						bind:value={editEventDate}
					/>
				</div>
				<div class="form-group">
					<label class="form-label" for="edit-event-location"
						>event location</label
					>
					<input
						id="edit-event-location"
						class="form-input"
						type="text"
						bind:value={editEventLocation}
					/>
				</div>
			</div>

			<div class="form-row">
				<div class="form-group">
					<label class="form-label" for="edit-total-price"
						>total price ($)</label
					>
					<input
						id="edit-total-price"
						class="form-input"
						type="number"
						min="0"
						step="0.01"
						bind:value={editTotalPrice}
					/>
				</div>
				<div class="form-group">
					<label class="form-label" for="edit-deposit"
						>deposit amount ($)</label
					>
					<input
						id="edit-deposit"
						class="form-input"
						type="number"
						min="0"
						step="0.01"
						bind:value={editDepositAmount}
					/>
				</div>
			</div>

			<div class="modal-actions">
				<button type="button" class="btn-cancel" onclick={cancelEdit}
					>cancel</button
				>
				<button
					type="submit"
					class="btn-save"
					disabled={saving || !editTitle || !editBody}
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
						CONTRACT_STATUS_COLORS,
						contract.status,
					)}
					label={contract.status}
				/>
				{#if contract.category}
					<span class="meta-sep">&middot;</span>
					<span class="detail-category">{contract.category}</span>
				{/if}
				<span class="meta-sep">&middot;</span>
				<span class="detail-client">{contract.clientName}</span>
				{#if contract.eventDate}
					<span class="meta-sep">&middot;</span>
					<span class="detail-date"
						>{formatDate(contract.eventDate)}</span
					>
				{/if}
			</div>

			{#if contract.totalPrice || contract.depositAmount}
				<div class="detail-pricing">
					{#if contract.totalPrice}
						<span>total: {formatCents(contract.totalPrice)}</span>
					{/if}
					{#if contract.depositAmount}
						<span class="stat-sep">&middot;</span>
						<span
							>deposit:
							{formatCents(contract.depositAmount)}</span
						>
					{/if}
				</div>
			{/if}

			{#if contract.eventLocation}
				<div class="detail-field">
					<span class="detail-label">location</span>
					<span class="detail-value"
						>{contract.eventLocation}</span
					>
				</div>
			{/if}

			<div class="detail-fields">
				<div class="detail-field">
					<span class="detail-label">contract body</span>
					<div class="detail-body-text">
						{contract.body}
					</div>
				</div>

				{#if contract.sentAt}
					<div class="detail-field">
						<span class="detail-label">sent</span>
						<span class="detail-value"
							>{formatTimestamp(contract.sentAt)}</span
						>
					</div>
				{/if}

				{#if contract.signedAt}
					<div class="detail-field">
						<span class="detail-label">signed</span>
						<span class="detail-value"
							>{formatTimestamp(contract.signedAt)}</span
						>
					</div>
				{/if}

				<div class="detail-field">
					<span class="detail-label">created</span>
					<span class="detail-value"
						>{formatTimestamp(contract._creationTime)}</span
					>
				</div>
			</div>

			<div class="share-link-row">
				<button class="btn-share" onclick={handleShareLink}>
					{shareLinkCopied ? "link copied!" : "copy share link"}
				</button>
			</div>

			{#if contract.status === "draft" && emailTemplates.length > 0}
				<div class="email-template-picker">
					<label class="detail-label" for="email-template">email template</label>
					<select id="email-template" class="template-select" bind:value={selectedTemplateId}>
						<option value="">default email</option>
						{#each emailTemplates as t}
							<option value={t._id}>{t.name}</option>
						{/each}
					</select>
				</div>
			{/if}

			<div class="modal-actions detail-actions">
				{#if confirmResend}
					<span class="confirm-text">resend updated contract to client?</span>
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
					<span class="confirm-text">delete this contract?</span>
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
					<span class="send-success">email sent</span>
				{:else if sendResult === "error"}
					<span class="send-error">failed to send</span>
					<button
						class="btn-cancel"
						onclick={() => {
							sendResult = null;
						}}>dismiss</button
					>
				{:else if contract.status === "draft"}
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
						onclick={() => handleSendEmail()}
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
				{:else if contract.status === "sent"}
					<button class="btn-cancel" onclick={startEdit}>edit</button>
					<button
						class="btn-save"
						onclick={() => handleAction("sign")}
						disabled={saving}
					>
						{saving ? "..." : "mark as signed"}
					</button>
				{:else if contract.status === "signed" && contract.signedAt}
					<span class="signed-note"
						>signed on
						{formatTimestamp(contract.signedAt)}</span
					>
				{/if}
			</div>
		</div>
	{/if}
</AdminModal>

<style>
	@import "../../styles/detail-modal.css";

	.required {
		color: var(--status-rose);
	}

	.form-textarea-large {
		min-height: 180px;
		line-height: 1.6;
	}

	.detail-category {
		color: var(--admin-text-muted);
		font-size: 0.82rem;
	}

	.detail-date {
		color: var(--admin-text-muted);
	}

	.detail-pricing {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-size: 0.85rem;
		color: var(--admin-text-muted);
	}

	.detail-body-text {
		white-space: pre-wrap;
		line-height: 1.6;
		font-size: 0.85rem;
		color: var(--admin-text);
		max-height: 300px;
		overflow-y: auto;
		padding: 12px 0;
	}

	.signed-note {
		font-size: 0.82rem;
		color: var(--status-sage);
		margin-left: auto;
	}
</style>
