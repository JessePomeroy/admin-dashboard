<script lang="ts">
import { useQuery, useConvexClient } from "@mmailaender/convex-svelte";
import { getAdminConfig } from "../config";
import FeatureGate from "../components/FeatureGate.svelte";
import LoadingState from "../components/LoadingState.svelte";
import { CLIENT_STATUSES } from "../constants";
import type { ActivityLogEntry, Client, ClientTag } from "../types";
import { addToast } from "../toast";
import { toId } from "../utils";
import ClientCreateModal from "./crm/ClientCreateModal.svelte";
import ClientDetailModal from "./crm/ClientDetailModal.svelte";
import ClientTable from "./crm/ClientTable.svelte";
import TagManager from "./crm/TagManager.svelte";

const config = getAdminConfig();
const { api } = config;

let { data } = $props();

const client = useConvexClient();
const clientsQuery = useQuery(api.crm.listClients, { siteUrl: config.siteUrl });
const statsQuery = useQuery(api.crm.getStats, { siteUrl: config.siteUrl });
const tagsQuery = useQuery(api.tags.listTags, { siteUrl: config.siteUrl });

let clients = $derived(clientsQuery.data ?? []);
let stats = $derived(statsQuery.data ?? { total: 0, leads: 0, booked: 0, inProgress: 0, completed: 0, photography: 0, web: 0 });
let tags = $derived(tagsQuery.data ?? []);
let isLoading = $derived(clientsQuery.isLoading || statsQuery.isLoading || tagsQuery.isLoading);

// Filter state
let categoryFilter = $state("all");
let statusFilter = $state("all");
let tagFilter = $state("all");
let searchQuery = $state("");

// Modal state
let showAddModal = $state(false);
let selectedClient = $state<Client | null>(null);
let showTagManager = $state(false);
let saving = $state(false);

// Detail modal data
let clientTags = $state<ClientTag[]>([]);
let clientActivity = $state<ActivityLogEntry[]>([]);
let loadingTags = $state(false);
let loadingActivity = $state(false);

// Tag assignments cache: clientId -> tags
let tagAssignments = $state<Record<string, ClientTag[]>>({});

let filteredClients = $derived(
	clients.filter((c: Client) => {
		if (categoryFilter !== "all" && c.category !== categoryFilter)
			return false;
		if (statusFilter !== "all" && c.status !== statusFilter) return false;
		if (tagFilter !== "all") {
			const assignments = tagAssignments[c._id];
			if (!assignments || !assignments.some((t) => t._id === tagFilter))
				return false;
		}
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			if (
				!c.name?.toLowerCase().includes(q) &&
				!c.email?.toLowerCase().includes(q)
			)
				return false;
		}
		return true;
	}),
);

// Load tags for all clients when client list changes
async function loadAllClientTags() {
	for (const c of clients) {
		try {
			const result = await client.query(api.tags.getClientTags, { clientId: c._id });
			tagAssignments[c._id] = result || [];
		} catch (err) {
			console.warn("Failed to load tags for client:", c._id, err);
		}
	}
	tagAssignments = { ...tagAssignments };
}

$effect(() => {
	if (clients.length > 0) {
		loadAllClientTags();
	}
});

async function loadClientTags(clientId: string) {
	loadingTags = true;
	try {
		const result = await client.query(api.tags.getClientTags, { clientId: toId(clientId) });
		clientTags = result || [];
		tagAssignments[clientId] = clientTags;
		tagAssignments = { ...tagAssignments };
	} catch (err) {
		console.error("Failed to load client tags:", err);
	} finally {
		loadingTags = false;
	}
}

async function loadClientActivity(clientId: string) {
	loadingActivity = true;
	try {
		const result = await client.query(api.activityLog.getClientActivity, { clientId: toId(clientId) });
		clientActivity = result || [];
	} catch (err) {
		console.error("Failed to load client activity:", err);
	} finally {
		loadingActivity = false;
	}
}

async function openDetailModal(c: Client) {
	selectedClient = { ...c } as Client;
	await Promise.all([
		loadClientTags(c._id),
		loadClientActivity(c._id),
	]);
}

function closeDetailModal() {
	selectedClient = null;
	clientTags = [];
	clientActivity = [];
}

async function saveNewClient(body: Record<string, string | undefined>) {
	saving = true;
	try {
		await client.mutation(api.crm.createClient, {
			siteUrl: config.siteUrl,
			name: body.name!,
			email: body.email || undefined,
			phone: body.phone || undefined,
			category: body.category as "photography" | "web",
			type: body.type || undefined,
			source: body.source || undefined,
			notes: body.notes || undefined,
			siteUrl_client: body.siteUrl_client || undefined,
		});
		showAddModal = false;
	} catch (err) {
		console.error("Failed to create client:", err);
		addToast("Failed to create client. Please try again.");
	} finally {
		saving = false;
	}
}

