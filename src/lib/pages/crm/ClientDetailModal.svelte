<script lang="ts">
import AdminModal from "../../components/AdminModal.svelte";
import { CLIENT_STATUSES } from "../../constants";
import type {
	ActivityLogEntry,
	Client,
	ClientTag,
} from "../../types";
import {
	CATEGORY_COLORS,
	CLIENT_STATUS_COLORS,
	formatDate,
	formatStatus,
	getStatusColor,
} from "../../utils";
import ActivityTimeline from "./ActivityTimeline.svelte";
import ClientEditForm from "./ClientEditForm.svelte";

interface Props {
	client: Client;
	clientTags: ClientTag[];
	clientActivity: ActivityLogEntry[];
	availableTags: ClientTag[];
	loadingTags: boolean;
	loadingActivity: boolean;
	saving: boolean;
	onclose: () => void;
	onsave: (data: Record<string, string | undefined>) => void;
	ondelete: () => void;
	onstatuschange: (status: string) => void;
	ontagassign: (tagId: string) => void;
	ontagremove: (tagId: string) => void;
}

let {
	client,
	clientTags,
	clientActivity,
	availableTags,
	loadingTags,
	loadingActivity,
	saving,
	onclose,
	onsave,
	ondelete,
	onstatuschange,
	ontagassign,
	ontagremove,
}: Props = $props();

let editMode = $state(false);
let confirmDelete = $state(false);
let showTagPicker = $state(false);

function formatType(type: string) {
	return type.charAt(0).toUpperCase() + type.slice(1);
}

function getCategoryColor(category: string): string {
	return getStatusColor(CATEGORY_COLORS, category);
}

function getClientStatusColor(status: string): string {
	return getStatusColor(CLIENT_STATUS_COLORS, status);
}

function fmtDate(timestamp: number) {
	return formatDate(new Date(timestamp).toISOString());
}

let unassignedTags = $derived(
	availableTags.filter((t) => !clientTags.some((ct) => ct._id === t._id)),
);

function handleSave(data: Record<string, string | undefined>) {
	onsave(data);
	editMode = false;
}
</script>

