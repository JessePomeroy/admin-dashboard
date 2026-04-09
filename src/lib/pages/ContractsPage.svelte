<script lang="ts">
import { useQuery, useConvexClient } from "convex-svelte";
import { getAdminConfig } from "../config";
import FeatureGate from "../components/FeatureGate.svelte";
import LoadingState from "../components/LoadingState.svelte";
import type { Contract, ContractStatus } from "../types";
import ContractCreateModal from "./contracts/ContractCreateModal.svelte";
import ContractDetailModal from "./contracts/ContractDetailModal.svelte";
import ContractTable from "./contracts/ContractTable.svelte";
import TemplateManager from "./contracts/TemplateManager.svelte";

const config = getAdminConfig();
const { api } = config;

let { data } = $props();

const client = useConvexClient();
const contractsQuery = useQuery(api.contracts.list, { siteUrl: config.siteUrl });
const clientsQuery = useQuery(api.crm.listClients, { siteUrl: config.siteUrl });
const templatesQuery = useQuery(api.contracts.listTemplates, { siteUrl: config.siteUrl });
const emailTemplatesQuery = useQuery(api.emailTemplates.list, { siteUrl: config.siteUrl });

let contracts = $derived(contractsQuery.data ?? []);
let clients = $derived(clientsQuery.data ?? []);
let templates = $derived(templatesQuery.data ?? []);
let emailTemplates = $derived(emailTemplatesQuery.data ?? []);
let isLoading = $derived(contractsQuery.isLoading || clientsQuery.isLoading || templatesQuery.isLoading);

// Tab state
let activeTab = $state<"contracts" | "templates">("contracts");

// Filter state
let statusFilter = $state("all");
let searchQuery = $state("");

// Modal state
let showCreateModal = $state(false);
let selectedContract = $state<Contract | null>(null);
let showTemplateCreate = $state(false);

const allStatuses: ContractStatus[] = ["draft", "sent", "signed", "expired"];

let filteredContracts = $derived(
	contracts.filter((c: Contract) => {
		if (statusFilter !== "all" && c.status !== statusFilter) return false;
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			const matchTitle = c.title?.toLowerCase().includes(q);
			const matchClient = c.clientName?.toLowerCase().includes(q);
			if (!matchTitle && !matchClient) return false;
		}
		return true;
	}),
);

let stats = $derived({
	total: contracts.length,
	draft: contracts.filter((c: Contract) => c.status === "draft").length,
	sent: contracts.filter((c: Contract) => c.status === "sent").length,
	signed: contracts.filter((c: Contract) => c.status === "signed").length,
	expired: contracts.filter((c: Contract) => c.status === "expired").length,
});

// Contract CRUD callbacks
async function handleCreateContract(payload: Record<string, unknown>) {
	await client.mutation(api.contracts.create, {
		siteUrl: config.siteUrl,
		title: payload.title as string,
		clientId: payload.clientId as any,
		category: payload.category as "photography" | "web" | undefined,
		templateId: payload.templateId as any,
		body: payload.body as string,
		eventDate: payload.eventDate as string | undefined,
		eventLocation: payload.eventLocation as string | undefined,
		totalPrice: payload.totalPrice as number | undefined,
		depositAmount: payload.depositAmount as number | undefined,
	});
	showCreateModal = false;
}

async function saveAndSendContract(payload: Record<string, unknown> & { emailTemplateId?: string; emailSubject?: string; emailBody?: string }) {
	const contractId = await client.mutation(api.contracts.create, {
		siteUrl: config.siteUrl,
		title: payload.title as string,
		clientId: payload.clientId as any,
		category: payload.category as "photography" | "web" | undefined,
		templateId: payload.templateId as any,
		body: payload.body as string,
		eventDate: payload.eventDate as string | undefined,
		eventLocation: payload.eventLocation as string | undefined,
		totalPrice: payload.totalPrice as number | undefined,
		depositAmount: payload.depositAmount as number | undefined,
	});
	await fetch(`/api/admin/contracts/${contractId}/send`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			templateId: payload.emailTemplateId,
			customSubject: payload.emailSubject,
			customBody: payload.emailBody,
		}),
	});
	showCreateModal = false;
}

async function handleSaveContract(
	id: string,
	payload: Record<string, unknown>,
) {
	await client.mutation(api.contracts.update, {
		contractId: id as any,
		siteUrl: config.siteUrl,
		title: payload.title as string | undefined,
		body: payload.body as string | undefined,
		eventDate: payload.eventDate as string | undefined,
		eventLocation: payload.eventLocation as string | undefined,
		totalPrice: payload.totalPrice as number | undefined,
		depositAmount: payload.depositAmount as number | undefined,
		status: payload.status as string | undefined,
	});
}

async function handleContractAction(id: string, action: string) {
	if (action === "send") {
		await client.mutation(api.contracts.markSent, {
			contractId: id as any,
			siteUrl: config.siteUrl,
		});
	} else if (action === "sign") {
		await client.mutation(api.contracts.markSigned, {
			contractId: id as any,
			siteUrl: config.siteUrl,
		});
	}
}

async function handleSendEmail(id: string, templateId?: string): Promise<boolean> {
	try {
		const res = await fetch(`/api/admin/contracts/${id}/send`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ templateId }),
		});
		if (res.ok) {
			await client.mutation(api.contracts.markSent, {
				contractId: id as any,
				siteUrl: config.siteUrl,
			});
			return true;
		}
		return false;
	} catch {
		return false;
	}
}

