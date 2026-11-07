<script lang="ts">
import { createBusinessRecords, downloadRecordsCsv } from "./businessRecords.svelte";
import { onDestroy } from "svelte";
import { createDocumentSendReceipts, type DocumentSendReceipt, type ReceiptOwner } from "./documentSendReceiptState.svelte";
import DocumentSendReceipts from "./DocumentSendReceipts.svelte";
import RecordPagination from "./RecordPagination.svelte";
import { page } from "$app/stores";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../adminClient";
import { getAdminConfig } from "../config";
import FeatureGate from "../components/FeatureGate.svelte";
import LoadingState from "../components/LoadingState.svelte";
import type { Contract, ContractStatus } from "../types";
import type { DocumentEmailRecovery } from "../documentEmailRecovery";
import { addToast } from "../toast";
import { logger } from "../logger";
import { copyPortalLink, toId } from "../utils";
import ContractCreateModal from "./contracts/ContractCreateModal.svelte";
import ContractDetailModal from "./contracts/ContractDetailModal.svelte";
import ContractTable from "./contracts/ContractTable.svelte";
import TemplateManager from "./contracts/TemplateManager.svelte";
import type { ContractCreatePayload, ContractCreateAndSendPayload, ContractUpdatePayload, ContractTemplateSavePayload } from "./documentFormPayloads";
import {
	type HydratedDocumentEmailAttempt,
	createDocumentEmailRequestTracker,
	documentEmailFailureMessage,
	presentableDocumentEmailRecoveryFromError,
	statusAfterSuccessfulDocumentEmail,
} from "./documentEmailRequest";
import { createDocumentEmailRecoveryState } from "./documentEmailRecoveryState.svelte";

const config = getAdminConfig();
const { api } = config;

let { data } = $props();

const client = useAdminClient();
let statusFilter = $state("all");
let searchQuery = $state("");
const records = createBusinessRecords<Contract>({ kind: "contracts", filters: () => ({ ...(statusFilter === "all" ? {} : { status: statusFilter }), ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}) }) });
const contractsQuery = records;
const clientsQuery = useQuery(api.crm.listClients, { siteUrl: config.siteUrl });
const templatesQuery = useQuery(api.contracts.listTemplates, { siteUrl: config.siteUrl });
const emailTemplatesQuery = useQuery(api.emailTemplates.list, { siteUrl: config.siteUrl });

let contracts = $derived(contractsQuery.data ?? []);
let clients = $derived(clientsQuery.data ?? []);
let templates = $derived(templatesQuery.data ?? []);
let emailTemplates = $derived(emailTemplatesQuery.data ?? []);
let isLoading = $derived((!records.enabled && contractsQuery.isLoading) || clientsQuery.isLoading || templatesQuery.isLoading);

// Tab state
let activeTab = $state<"contracts" | "templates">("contracts");

// Filter state



// Modal state
let showCreateModal = $state(false);
let selectedContract = $state<Contract | null>(null);
let showTemplateCreate = $state(false);
const emailRequests = createDocumentEmailRequestTracker();
let hydratedContractId = "";
let selectionEpoch = 0;
let createEpoch = 0;
let pageAlive = true;
let selectedEmailGeneration = $state<number | null>(null);
const sendReceipts = createDocumentSendReceipts<Contract>({
	siteUrl: config.siteUrl,
	read: (id): Promise<Contract | null> => client.query(api.contracts.get, { contractId: toId(id) }),
	select: (contract, openedReceipt) => selectContract(contract, openedReceipt),
});
const selectedEmailAction = $derived(sendReceipts.items.find(item => item.id === selectedContract?._id && item.generation === selectedEmailGeneration) ?? null);

function invalidateSelection() {
	selectionEpoch += 1;
	sendReceipts.invalidateOpen();
}

function selectContract(contract: Contract | null, openedReceipt?: DocumentSendReceipt) {
	invalidateSelection();
	const receipt = openedReceipt ?? sendReceipts.items.find(item => item.id === contract?._id);
	const current = sendReceipts.items.find(item => item.id === contract?._id);
	selectedEmailGeneration = receipt?.stage === "pending" && current?.generation === receipt.generation ? receipt.generation : null;
	selectedContract = contract ? {
		...contract,
		status: selectedEmailGeneration !== null && current?.stage === "confirmed"
			? statusAfterSuccessfulDocumentEmail(contract.status) : contract.status,
	} : null;
}