<AdminModal title={editMode ? "edit client" : client.name} onclose={onclose} size="wide">
	{#if editMode}
		<ClientEditForm {client} {saving} onsave={handleSave} oncancel={() => { editMode = false; }} />
	{:else}
		<div class="detail-body">
			<div class="detail-meta-line">
				<span class="category-indicator" style="color: {getCategoryColor(client.category)}">{client.category === "photography" ? "photography" : "web"}</span>
				<span class="meta-sep">&middot;</span>
				<span class="status-indicator">
					<span class="status-dot" style="background: {getClientStatusColor(client.status)}"></span>
					{formatStatus(client.status)}
				</span>
				{#if client.type}
					<span class="meta-sep">&middot;</span>
					<span class="detail-type">{formatType(client.type)}</span>
				{/if}
			</div>

			<!-- Tags section -->
			<div class="detail-tags-section">
				<div class="detail-tags-header">
					<span class="detail-label">tags</span>
					<button class="btn-tag-toggle" onclick={() => { showTagPicker = !showTagPicker; }}>
						{showTagPicker ? "done" : "+ add"}
					</button>
				</div>
				{#if loadingTags}
					<span class="loading-text">loading...</span>
				{:else}
					<div class="detail-tags-list">
						{#each clientTags as tag (tag._id)}
							<span class="detail-tag">
								<span class="tag-dot-inline" style="background: {tag.color || '#818cf8'}"></span>
								{tag.name}
								<button class="tag-remove-btn" onclick={() => ontagremove(tag._id)} aria-label="Remove tag {tag.name}">&times;</button>
							</span>
						{/each}
						{#if clientTags.length === 0 && !showTagPicker}
							<span class="no-tags-text">no tags</span>
						{/if}
					</div>
					{#if showTagPicker}
						<div class="tag-picker">
							{#each unassignedTags as tag (tag._id)}
								<button class="tag-picker-item" onclick={() => ontagassign(tag._id)}>
									<span class="tag-dot-inline" style="background: {tag.color || '#818cf8'}"></span>
									{tag.name}
								</button>
							{/each}
							{#if unassignedTags.length === 0}
								<span class="no-tags-text">all tags assigned</span>
							{/if}
						</div>
					{/if}
				{/if}
			</div>

			<div class="detail-fields">
				{#if client.email}
					<div class="detail-field">
						<span class="detail-label">email</span>
						<span class="detail-value">{client.email}</span>
					</div>
				{/if}
				{#if client.phone}
					<div class="detail-field">
						<span class="detail-label">phone</span>
						<span class="detail-value">{client.phone}</span>
					</div>
				{/if}
				{#if client.source}
					<div class="detail-field">
						<span class="detail-label">source</span>
						<span class="detail-value">{client.source}</span>
					</div>
				{/if}
				{#if client.siteUrl_client}
					<div class="detail-field">
						<span class="detail-label">client website</span>
						<a class="detail-link" href={client.siteUrl_client} target="_blank" rel="noopener noreferrer">{client.siteUrl_client}</a>
					</div>
				{/if}
				<div class="detail-field">
					<span class="detail-label">added</span>
					<span class="detail-value">{fmtDate(client._creationTime)}</span>
				</div>
				{#if client.notes}
					<div class="detail-field">
						<span class="detail-label">notes</span>
						<span class="detail-value detail-notes">{client.notes}</span>
					</div>
				{/if}
			</div>

			<div class="detail-status-row">
				<span class="detail-label">quick status</span>
				<div class="status-buttons">
					{#each CLIENT_STATUSES as s}
						<button
							class="status-btn"
							class:active={client.status === s}
							style={client.status === s ? `color: ${getClientStatusColor(s)}; border-color: ${getClientStatusColor(s)}` : ''}
							onclick={() => onstatuschange(s)}
						>
							{formatStatus(s)}
						</button>
					{/each}
				</div>
			</div>

			<ActivityTimeline entries={clientActivity} loading={loadingActivity} />

			<div class="modal-actions detail-actions">
				{#if confirmDelete}
					<span class="confirm-text">delete this client?</span>
					<button class="btn-danger" onclick={ondelete} disabled={saving}>
						{saving ? "deleting..." : "yes, delete"}
					</button>
					<button class="btn-cancel" onclick={() => { confirmDelete = false; }}>no</button>
				{:else}
					<button class="btn-danger-outline" onclick={() => { confirmDelete = true; }}>delete</button>
					<button class="btn-save" onclick={() => { editMode = true; }}>edit</button>
				{/if}
			</div>
		</div>
	{/if}
</AdminModal>

<style>
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding-top: 6px;
	}

	.btn-cancel,
	.btn-save,
	.btn-danger,
	.btn-danger-outline {
		padding: 7px 16px;
		border-radius: 6px;
		font-size: 0.82rem;
		font-family: "Synonym", system-ui, sans-serif;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s, opacity 0.15s;
		border: 1px solid transparent;
	}

	.btn-cancel {
		background: transparent;
		color: var(--admin-text-muted);
		border-color: var(--admin-border-strong);
	}

	.btn-cancel:hover {
		color: var(--admin-text);
	}

	.btn-save {
		background: rgba(129, 140, 248, 0.15);
		border-color: rgba(129, 140, 248, 0.25);
		color: var(--admin-accent-hover);
		font-weight: 500;
	}

	.btn-save:hover {
		background: rgba(129, 140, 248, 0.22);
	}

	.btn-save:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-danger {
		background: rgba(248, 113, 113, 0.15);
		border-color: rgba(248, 113, 113, 0.3);
		color: var(--status-rose);
	}

	.btn-danger:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-danger-outline {
		background: transparent;
		color: var(--status-rose);
		border-color: rgba(248, 113, 113, 0.25);
	}

	.btn-danger-outline:hover {
		background: rgba(248, 113, 113, 0.08);
	}

	/* Detail view */
	.detail-body {
		padding: 0 28px 28px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.detail-meta-line {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.85rem;
	}

	.meta-sep {
		color: var(--admin-text-subtle);
	}

	.category-indicator {
		font-size: 0.8rem;
		font-weight: 400;
	}

	.status-indicator {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.8rem;
		color: var(--admin-text-muted);
	}

	.status-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.detail-type {
		color: var(--admin-text-muted);
	}

	/* Tags in detail */
	.detail-tags-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.detail-tags-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.btn-tag-toggle {
		background: none;
		border: none;
		color: var(--admin-accent);
		font-size: 0.76rem;
		font-family: "Synonym", system-ui, sans-serif;
		cursor: pointer;
		padding: 2px 6px;
		border-radius: 4px;
		transition: background 0.15s;
	}

	.btn-tag-toggle:hover {
		background: rgba(129, 140, 248, 0.1);
	}

	.detail-tags-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}

	.detail-tag {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 0.78rem;
		color: var(--admin-text);
	}

	.tag-dot-inline {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.tag-remove-btn {
		background: none;
		border: none;
		color: var(--admin-text-subtle);
		cursor: pointer;
		font-size: 0.85rem;
		padding: 0 2px;
		line-height: 1;
		transition: color 0.15s;
	}

	.tag-remove-btn:hover {
		color: var(--status-rose);
	}

	.no-tags-text,
	.loading-text {
		font-size: 0.76rem;
		color: var(--admin-text-subtle);
	}

	.tag-picker {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding-top: 4px;
		border-top: 1px solid var(--admin-border);
	}

	.tag-picker-item {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 8px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--admin-border);
		border-radius: 4px;
		color: var(--admin-text-muted);
		font-size: 0.76rem;
		font-family: "Synonym", system-ui, sans-serif;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
	}

	.tag-picker-item:hover {
		border-color: var(--admin-border-strong);
		color: var(--admin-text);
	}

	.detail-fields {
		display: flex;
		flex-direction: column;
		gap: 12px;
		border-top: 1px solid var(--admin-border);
		padding-top: 16px;
	}

	.detail-field {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.detail-label {
		font-size: 0.72rem;
		color: var(--admin-text-subtle);
		letter-spacing: 0.04em;
		font-weight: 400;
	}

	.detail-value {
		font-size: 0.88rem;
		color: var(--admin-heading);
	}

	.detail-notes {
		white-space: pre-wrap;
		line-height: 1.5;
	}

	.detail-link {
		font-size: 0.88rem;
		color: var(--admin-accent);
		text-decoration: none;
	}

	.detail-link:hover {
		text-decoration: underline;
	}

	.detail-status-row {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 4px;
	}

	.status-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.status-btn {
		padding: 4px 10px;
		border-radius: 5px;
		font-size: 0.72rem;
		font-family: "Synonym", system-ui, sans-serif;
		cursor: pointer;
		background: transparent;
		color: var(--admin-text-muted);
		border: 1px solid var(--admin-border);
		transition: all 0.15s;
	}

	.status-btn:hover {
		border-color: var(--admin-border-strong);
		color: var(--admin-text);
	}

	.status-btn.active {
		background: rgba(255, 255, 255, 0.05);
	}

	.detail-actions {
		border-top: 1px solid var(--admin-border);
		padding-top: 16px;
	}

	.confirm-text {
		font-size: 0.82rem;
		color: var(--status-rose);
		margin-right: auto;
		align-self: center;
	}

	@media (max-width: 768px) {
		.detail-body {
			padding: 0 20px 20px;
		}
	}
</style>