async function saveEdit(body: Record<string, string | undefined>) {
	if (!selectedClient) return;
	saving = true;
	try {
		await client.mutation(api.crm.updateClient, {
			clientId: toId(selectedClient._id),
			siteUrl: config.siteUrl,
			name: body.name,
			email: body.email,
			phone: body.phone,
			category: body.category as "photography" | "web" | undefined,
			type: body.type,
			status: body.status,
			source: body.source,
			notes: body.notes,
			siteUrl_client: body.siteUrl_client,
		});
		selectedClient = { ...selectedClient, ...body } as Client;
		await loadClientActivity(selectedClient._id);
	} catch (err) {
		console.error("Failed to update client:", err);
		addToast("Failed to save changes. Please try again.");
	} finally {
		saving = false;
	}
}

async function deleteClient() {
	if (!selectedClient) return;
	saving = true;
	try {
		await client.mutation(api.crm.deleteClient, {
			clientId: toId(selectedClient._id),
			siteUrl: config.siteUrl,
		});
		closeDetailModal();
	} catch (err) {
		console.error("Failed to delete client:", err);
		addToast("Failed to delete client. Please try again.");
	} finally {
		saving = false;
	}
}

async function quickStatusUpdate(newStatus: string) {
	if (!selectedClient) return;
	try {
		await client.mutation(api.crm.updateClient, {
			clientId: toId(selectedClient._id),
			siteUrl: config.siteUrl,
			status: newStatus,
		});
		selectedClient = { ...selectedClient, status: newStatus } as Client;
		await loadClientActivity(selectedClient._id);
	} catch (err) {
		console.error("Failed to update status:", err);
		addToast("Failed to update status. Please try again.");
	}
}

async function assignTagToClient(tagId: string) {
	if (!selectedClient) return;
	try {
		await client.mutation(api.tags.assignTag, {
			siteUrl: config.siteUrl,
			clientId: toId(selectedClient._id),
			tagId: toId(tagId),
		});
		await loadClientTags(selectedClient._id);
		await loadClientActivity(selectedClient._id);
	} catch (err) {
		console.error("Failed to assign tag:", err);
		addToast("Failed to assign tag.");
	}
}

async function removeTagFromClient(tagId: string) {
	if (!selectedClient) return;
	try {
		await client.mutation(api.tags.removeTag, {
			siteUrl: config.siteUrl,
			clientId: toId(selectedClient._id),
			tagId: toId(tagId),
		});
		await loadClientTags(selectedClient._id);
		await loadClientActivity(selectedClient._id);
	} catch (err) {
		console.error("Failed to remove tag:", err);
		addToast("Failed to remove tag.");
	}
}

async function createTag(name: string, color: string) {
	saving = true;
	try {
		await client.mutation(api.tags.createTag, {
			siteUrl: config.siteUrl,
			name,
			color,
		});
	} catch (err) {
		console.error("Failed to create tag:", err);
		addToast("Failed to create tag.");
	} finally {
		saving = false;
	}
}

async function deleteTag(tagId: string) {
	try {
		await client.mutation(api.tags.deleteTag, {
			tagId: toId(tagId),
		});
		for (const cId of Object.keys(tagAssignments)) {
			tagAssignments[cId] = tagAssignments[cId].filter(
				(t) => t._id !== tagId,
			);
		}
		tagAssignments = { ...tagAssignments };
	} catch (err) {
		console.error("Failed to delete tag:", err);
		addToast("Failed to delete tag.");
	}
}

function formatStatus(status: string) {
	return status
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}
</script>

