<script lang="ts">
import type { Client, ClientTag } from "../../types";
import {
	CATEGORY_COLORS,
	CLIENT_STATUS_COLORS,
	formatDate,
	formatStatus,
	getStatusColor,
} from "../../utils";

interface Props {
	clients: Client[];
	tagAssignments: Record<string, ClientTag[]>;
	onselect: (client: Client) => void;
}

let { clients, tagAssignments, onselect }: Props = $props();

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
</script>

{#if clients.length === 0}
	<div class="empty-state">no clients found</div>
{:else}
	<div class="table-wrap">
		<table class="data-table data-table--clickable data-table--nowrap client-table">
			<thead>
				<tr>
					<th scope="col">name</th>
					<th scope="col">email</th>
					<th scope="col">category</th>
					<th scope="col">type</th>
					<th scope="col">status</th>
					<th scope="col">source</th>
					<th scope="col">added</th>
				</tr>
			</thead>
			<tbody>
				{#each clients as client (client._id)}
					<tr
						class="client-row"
						role="button"
						tabindex="0"
						onclick={() => onselect(client)}
						onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onselect(client); } }}
					>
						<td class="td-name">
							<span class="name-with-tags">
								{client.name}
								{#if tagAssignments[client._id]?.length}
									<span class="tag-dots">
										{#each tagAssignments[client._id] as tag (tag._id)}
											<span class="tag-dot-inline" style="background: {tag.color || '#818cf8'}" title={tag.name}></span>
										{/each}
									</span>
								{/if}
							</span>
						</td>
						<td class="td-email">{client.email || "\u2014"}</td>
						<td>
							<span class="category-indicator" style="color: {getCategoryColor(client.category)}">
								{client.category === "photography" ? "photo" : "web"}
							</span>
						</td>
						<td class="td-type">{client.type ? formatType(client.type) : "\u2014"}</td>
						<td>
							<span class="status-indicator">
								<span class="status-dot" style="background: {getClientStatusColor(client.status)}"></span>
								{formatStatus(client.status)}
							</span>
						</td>
						<td class="td-source">{client.source || "\u2014"}</td>
						<td class="td-date">{fmtDate(client._creationTime)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	@import "../../styles/data-table.css";

	.td-name {
		font-weight: 500;
		color: var(--admin-heading);
	}

	.name-with-tags {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}

	.tag-dots {
		display: inline-flex;
		gap: 3px;
		align-items: center;
	}

	.tag-dot-inline {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.td-email {
		color: var(--admin-text-muted);
		font-size: 0.82rem;
	}

	.td-type,
	.td-source {
		color: var(--admin-text-muted);
	}

	.td-date {
		color: var(--admin-text-muted);
		font-size: 0.8rem;
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
</style>