function openCreate() {
	invalidateSelection();
	createEpoch += 1;
	showCreateModal = true;
}

function closeCreate() {
	invalidateSelection();
	createEpoch += 1;
	showCreateModal = false;
}

function openSavedContract(id: string) {
	invalidateSelection();
	void sendReceipts.open(id);
}

onDestroy(() => {
	pageAlive = false;
	createEpoch += 1;
	invalidateSelection();
});

function contractEmailKey(contractId: string) {
	return `contract:${contractId}`;
}

function contractEmailEndpoint(contractId: string) {
	return `/api/admin/contracts/${contractId}/send`;
}

const emailRecovery = createDocumentEmailRecoveryState({
	type: "contract",
	endpoint: contractEmailEndpoint,
	selectedId: () => selectedContract?._id as string | undefined,
	tracker: emailRequests,
	onHydrateError: (error) => logger.error("Failed to discover contract email recovery:", error),
});

$effect(() => {
	const contractId = selectedContract?._id as string | undefined;
	if (!contractId) {
		hydratedContractId = "";
		return;
	}
	if (hydratedContractId === contractId) return;
	hydratedContractId = contractId;
	void emailRecovery.hydrate(contractId);
});

// Auto-open contract from ?open= query param
let openHandled = false;
$effect(() => {
	if (records.enabled || openHandled || contracts.length === 0) return;
	const openId = $page.url.searchParams.get("open");
	if (openId) {
		const match = contracts.find((c: Contract) => c._id === openId);
		if (match) {
			selectContract(match);
			openHandled = true;
		}
	}
});

const allStatuses: ContractStatus[] = ["draft", "sent", "signed", "expired"];

