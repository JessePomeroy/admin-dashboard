<script lang="ts">
import type { ActivityLogEntry } from "../../types";
import { relativeTime } from "../../utils";

interface Props {
	entries: ActivityLogEntry[];
	loading: boolean;
	onitemclick?: (docType: string, docId: string) => void;
}

let { entries, loading, onitemclick }: Props = $props();

function getActivityIcon(action: string): string {
	const icons: Record<string, string> = {
		client_created: "\u2022",
		status_changed: "\u25CB",
		invoice_created: "\u25A1",
		invoice_sent: "\u25B7",
		invoice_paid: "\u2713",
		quote_created: "\u25A1",
		quote_sent: "\u25B7",
		quote_accepted: "\u2713",
		contract_created: "\u25A1",
		contract_sent: "\u25B7",
		contract_signed: "\u2713",
		tag_added: "+",
		tag_removed: "\u2212",
		note_added: "\u266A",
	};
	return icons[action] || "\u2022";
}

function parseMetadata(entry: ActivityLogEntry): { docType: string; docId: string } | null {
	if (!entry.metadata) return null;
	try {
		const parsed = JSON.parse(entry.metadata);
		if (parsed.docType && parsed.docId) return parsed;
	} catch { /* ignore malformed metadata */ }
	return null;
}

function handleClick(entry: ActivityLogEntry) {
	const meta = parseMetadata(entry);
	if (meta && onitemclick) {
		onitemclick(meta.docType, meta.docId);
	}
}
</script>

<div class="activity-section">
	<span class="detail-label">activity</span>
	{#if loading}
		<span class="loading-text">loading...</span>
	{:else if entries.length === 0}
		<span class="no-activity-text">no activity yet</span>
	{:else}
		<div class="activity-list">
			{#each entries as entry (entry._id)}
				{@const clickable = !!parseMetadata(entry) && !!onitemclick}
				<button
					class="activity-entry"
					class:clickable
					disabled={!clickable}
					onclick={() => handleClick(entry)}
				>
					<span class="activity-icon">{getActivityIcon(entry.action)}</span>
					<span class="activity-desc">{entry.description}</span>
					<span class="activity-time">{relativeTime(entry._creationTime)}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.activity-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
		border-top: 1px solid var(--admin-border);
		padding-top: 16px;
	}

	.detail-label {
		font-size: 0.72rem;
		color: var(--admin-text-subtle);
		letter-spacing: 0.04em;
		font-weight: 400;
	}

	.loading-text,
	.no-activity-text {
		font-size: 0.76rem;
		color: var(--admin-text-subtle);
	}

	.activity-list {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.activity-entry {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 8px 0;
		border: none;
		border-bottom: 1px solid var(--admin-border);
		background: none;
		font-family: inherit;
		font-size: 0.8rem;
		text-align: left;
		width: 100%;
		cursor: default;
	}

	.activity-entry:last-child {
		border-bottom: none;
	}

	.activity-entry.clickable {
		cursor: pointer;
	}

	.activity-entry.clickable:hover .activity-desc {
		color: var(--admin-accent);
	}

	.activity-icon {
		color: var(--admin-text-subtle);
		font-size: 0.85rem;
		flex-shrink: 0;
		width: 14px;
		text-align: center;
	}

	.activity-desc {
		color: var(--admin-text-muted);
		flex: 1;
		transition: color 0.12s;
	}

	.activity-time {
		color: var(--admin-text-subtle);
		font-size: 0.72rem;
		white-space: nowrap;
		flex-shrink: 0;
	}
</style>
