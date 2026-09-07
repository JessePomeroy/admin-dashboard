<script module lang="ts">
let nextPageRequestId = 0;
</script>

<script lang="ts">
import { goto } from "$app/navigation";
import { useQuery } from "convex-svelte";
import type { PaginationResult } from "convex/server";
import { useAdminClient } from "../adminClient";
import { getAdminConfig } from "../config";
import FeatureGate from "../components/FeatureGate.svelte";
import LoadingState from "../components/LoadingState.svelte";
import { CLIENT_STATUSES } from "../constants";
import type { ActivityLogEntry, Client, ClientTag, ClientWithTags } from "../types";
import { addToast } from "../toast";
import { logger } from "../logger";
import { toId } from "../utils";
import ClientCreateModal from "./crm/ClientCreateModal.svelte";
import ClientDetailModal from "./crm/ClientDetailModal.svelte";
import ClientTable from "./crm/ClientTable.svelte";
import TagManager from "./crm/TagManager.svelte";

const config = getAdminConfig();
const { api } = config;

let { data } = $props();

// Filter state
let categoryFilter = $state("all");
let statusFilter = $state("all");
let tagFilter = $state("all");
let searchQuery = $state("");

const client = useAdminClient();
let pageCursors = $state<(string | null)[]>([null]);
let pageVersion = $state(0);
let clientsPage = $state<PaginationResult<ClientWithTags> | null>(null);
let loadingClients = $state(true);
let clientsError = $state(false);

// Snapshot pages avoid the installed experimental client's later-page split bug
// and reactive pagination journals growing the joined read beyond its row budget.
$effect(() => {
	const args = {
		siteUrl: config.siteUrl,
		...(categoryFilter === "all" ? {} : { category: categoryFilter }),
		...(statusFilter === "all" ? {} : { status: statusFilter }),
		paginationOpts: { cursor: pageCursors[pageCursors.length - 1], numItems: 50, id: nextPageRequestId++ },
	};
	pageVersion;
	let active = true;
	loadingClients = true;
	clientsError = false;
	clientsPage = null;
	void client.query(api.crm.listClientsWithTags, args).then((page) => {
		if (active) clientsPage = page;
	}).catch(() => {
		if (active) clientsError = true;
	}).finally(() => {
		if (active) loadingClients = false;
	});
	return () => { active = false; };
});

function refreshClients() { pageVersion += 1; }
const statsQuery = useQuery(api.crm.getStats, { siteUrl: config.siteUrl });
const tagsQuery = useQuery(api.tags.listTags, { siteUrl: config.siteUrl });

let clients = $derived(clientsPage?.page ?? []);
let stats = $derived(statsQuery.data ?? { total: 0, leads: 0, booked: 0, inProgress: 0, completed: 0, photography: 0, web: 0 });
let countPrefix = $derived(stats.truncated === true ? "at least " : "");
let tags = $derived(tagsQuery.data ?? []);
let isLoading = $derived(statsQuery.isLoading || tagsQuery.isLoading);

// Modal state
let showAddModal = $state(false);
let selectedClient = $state<Client | null>(null);
let showTagManager = $state(false);
let saving = $state(false);

const clientTagsQuery = useQuery(api.tags.getClientTags,
	() => selectedClient ? { clientId: toId(selectedClient._id) } : "skip",
	{ keepPreviousData: false },
);
const clientActivityQuery = useQuery(api.activityLog.getClientActivity,
	() => selectedClient ? { clientId: toId(selectedClient._id) } : "skip",
	{ keepPreviousData: false },
);
let clientTags = $derived((clientTagsQuery.data ?? []) as ClientTag[]);
let clientActivity = $derived((clientActivityQuery.data ?? []) as ActivityLogEntry[]);
let loadingTags = $derived(clientTagsQuery.isLoading);
let loadingActivity = $derived(clientActivityQuery.isLoading);