let filteredContracts = $derived(
	records.enabled ? contracts : contracts.filter((c: Contract) => {
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
async function createContract(payload: ContractCreatePayload): Promise<string> {
	const epoch = createEpoch;
	const contractId = await client.mutation(api.contracts.create, {
		siteUrl: config.siteUrl,
		title: payload.title,
		clientId: toId(payload.clientId),
		category: payload.category,
		templateId: payload.templateId === undefined ? undefined : toId(payload.templateId),
		body: payload.body,
		eventDate: payload.eventDate,
		eventLocation: payload.eventLocation,
		totalPrice: payload.totalPrice,
		depositAmount: payload.depositAmount,
	});
	if (pageAlive && epoch === createEpoch) {
		showCreateModal = false;
		createEpoch += 1;
	}
	return contractId;
}

async function handleCreateContract(payload: ContractCreatePayload) {
	await createContract(payload);
}

function postContractEmail(id: string, body: Record<string, unknown>, owner: ReceiptOwner | null) {
	const operation = emailRequests.post(contractEmailKey(id), contractEmailEndpoint(id), body, { retries: 2 });
	const pending = emailRequests.pending(contractEmailKey(id), contractEmailEndpoint(id));
	if (owner && pending) sendReceipts.bindAttempt(owner, pending.attemptId);
	return operation;
}

function confirmContractEmail(id: string) {
	if (!pageAlive) return;
	emailRecovery.clear(id);
	if (selectedContract?._id === id) {
		selectedContract = { ...selectedContract, status: statusAfterSuccessfulDocumentEmail(selectedContract.status) };
	}
}

async function saveAndSendContract(payload: ContractCreateAndSendPayload) {
	const { emailTemplateId, emailSubject, emailBody, ...contractBody } = payload;
	const contractId = await createContract(contractBody);
	const owner = sendReceipts.begin(contractId, contractBody.title);
	try {
		const result = await postContractEmail(contractId, {
			templateId: emailTemplateId,
			customSubject: emailSubject,
			customBody: emailBody,
		}, owner);
		sendReceipts.bindAttempt(owner, result.attemptId);
		if (sendReceipts.settle(owner, "confirmed", "email request confirmed")) confirmContractEmail(contractId);
	} catch (error) {
		const attempt = presentableDocumentEmailRecoveryFromError(error);
		if (attempt) sendReceipts.bindAttempt(owner, attempt.attemptId);
		const current = sendReceipts.settle(owner, attempt ? "uncertain" : "failed", documentEmailFailureMessage(error));
		if (current) {
			if (attempt) emailRecovery.remember(contractId, attempt);
			else emailRecovery.clear(contractId);
		}
		logger.error("Contract saved but its email was not confirmed:", error);
	}
}

async function handleSaveContract(
	id: string,
	payload: ContractUpdatePayload,
) {
	const snapshot = selectedContract;
	await client.mutation(api.contracts.update, {
		contractId: toId(id),
		siteUrl: config.siteUrl,
		title: payload.title,
		body: payload.body,
		eventDate: payload.eventDate,
		eventLocation: payload.eventLocation,
		totalPrice: payload.totalPrice,
		depositAmount: payload.depositAmount,
		status: payload.status,
	});
	if (!snapshot || snapshot._id !== id || selectedContract !== snapshot) return;
	// The update omits undefined fields; mirror only acknowledged, provided values.
	selectedContract = {
		...snapshot,
		title: payload.title ?? snapshot.title,
		body: payload.body ?? snapshot.body,
		eventDate: payload.eventDate ?? snapshot.eventDate,
		eventLocation: payload.eventLocation ?? snapshot.eventLocation,
		totalPrice: payload.totalPrice ?? snapshot.totalPrice,
		depositAmount: payload.depositAmount ?? snapshot.depositAmount,
		status: payload.status ?? snapshot.status,
	};
}

async function handleContractAction(id: string, action: string) {
	if (action === "send") {
		await client.mutation(api.contracts.markSent, {
			contractId: toId(id),
			siteUrl: config.siteUrl,
		});
	} else if (action === "sign") {
		await client.mutation(api.contracts.markSigned, {
			contractId: toId(id),
			siteUrl: config.siteUrl,
		});
	}
}

async function handleSendEmail(id: string, templateId?: string, changeNote?: string) {
	invalidateSelection();
	const owner = sendReceipts.items.some(item => item.id === id) ? sendReceipts.begin(id) : null;
	if (owner && selectedContract?._id === id) selectedEmailGeneration = owner.generation;
	try {
		const result = await postContractEmail(id, { templateId, changeNote }, owner);
		if (owner) sendReceipts.bindAttempt(owner, result.attemptId);
		if (!owner || sendReceipts.settle(owner, "confirmed", "email request confirmed")) confirmContractEmail(id);
	} catch (error) {
		const attempt = presentableDocumentEmailRecoveryFromError(error);
		if (owner && attempt) sendReceipts.bindAttempt(owner, attempt.attemptId);
		const current = !owner || sendReceipts.settle(owner, attempt ? "uncertain" : "failed", documentEmailFailureMessage(error));
		if (pageAlive && current) {
			if (attempt) emailRecovery.remember(id, attempt);
			else emailRecovery.clear(id);
		}
		throw error;
	}
}

function handleContractEmailResolved(result: {
	attemptId: string;
	recovery: DocumentEmailRecovery;
}) {
	if (!pageAlive || !emailRecovery.resolve(result)) return;
	dismissMatchingReceipt(result);
	if (selectedContract?._id !== result.recovery.document.id) return;
	if (result.recovery.status === "sent") {
		selectedContract = {
			...selectedContract,
			status: statusAfterSuccessfulDocumentEmail(selectedContract.status),
		};
	}
}

function handleContractEmailRecovery(
	contractId: string,
	attempt: HydratedDocumentEmailAttempt,
) {
	if (pageAlive) emailRecovery.remember(contractId, attempt);
}

function dismissMatchingReceipt(result: { attemptId: string; recovery: DocumentEmailRecovery }) {
	const receipt = sendReceipts.items.find(item => item.id === result.recovery.document.id && item.attemptId === result.attemptId);
	if (!receipt) return;
	if (receipt.stage === "pending") {
		sendReceipts.settle(receipt, result.recovery.status === "sent" ? "confirmed" : "failed", result.recovery.status === "sent" ? "email request confirmed" : "email request recorded as not accepted");
	}
	sendReceipts.dismiss(receipt.id);
}

function dismissContractEmailRecovery(result: {
	attemptId: string;
	recovery: DocumentEmailRecovery;
}) {
	if (pageAlive && emailRecovery.dismiss(result)) dismissMatchingReceipt(result);
}

async function handleDeleteContract(id: string) {
	await client.mutation(api.contracts.remove, {
		contractId: toId(id),
		siteUrl: config.siteUrl,
	});
	if (selectedContract?._id === id) selectContract(null);
}

async function handleShareLink(id: string, clientId: string) {
	try {
		await copyPortalLink(client, api, config.siteUrl, "contract", id, clientId);
	} catch (err) {
		logger.error("Failed to create share link:", err);
		addToast("Failed to create share link.");
	}
}

// Template CRUD callbacks
async function handleSaveTemplate(
	id: string | null,
	payload: ContractTemplateSavePayload,
) {
	if (id) {
		await client.mutation(api.contracts.updateTemplate, {
			templateId: toId(id),
			siteUrl: config.siteUrl,
			name: payload.name,
			body: payload.body,
			variables: payload.variables,
		});
	} else {
		await client.mutation(api.contracts.createTemplate, {
			siteUrl: config.siteUrl,
			name: payload.name,
			body: payload.body,
			variables: payload.variables,
		});
	}
}

async function handleDeleteTemplate(id: string) {
	await client.mutation(api.contracts.removeTemplate, {
		templateId: toId(id),
		siteUrl: config.siteUrl,
	});
}

const deepLinkedRecordId = $derived($page.url.searchParams.get("open"));
let openedRecordId = "";
$effect(() => {
 const id = deepLinkedRecordId;
 if (!id) { openedRecordId = ""; return; }
 if (!records.enabled || !id || openedRecordId === id) return;
 openedRecordId = id;
 const epoch = selectionEpoch;
 let active = true;
 void records.open(id).then((row) => { if (active && row && epoch === selectionEpoch && deepLinkedRecordId === id && !selectedContract) { selectContract(row); } });
 return () => {active = false;};
});
async function exportRecords() {
 if (!records.enabled) { return; }
 const rows = await records.all();
 if (!rows) return;
 try { downloadRecordsCsv(rows, "contracts.csv"); } catch (error) { addToast(error instanceof Error ? error.message : "Export failed."); }
}
</script>

<FeatureGate feature="contracts" adminSession={data.adminSession}>
	{#if isLoading}
		<LoadingState />
	{:else}
	<div class="contracts-page admin-page">
		<header class="page-header">
			<div class="header-left">
				<h1>contracts</h1>
			</div>
			<button
				class="btn-add"
				onclick={() => {
					invalidateSelection();
					if (activeTab === "templates") showTemplateCreate = true;
					else openCreate();
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
			{#if records.enabled}<span>on this page</span><span class="stat-sep">&middot;</span>{/if}
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
					invalidateSelection();
					activeTab = "contracts";
				}}>contracts</button
			>
			<button
				class="tab-btn"
				class:tab-active={activeTab === "templates"}
				role="tab"
				aria-selected={activeTab === "templates"}
				onclick={() => {
					invalidateSelection();
					activeTab = "templates";
				}}>templates</button
			>
		</div>

		{#if activeTab === "contracts"}
			<div class="filter-bar">
				<select class="filter-select" bind:value={statusFilter} onchange={invalidateSelection}>
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
					oninput={invalidateSelection}
				/>
			</div>

		<DocumentSendReceipts documentLabel="contract" items={sendReceipts.items} onopen={openSavedContract} ondismiss={id => sendReceipts.dismiss(id)} />
		<RecordPagination {records} onrequest={invalidateSelection} onexport={() => void exportRecords()} />
		<ContractTable
				contracts={filteredContracts}
				onselect={(c) => {
					selectContract(c);
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
			onclose={closeCreate}
		/>
	{/if}

	{#if selectedContract}
		<ContractDetailModal
			contract={selectedContract}
			emailTemplates={emailTemplates}
			onclose={() => selectContract(null)}
			externalEmailAction={selectedEmailAction}
			onsave={handleSaveContract}
			onaction={handleContractAction}
			onsend={handleSendEmail}
			onemailresolved={handleContractEmailResolved}
			emailRecoveryAttempt={emailRecovery.forDocument(selectedContract._id as string)}
			onemailrecovery={handleContractEmailRecovery}
			onemailterminal={handleContractEmailResolved}
			onemailrecoverydismiss={dismissContractEmailRecovery}
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
		flex-wrap: wrap;
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
		margin-bottom: 0;
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

		.filter-bar {
			flex-direction: column;
		}

		.filter-search {
			min-width: unset;
		}
	}
</style>
