<script lang="ts">
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../adminClient";
import { getAdminConfig } from "../config";
import LoadingState from "../components/LoadingState.svelte";
import type { PlatformClient } from "../types";
import { formatTimestampDate } from "../utils";
import { addToast } from "../toast";
import { logger } from "../logger";
import AddClientModal from "./platform/AddClientModal.svelte";
import ClientDetailModal from "./platform/ClientDetailModal.svelte";

const config = getAdminConfig();
const { api } = config;

let { data } = $props();

const convexClient = useAdminClient();
const clientsQuery = useQuery(api.platform.listAll, {});

// Modal state
let showAddModal = $state(false);
let selectedClient = $state<PlatformClient | null>(null);
let saving = $state(false);

// Search
let searchQuery = $state("");

let clients = $derived((clientsQuery.data ?? []) as PlatformClient[]);

// Stats
let totalClients = $derived(clients.length);
let basicCount = $derived(
	clients.filter((c: PlatformClient) => c.tier === "basic").length,
);
let fullCount = $derived(
	clients.filter((c: PlatformClient) => c.tier === "full").length,
);
let activeCount = $derived(
	clients.filter((c: PlatformClient) => c.subscriptionStatus === "active").length,
);

let filteredClients = $derived(
	clients.filter((client: PlatformClient) => {
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			const matchName = client.name?.toLowerCase().includes(q);
			const matchEmail = client.email?.toLowerCase().includes(q);
			const matchSite = client.siteUrl?.toLowerCase().includes(q);
			if (!matchName && !matchEmail && !matchSite) return false;
		}
		return true;
	}),
);

function openAddModal() {
	showAddModal = true;
}

function closeAddModal() {
	showAddModal = false;
}

function openDetailModal(client: PlatformClient) {
	selectedClient = { ...client };
}

function closeDetailModal() {
	selectedClient = null;
}

function getSubscriptionColor(status: string): string {
	const colors: Record<string, string> = {
		active: "var(--status-sage)",
		canceled: "var(--status-rose)",
		past_due: "var(--status-amber)",
		none: "var(--admin-text-subtle)",
	};
	return colors[status] || "var(--admin-text-subtle)";
}

async function handleSaveNewClient(formData: {
	name: string;
	email: string;
	siteUrl: string;
	sanityProjectId?: string;
	tier: "basic" | "full";
	subscriptionStatus: string;
	adminEmails: string[];
	notes?: string;
}) {
	saving = true;
	try {
		await convexClient.mutation(api.platform.createClient, {
			name: formData.name,
			email: formData.email,
			siteUrl: formData.siteUrl,
			sanityProjectId: formData.sanityProjectId,
			tier: formData.tier,
			subscriptionStatus: formData.subscriptionStatus,
			adminEmails: formData.adminEmails,
			notes: formData.notes,
		});

		addToast("Client created. Their invited admin can sign in with Google to claim access.");
		closeAddModal();
	} catch (err) {
		logger.error("Failed to create platform client:", err);
		addToast("Failed to create client.");
	} finally {
		saving = false;
	}
}

async function handleSaveEdit(formData: {
	name: string;
	email: string;
	siteUrl: string;
	sanityProjectId?: string;
	tier: "basic" | "full";
	subscriptionStatus: string;
	notes?: string;
}) {
	if (!selectedClient) return;
	saving = true;
	try {
		await convexClient.mutation(api.platform.updateClient, {
			clientId: selectedClient._id,
			name: formData.name,
			email: formData.email,
			siteUrl: formData.siteUrl,
			tier: formData.tier,
			subscriptionStatus: formData.subscriptionStatus,
			notes: formData.notes,
		});
		selectedClient = {
			...selectedClient,
			name: formData.name,
			email: formData.email,
			siteUrl: formData.siteUrl,
			tier: formData.tier,
			subscriptionStatus: formData.subscriptionStatus as PlatformClient["subscriptionStatus"],
			notes: formData.notes,
		};
	} catch (err) {
		logger.error("Failed to update platform client:", err);
		addToast("Failed to save changes.");
	} finally {
		saving = false;
	}
}

async function quickTierToggle() {
	if (!selectedClient) return;
	const newTier = selectedClient.tier === "basic" ? "full" : "basic";
	try {
		await convexClient.mutation(api.platform.updateSubscription, {
			siteUrl: selectedClient.siteUrl,
			tier: newTier,
			subscriptionStatus: selectedClient.subscriptionStatus,
		});
		selectedClient = { ...selectedClient, tier: newTier };
	} catch (err) {
		logger.error("Failed to toggle tier:", err);
		addToast("Failed to update tier.");
	}
}

async function quickStatusUpdate(
	newStatus: "none" | "active" | "canceled" | "past_due",
) {
	if (!selectedClient) return;
	try {
		await convexClient.mutation(api.platform.updateSubscription, {
			siteUrl: selectedClient.siteUrl,
			tier: selectedClient.tier,
			subscriptionStatus: newStatus,
		});
		selectedClient = { ...selectedClient, subscriptionStatus: newStatus };
	} catch (err) {
		logger.error("Failed to update subscription status:", err);
		addToast("Failed to update subscription.");
	}
}
</script>