<FeatureGate feature="crm" tier={data.tier}>
{#if isLoading}
	<LoadingState />
{:else}
<div class="crm-page">
	<header class="page-header">
		<div class="header-left">
			<h1>clients</h1>
		</div>
		<button class="btn-add" onclick={() => { showAddModal = true; }}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
			add client
		</button>
	</header>

	<div class="stats-line">
		<span>{stats.total} total</span>
		<span class="stat-sep">&middot;</span>
		<span>{stats.leads} leads</span>
		<span class="stat-sep">&middot;</span>
		<span>{stats.booked} booked</span>
		<span class="stat-sep">&middot;</span>
		<span>{stats.inProgress} in progress</span>
		<span class="stat-sep">&middot;</span>
		<span>{stats.completed} completed</span>
		<span class="stat-sep">&middot;</span>
		<span>{stats.photography} photo</span>
		<span class="stat-sep">&middot;</span>
		<span>{stats.web} web</span>
	</div>

	<div class="filter-bar">
		<select class="filter-select" bind:value={categoryFilter}>
			<option value="all">all categories</option>
			<option value="photography">photography</option>
			<option value="web">web</option>
		</select>
		<select class="filter-select" bind:value={statusFilter}>
			<option value="all">all statuses</option>
			{#each CLIENT_STATUSES as s}
				<option value={s}>{formatStatus(s)}</option>
			{/each}
		</select>
		{#if tags.length > 0}
			<select class="filter-select" bind:value={tagFilter}>
				<option value="all">all tags</option>
				{#each tags as tag (tag._id)}
					<option value={tag._id}>{tag.name}</option>
				{/each}
			</select>
		{/if}
		<input class="filter-search" type="text" placeholder="search by name or email..." bind:value={searchQuery} />
		<button class="btn-manage-tags" onclick={() => { showTagManager = true; }}>manage tags</button>
	</div>

	<ClientTable clients={filteredClients} {tagAssignments} onselect={openDetailModal} />
</div>

{#if showAddModal}
	<ClientCreateModal {saving} onsave={saveNewClient} onclose={() => { showAddModal = false; }} />
{/if}

{#if selectedClient}
	<ClientDetailModal
		client={selectedClient}
		{clientTags}
		{clientActivity}
		availableTags={tags}
		{loadingTags}
		{loadingActivity}
		{saving}
		onclose={closeDetailModal}
		onsave={saveEdit}
		ondelete={deleteClient}
		onstatuschange={quickStatusUpdate}
		ontagassign={assignTagToClient}
		ontagremove={removeTagFromClient}
	/>
{/if}

{#if showTagManager}
	<TagManager tags={tags} {saving} oncreate={createTag} ondelete={deleteTag} onclose={() => { showTagManager = false; }} />
{/if}
{/if}
</FeatureGate>

<style>
	.crm-page {
		padding: 48px 40px;
		max-width: 1200px;
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 24px;
		gap: 1rem;
	}

	.page-header h1 {
		font-family: "Chillax", sans-serif;
		font-size: 1.8rem;
		font-weight: 500;
		color: var(--admin-heading);
		margin: 0;
		letter-spacing: -0.01em;
	}

	.btn-add {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 14px;
		background: transparent;
		color: var(--admin-text);
		border: 1px solid var(--admin-border-strong);
		border-radius: 6px;
		font-size: 0.82rem;
		font-family: "Synonym", system-ui, sans-serif;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
		white-space: nowrap;
	}

	.btn-add:hover {
		color: var(--admin-heading);
		border-color: var(--admin-text-muted);
	}

	.stats-line {
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 24px;
		font-size: 0.82rem;
		color: var(--admin-text-muted);
	}

	.stat-sep {
		color: var(--admin-text-subtle);
	}

	.filter-bar {
		display: flex;
		gap: 10px;
		margin-bottom: 24px;
		flex-wrap: wrap;
		align-items: center;
	}

	.filter-select,
	.filter-search {
		padding: 7px 12px;
		background: transparent;
		color: var(--admin-text);
		border: 1px solid var(--admin-border-strong);
		border-radius: 6px;
		font-size: 0.83rem;
		font-family: "Synonym", system-ui, sans-serif;
		outline: none;
		transition: border-color 0.15s;
	}

	.filter-select:focus,
	.filter-search:focus {
		border-color: var(--admin-accent);
	}

	.filter-search {
		flex: 1;
		min-width: 180px;
	}

	.btn-manage-tags {
		padding: 7px 12px;
		background: transparent;
		color: var(--admin-text-muted);
		border: 1px solid var(--admin-border);
		border-radius: 6px;
		font-size: 0.78rem;
		font-family: "Synonym", system-ui, sans-serif;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
		white-space: nowrap;
	}

	.btn-manage-tags:hover {
		color: var(--admin-text);
		border-color: var(--admin-border-strong);
	}

	@media (max-width: 768px) {
		.crm-page {
			padding: 20px 16px;
		}

		.page-header {
			flex-direction: column;
		}

		.btn-add {
			align-self: flex-start;
		}

		.stats-line {
			flex-direction: column;
			gap: 4px;
		}

		.stat-sep {
			display: none;
		}

		.filter-bar {
			flex-direction: column;
		}

		.filter-search {
			min-width: unset;
		}
	}
</style>