async function handleDeleteContract(id: string) {
	await client.mutation(api.contracts.remove, {
		contractId: id as any,
		siteUrl: config.siteUrl,
	});
	selectedContract = null;
}

async function handleShareLink(id: string, clientId: string) {
	try {
		const token = await client.mutation(api.portal.createToken, {
			siteUrl: config.siteUrl,
			type: "contract" as any,
			documentId: id,
			clientId: clientId as any,
		});
		await navigator.clipboard.writeText(
			`https://${config.siteUrl}/portal/${token}`,
		);
	} catch (err) {
		console.error("Failed to create share link:", err);
	}
}

// Template CRUD callbacks
async function handleSaveTemplate(
	id: string | null,
	payload: Record<string, unknown>,
) {
	if (id) {
		await client.mutation(api.contracts.updateTemplate, {
			templateId: id as any,
			siteUrl: config.siteUrl,
			name: payload.name as string | undefined,
			body: payload.body as string | undefined,
			variables: payload.variables as string[] | undefined,
		});
	} else {
		await client.mutation(api.contracts.createTemplate, {
			siteUrl: config.siteUrl,
			name: payload.name as string,
			body: payload.body as string,
			variables: payload.variables as string[] | undefined,
		});
	}
}

async function handleDeleteTemplate(id: string) {
	await client.mutation(api.contracts.removeTemplate, {
		templateId: id as any,
		siteUrl: config.siteUrl,
	});
}
</script>

<FeatureGate feature="contracts" tier={data.tier}>
	{#if isLoading}
		<LoadingState />
	{:else}
	<div class="contracts-page">
		<header class="page-header">
			<div class="header-left">
				<h1>contracts</h1>
			</div>
			<button
				class="btn-add"
				onclick={() => {
					if (activeTab === "templates") showTemplateCreate = true;
					else showCreateModal = true;
				}}
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><line x1="12" y1="5" x2="12" y2="19" /><line
						x1="5"
						y1="12"
						x2="19"
						y2="12"
					/></svg
				>
				{activeTab === "templates" ? "new template" : "new contract"}
			</button>
		</header>

		<div class="stats-line">
			<span>{stats.total} total</span>
			<span class="stat-sep">&middot;</span>
			<span>{stats.draft} draft</span>
			<span class="stat-sep">&middot;</span>
			<span>{stats.sent} sent</span>
			<span class="stat-sep">&middot;</span>
			<span>{stats.signed} signed</span>
			{#if stats.expired > 0}
				<span class="stat-sep">&middot;</span>
				<span>{stats.expired} expired</span>
			{/if}
		</div>

		<div class="tab-bar" role="tablist">
			<button
				class="tab-btn"
				class:tab-active={activeTab === "contracts"}
				role="tab"
				aria-selected={activeTab === "contracts"}
				onclick={() => {
					activeTab = "contracts";
				}}>contracts</button
			>
			<button
				class="tab-btn"
				class:tab-active={activeTab === "templates"}
				role="tab"
				aria-selected={activeTab === "templates"}
				onclick={() => {
					activeTab = "templates";
				}}>templates</button
			>
		</div>

		{#if activeTab === "contracts"}
			<div class="filter-bar">
				<select class="filter-select" bind:value={statusFilter}>
					<option value="all">all statuses</option>
					{#each allStatuses as s}
						<option value={s}>{s}</option>
					{/each}
				</select>
				<input
					class="filter-search"
					type="text"
					placeholder="search by title or client..."
					bind:value={searchQuery}
				/>
			</div>

			<ContractTable
				contracts={filteredContracts}
				onselect={(c) => {
					selectedContract = { ...c };
				}}
			/>
		{:else}
			<TemplateManager
				{templates}
				showCreateModal={showTemplateCreate}
				onsave={handleSaveTemplate}
				ondelete={handleDeleteTemplate}
				onclosecreate={() => {
					showTemplateCreate = false;
				}}
			/>
		{/if}
	</div>

	{#if showCreateModal}
		<ContractCreateModal
			{clients}
			{templates}
			{emailTemplates}
			onsave={handleCreateContract}
			onsaveandsend={saveAndSendContract}
			onclose={() => {
				showCreateModal = false;
			}}
		/>
	{/if}

	{#if selectedContract}
		<ContractDetailModal
			contract={selectedContract}
			emailTemplates={emailTemplates}
			onclose={() => {
				selectedContract = null;
			}}
			onsave={handleSaveContract}
			onaction={handleContractAction}
			onsend={handleSendEmail}
			ondelete={handleDeleteContract}
			onsharelink={handleShareLink}
		/>
	{/if}
	{/if}
</FeatureGate>

<style>
	.contracts-page {
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

	.tab-bar {
		display: flex;
		gap: 0;
		margin-bottom: 24px;
		border-bottom: 1px solid var(--admin-border);
	}

	.tab-btn {
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		padding: 8px 16px;
		font-size: 0.85rem;
		font-family: "Synonym", system-ui, sans-serif;
		color: var(--admin-text-muted);
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
		margin-bottom: -1px;
	}

	.tab-btn:hover {
		color: var(--admin-heading);
	}

	.tab-active {
		color: var(--admin-heading);
		border-bottom-color: var(--admin-accent);
		font-weight: 500;
	}

	.filter-bar {
		display: flex;
		gap: 10px;
		margin-bottom: 24px;
		flex-wrap: wrap;
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

	@media (max-width: 768px) {
		.contracts-page {
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

		.tab-bar {
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
		}

		.filter-bar {
			flex-direction: column;
		}

		.filter-search {
			min-width: unset;
		}
	}
</style>