let filteredClients = $derived(
	clients.filter((c) => {
		if (tagFilter !== "all") {
			if (!c.tags.some((tag) => tag._id === tagFilter))
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

function openDetailModal(c: Client) {
	selectedClient = { ...c };
}

function closeDetailModal() {
	selectedClient = null;
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
		refreshClients();
	} catch (err) {
		logger.error("Failed to create client:", err);
		addToast("Failed to create client. Please try again.");
	} finally {
		saving = false;
	}
}

async function saveEdit(body: Record<string, string | undefined>) {
	const target = selectedClient;
	if (!target) return;
	saving = true;
	try {
		await client.mutation(api.crm.updateClient, {
			clientId: toId(target._id),
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
		if (selectedClient?._id === target._id) selectedClient = { ...selectedClient, ...body } as Client;
		refreshClients();
	} catch (err) {
		logger.error("Failed to update client:", err);
		addToast("Failed to save changes. Please try again.");
	} finally {
		saving = false;
	}
}

async function deleteClient() {
	const target = selectedClient;
	if (!target) return;
	saving = true;
	try {
		await client.mutation(api.crm.deleteClient, {
			clientId: toId(target._id),
			siteUrl: config.siteUrl,
		});
		if (selectedClient?._id === target._id) closeDetailModal();
		refreshClients();
	} catch (err) {
		logger.error("Failed to delete client:", err);
		addToast("Failed to delete client. Please try again.");
	} finally {
		saving = false;
	}
}

async function quickStatusUpdate(newStatus: string) {
	const target = selectedClient;
	if (!target) return;
	try {
		await client.mutation(api.crm.updateClient, {
			clientId: toId(target._id),
			siteUrl: config.siteUrl,
			status: newStatus,
		});
		if (selectedClient?._id === target._id) selectedClient = { ...selectedClient, status: newStatus } as Client;
		refreshClients();
	} catch (err) {
		logger.error("Failed to update status:", err);
		addToast("Failed to update status. Please try again.");
	}
}

async function assignTagToClient(tagId: string) {
	const target = selectedClient;
	if (!target) return;
	try {
		await client.mutation(api.tags.assignTag, {
			siteUrl: config.siteUrl,
			clientId: toId(target._id),
			tagId: toId(tagId),
		});
		refreshClients();
	} catch (err) {
		logger.error("Failed to assign tag:", err);
		addToast("Failed to assign tag.");
	}
}

async function removeTagFromClient(tagId: string) {
	const target = selectedClient;
	if (!target) return;
	try {
		await client.mutation(api.tags.removeTag, {
			siteUrl: config.siteUrl,
			clientId: toId(target._id),
			tagId: toId(tagId),
		});
		refreshClients();
	} catch (err) {
		logger.error("Failed to remove tag:", err);
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
		logger.error("Failed to create tag:", err);
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
		refreshClients();
	} catch (err) {
		logger.error("Failed to delete tag:", err);
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

<FeatureGate feature="crm" adminSession={data.adminSession}>
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
		<span>{countPrefix}{stats.total} total</span>
		<span class="stat-sep">&middot;</span>
		<span>{countPrefix}{stats.leads} leads</span>
		<span class="stat-sep">&middot;</span>
		<span>{countPrefix}{stats.booked} booked</span>
		<span class="stat-sep">&middot;</span>
		<span>{countPrefix}{stats.inProgress} in progress</span>
		<span class="stat-sep">&middot;</span>
		<span>{countPrefix}{stats.completed} completed</span>
		<span class="stat-sep">&middot;</span>
		<span>{countPrefix}{stats.photography} photo</span>
		<span class="stat-sep">&middot;</span>
		<span>{countPrefix}{stats.web} web</span>
	</div>

	{#if stats.truncated === true}
		<p class="result-note">totals cover a limited set of clients; actual counts may be higher.</p>
	{/if}

	<div class="filter-bar">
		<select class="filter-select" aria-label="Client category" bind:value={categoryFilter} onchange={() => { pageCursors = [null]; }}>
			<option value="all">all categories</option>
			<option value="photography">photography</option>
			<option value="web">web</option>
		</select>
		<select class="filter-select" aria-label="Client status" bind:value={statusFilter} onchange={() => { pageCursors = [null]; }}>
			<option value="all">all statuses</option>
			{#each CLIENT_STATUSES as s}
				<option value={s}>{formatStatus(s)}</option>
			{/each}
		</select>
		{#if tags.length > 0}
			<select class="filter-select" aria-label="Client tag" bind:value={tagFilter}>
				<option value="all">all tags</option>
				{#each tags as tag (tag._id)}
					<option value={tag._id}>{tag.name}</option>
				{/each}
			</select>
		{/if}
		<input class="filter-search" type="text" placeholder="search by name or email..." bind:value={searchQuery} />
		<button class="btn-manage-tags" onclick={() => { showTagManager = true; }}>manage tags</button>
	</div>

	{#if clientsPage && (!clientsPage.isDone || pageCursors.length > 1)}
		<p class="result-note">page {pageCursors.length}: {clients.length} matching clients. search and tag filters apply to this page.</p>
	{/if}
	{#if clientsError}<p class="result-note" role="alert">could not load clients. please try again.</p>{/if}
	{#if loadingClients}<LoadingState />{:else}<ClientTable clients={filteredClients} onselect={openDetailModal} />{/if}
	{#if pageCursors.length > 1}
		<button class="btn-manage-tags" disabled={loadingClients} onclick={() => { pageCursors = pageCursors.slice(0, -1); }}>previous clients</button>
	{/if}
	{#if clientsPage && !clientsPage.isDone}
		<button class="btn-manage-tags" disabled={loadingClients} onclick={() => { if (clientsPage) pageCursors = [...pageCursors, clientsPage.continueCursor]; }}>next clients</button>
	{/if}
	<button class="btn-manage-tags" disabled={loadingClients} onclick={refreshClients}>refresh clients</button>
</div>

{#if showAddModal}
	<ClientCreateModal {saving} onsave={saveNewClient} onclose={() => { showAddModal = false; }} />
{/if}

{#if selectedClient}
	{#key selectedClient._id}
	<ClientDetailModal
		client={selectedClient}
		{clientTags}
		{clientActivity}
		availableTags={tags}
		{loadingTags}
		{loadingActivity}
		detailError={Boolean(clientTagsQuery.error || clientActivityQuery.error)}
		{saving}
		onclose={closeDetailModal}
		onsave={saveEdit}
		ondelete={deleteClient}
		onstatuschange={quickStatusUpdate}
		ontagassign={assignTagToClient}
		ontagremove={removeTagFromClient}
		onactivityclick={(docType, docId) => {
			const routes: Record<string, string> = {
				invoice: "/admin/invoicing",
				quote: "/admin/quotes",
				contract: "/admin/contracts",
			};
			const route = routes[docType];
			if (route) {
				selectedClient = null;
				goto(`${route}?open=${docId}`);
			}
		}}
	/>
	{/key}
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

	.result-note {
		font-size: 0.82rem;
		color: var(--admin-text-muted);
		margin: 0 0 24px;
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
		color: var(--admin-text);
		border: 1px solid var(--admin-border-strong);
		border-radius: 6px;
		font-size: 0.83rem;
		font-family: "Synonym", system-ui, sans-serif;
		outline: none;
		transition: border-color 0.15s;
	}

	.filter-select {
		background: var(--admin-dropdown-bg);
	}

	.filter-search {
		background: transparent;
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
