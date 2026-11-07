<script lang="ts">
import StatusDot from "../../components/StatusDot.svelte";
import type { InquiryUI } from "../../types";
import {
	formatDateTime,
	getStatusColor,
	INQUIRY_STATUS_COLORS,
} from "../../utils";

interface Props {
	inquiries: InquiryUI[];
	followUpEnabled?: boolean;
	onview: (inquiry: InquiryUI) => void;
}

let { inquiries, onview, followUpEnabled = false }: Props = $props();

function truncate(text: string, len = 60): string {
	if (!text) return "\u2014";
	return text.length > len ? `${text.slice(0, len)}...` : text;
}
</script>

<div class="table-wrap">
	<!-- svelte-ignore a11y_no_redundant_roles (Explicit roles retain table semantics when phone rows reflow into a grid.) -->
	<table class="data-table data-table--hoverable inquiries-table" role="table">
		<thead role="rowgroup">
			<tr role="row">
				<th scope="col">date</th>
				<th scope="col">name</th>
				<th scope="col">email</th>
				<th scope="col">subject</th>
				<th scope="col">preview</th>
				<th scope="col">status</th>
				{#if followUpEnabled}<th scope="col">follow-up</th>{/if}
				<th scope="col"></th>
			</tr>
		</thead>
		<tbody role="rowgroup">
			{#each inquiries as inq (inq._id)}
				<tr class:unread={inq.status === "new"} role="row">
					<td class="date-cell nowrap" role="cell">{formatDateTime(inq.submittedAt)}</td>
					<td class="name-cell" role="cell">{inq.name || "\u2014"}</td>
					<td class="email-cell" role="cell">{inq.email || "\u2014"}</td>
					<td class="subject-cell" role="cell"><span class="mobile-label" aria-hidden="true">subject</span>{inq.subject || "\u2014"}</td>
					<td class="preview-cell" role="cell">{truncate(inq.message ?? "")}</td>
					<td class="status-cell" role="cell">
						<span class="mobile-label" aria-hidden="true">status</span>
						<StatusDot color={getStatusColor(INQUIRY_STATUS_COLORS, inq.status)} label={inq.status || "new"} />
					</td>
					{#if followUpEnabled}<td class="follow-up-cell" role="cell"><span class="mobile-label" aria-hidden="true">follow-up</span>{inq.followUpDate || (inq.followUpCompletedAt ? "completed" : "—")}</td>{/if}
					<td class="action-cell" role="cell">
						<button type="button" class="view-btn" onclick={() => onview(inq)}>view</button>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	@import "../../styles/data-table.css";

	.inquiries-table td {
		color: var(--admin-text);
	}

	.inquiries-table tbody tr.unread td {
		color: var(--admin-heading);
		font-weight: 500;
	}

	.nowrap {
		white-space: nowrap;
	}

	.email-cell {
		font-size: 0.82rem;
		color: var(--admin-text-muted);
	}

	.preview-cell {
		color: var(--admin-text-muted);
		max-width: 250px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mobile-label {
		display: none;
	}

	.view-btn {
		padding: 4px 12px;
		background: transparent;
		border: 1px solid var(--admin-border-strong);
		border-radius: 5px;
		color: var(--admin-text-muted);
		font-size: 0.76rem;
		font-family: "Synonym", system-ui, sans-serif;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
	}

	.view-btn:hover {
		color: var(--admin-accent-hover);
		border-color: var(--admin-accent);
	}

	.view-btn:focus-visible {
		outline: 2px solid var(--admin-accent);
		outline-offset: 3px;
	}

	@media (max-width: 768px) {
		.inquiries-table,
		.inquiries-table tbody {
			display: block;
		}

		.inquiries-table thead {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}

		.inquiries-table tbody tr {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			gap: 10px 16px;
			padding: 20px 0;
			border-bottom: 1px solid var(--admin-border);
		}

		.inquiries-table tbody tr td {
			display: block;
			grid-column: 1 / -1;
			min-width: 0;
			max-width: none;
			padding: 0;
			border: 0;
			white-space: normal;
			overflow-wrap: anywhere;
		}

		.inquiries-table tbody tr .status-cell,
		.inquiries-table tbody tr .follow-up-cell {
			grid-column: auto;
		}

		.inquiries-table tbody tr .date-cell,
		.inquiries-table tbody tr .preview-cell {
			color: var(--admin-text-muted);
			font-size: 0.82rem;
		}

		.name-cell {
			font-weight: 500;
		}

		.mobile-label {
			display: block;
			margin-bottom: 4px;
			color: var(--admin-text-subtle);
			font-size: 0.78rem;
			font-weight: 400;
		}

		.view-btn {
			width: 100%;
			min-height: 44px;
			margin-top: 2px;
		}
	}
</style>