{#if clientsQuery.isLoading}
	<LoadingState />
{:else}
<div class="platform-page">
	<header class="page-header">
		<div class="header-left">
			<h1>platform clients</h1>
			<span class="client-count">{totalClients}</span>
		</div>
		<!--
			Client creation remains disabled because this package cannot safely
			provision accounts in a tenant's Convex deployment. Onboarding is an
			operator-run process until a cross-deployment provisioning contract
			exists.
		-->
		<!-- <button class="btn-add" onclick={openAddModal}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
			add client
		</button> -->
	</header>

	<!-- Stats line -->
	<div class="stats-line">
		<span>{totalClients} total</span>
		<span class="stat-sep">&middot;</span>
		<span>{basicCount} basic</span>
		<span class="stat-sep">&middot;</span>
		<span>{fullCount} full</span>
		<span class="stat-sep">&middot;</span>
		<span>{activeCount} active subscriptions</span>
	</div>

	{#if totalClients > 0}
		<!-- Search -->
		<div class="filter-bar">
			<input
				class="filter-search"
				type="text"
				placeholder="search by name, email, or site..."
				bind:value={searchQuery}
			/>
		</div>

		<!-- Client table -->
		{#if filteredClients.length === 0}
			<div class="empty-state">no clients match your search</div>
		{:else}
			<div class="table-wrap">
				<table class="client-table">
					<thead>
						<tr>
							<th>name</th>
							<th>email</th>
							<th>site url</th>
							<th>sanity project</th>
							<th>tier</th>
							<th>subscription</th>
							<th>added</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredClients as client (client._id)}
							<tr
								class="client-row"
								role="button"
								tabindex="0"
								onclick={() => openDetailModal(client)}
								onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetailModal(client); } }}
							>
								<td class="td-name">{client.name}</td>
								<td class="td-email">{client.email}</td>
								<td class="td-site">{client.siteUrl}</td>
								<td class="td-sanity">{client.sanityProjectId || "\u2014"}</td>
								<td>
									<span class="tier-text" class:tier-full={client.tier === "full"}>{client.tier}</span>
								</td>
								<td>
									<span class="status-indicator">
										<span class="status-dot" style="background: {getSubscriptionColor(client.subscriptionStatus)}"></span>
										{client.subscriptionStatus}
									</span>
								</td>
								<td class="td-date">{formatTimestampDate(client._creationTime)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{:else}
		<!-- Empty state -->
		<div class="empty-state-large">
			<svg class="empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
			<p class="empty-title">no platform clients yet</p>
			<p class="empty-desc">when you onboard your first photographer client, they'll appear here. click "add client" to get started.</p>
		</div>
	{/if}
</div>

<AddClientModal isOpen={showAddModal} {saving} onclose={closeAddModal} onsave={handleSaveNewClient} />

<ClientDetailModal client={selectedClient} {saving} onclose={closeDetailModal} onsave={handleSaveEdit} ontiertoggle={quickTierToggle} onstatusupdate={quickStatusUpdate} />
{/if}

<style>
	/* Page layout */
	.platform-page {
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

	.header-left {
		display: flex;
		align-items: baseline;
		gap: 12px;
	}

	.page-header h1 {
		font-family: "Chillax", sans-serif;
		font-size: 1.8rem;
		font-weight: 500;
		color: var(--admin-heading);
		margin: 0;
		letter-spacing: -0.01em;
	}

	.client-count {
		font-size: 0.82rem;
		color: var(--admin-text-muted);
	}

	/* Stats line */
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

	/* Filter bar */
	.filter-bar {
		display: flex;
		gap: 10px;
		margin-bottom: 24px;
		flex-wrap: wrap;
	}

	.filter-search {
		flex: 1;
		min-width: 180px;
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

	.filter-search:focus {
		border-color: var(--admin-accent);
	}

	/* Table */
	.table-wrap {
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	.client-table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
		font-size: 0.85rem;
	}

	.client-table th {
		padding: 0 16px 12px 0;
		color: var(--admin-text-subtle);
		font-weight: 400;
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		border-bottom: 1px solid var(--admin-border);
		white-space: nowrap;
	}

	.client-table td {
		padding: 14px 16px 14px 0;
		border-bottom: 1px solid var(--admin-border);
		white-space: nowrap;
	}

	.client-row {
		cursor: pointer;
		transition: background 0.12s;
	}

	.client-row:hover {
		background: var(--admin-active);
	}

	.td-name {
		font-weight: 500;
		color: var(--admin-heading);
	}

	.td-email,
	.td-site,
	.td-sanity {
		color: var(--admin-text-muted);
		font-size: 0.82rem;
	}

	.td-date {
		color: var(--admin-text-muted);
		font-size: 0.8rem;
	}

	/* Tier text */
	.tier-text {
		font-size: 0.82rem;
		color: var(--admin-text-muted);
	}

	.tier-full {
		color: var(--admin-accent-hover);
	}

	/* Status indicators */
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

	/* Empty states */
	.empty-state {
		padding: 48px 0;
		color: var(--admin-text-subtle);
		font-size: 0.88rem;
	}

	.empty-state-large {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 80px 20px;
		text-align: center;
	}

	.empty-icon {
		color: var(--admin-text-subtle);
		margin-bottom: 20px;
		opacity: 0.5;
	}

	.empty-title {
		font-family: "Chillax", sans-serif;
		font-size: 1.1rem;
		color: var(--admin-text-muted);
		margin: 0 0 8px;
	}

	.empty-desc {
		font-size: 0.85rem;
		color: var(--admin-text-subtle);
		max-width: 400px;
		line-height: 1.5;
		margin: 0;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.platform-page {
			padding: 20px 16px;
		}

		.page-header {
			flex-direction: column;
		}

		.header-left {
			flex-direction: column;
			gap: 4px;
		}

		.stats-line {
			flex-direction: column;
			gap: 4px;
		}

		.stat-sep {
			display: none;
		}

		.filter-search {
			min-width: unset;
		}
	}
</style>
