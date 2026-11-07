<script lang="ts">
import { createBusinessRecords, downloadRecordsCsv } from "./businessRecords.svelte";
import { onDestroy } from "svelte";
import { type DocumentSendReceipt, type ReceiptOwner, createDocumentSendReceipts } from "./documentSendReceiptState.svelte";
import DocumentSendReceipts from "./DocumentSendReceipts.svelte";
import RecordPagination from "./RecordPagination.svelte";
import { page } from "$app/stores";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../adminClient";
import { getAdminConfig } from "../config";
import FeatureGate from "../components/FeatureGate.svelte";
import FilterBar from "../components/FilterBar.svelte";
import LoadingState from "../components/LoadingState.svelte";
import PageHeader from "../components/PageHeader.svelte";
import type { Client, Invoice, InvoiceStatus } from "../types";
import { isTerminalDocumentEmailRecovery, type DocumentEmailRecovery } from "../documentEmailRecovery";
import { addToast } from "../toast";
import { logger } from "../logger";
import { copyPortalLink, toId } from "../utils";
import {
	type HydratedDocumentEmailAttempt,
	createDocumentEmailRequestTracker,
	documentEmailFailureMessage,
	documentEmailRecoveryFromError,
	presentableDocumentEmailRecoveryFromError,
	statusAfterSuccessfulDocumentEmail,
} from "./documentEmailRequest";
import { createDocumentEmailRecoveryState } from "./documentEmailRecoveryState.svelte";
import InvoiceCreateModal from "./invoicing/InvoiceCreateModal.svelte";
import InvoiceDetailModal from "./invoicing/InvoiceDetailModal.svelte";
import InvoiceTable from "./invoicing/InvoiceTable.svelte";
import type { InvoiceCreatePayload, InvoiceCreateAndSendPayload, InvoiceUpdatePayload } from "./documentFormPayloads";

const config = getAdminConfig();
const { api } = config;

let { data } = $props();

const client = useAdminClient();
let statusFilter = $state("all");
let searchQuery = $state("");
const records = createBusinessRecords<Invoice>({ kind: "invoices", filters: () => ({ ...(statusFilter === "all" ? {} : { status: statusFilter }), ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}) }) });
const invoicesQuery = records;
const clientsQuery = useQuery(api.crm.listClients, { siteUrl: config.siteUrl });
const numberPreviewQuery = useQuery(api.invoices.getNextNumber, { siteUrl: config.siteUrl });
const templatesQuery = useQuery(api.emailTemplates.list, { siteUrl: config.siteUrl });

let invoices = $derived(invoicesQuery.data ?? []);
let clients = $derived(clientsQuery.data ?? []);
let numberPreview = $derived(numberPreviewQuery.data ?? "INV-001");
let emailTemplates = $derived(templatesQuery.data ?? []);
let isLoading = $derived((!records.enabled && invoicesQuery.isLoading) || clientsQuery.isLoading || numberPreviewQuery.isLoading);



let showCreateModal = $state(false);
let selectedInvoice = $state<Invoice | null>(null);
let shareLinkCopied = $state(false);
const emailRequests = createDocumentEmailRequestTracker();
let hydratedInvoiceId = "";
let selectionEpoch = 0;
let selectedEmailGeneration = $state<number | null>(null);
let createEpoch = 0;
let pageAlive = true;
const sendReceipts = createDocumentSendReceipts<Invoice>({
	siteUrl: config.siteUrl,
	read: (id): Promise<Invoice | null> => client.query(api.invoices.get, { invoiceId: toId(id) }),
	select: (invoice, openedReceipt) => selectInvoice(invoice, openedReceipt),
});
const selectedEmailAction = $derived(sendReceipts.items.find(item => item.id === selectedInvoice?._id && item.generation === selectedEmailGeneration) ?? null);

function invalidateSelection() {
	selectionEpoch += 1;
	sendReceipts.invalidateOpen();
}

function selectInvoice(invoice: Invoice | null, openedReceipt?: DocumentSendReceipt) {
	invalidateSelection();
	const receipt = openedReceipt ?? sendReceipts.items.find(item => item.id === invoice?._id);
	const currentReceipt = sendReceipts.items.find(item => item.id === invoice?._id);
	selectedEmailGeneration = receipt?.stage === "pending" && currentReceipt?.generation === receipt.generation ? receipt.generation : null;
	selectedInvoice = invoice ? { ...invoice } : null;
	const current = selectedEmailAction;
	if (selectedInvoice && current?.stage === "confirmed") {
		selectedInvoice = { ...selectedInvoice, status: statusAfterSuccessfulDocumentEmail(selectedInvoice.status) };
	}
	shareLinkCopied = false;
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

function openSavedInvoice(id: string) {
	invalidateSelection();
	void sendReceipts.open(id);
}

onDestroy(() => {
	pageAlive = false;
	createEpoch += 1;
	invalidateSelection();
});

function invoiceEmailKey(invoiceId: string) {
	return `invoice:${invoiceId}`;
}

function invoiceEmailEndpoint(invoiceId: string) {
	return `/api/admin/invoicing/${invoiceId}/send`;
}

const emailRecovery = createDocumentEmailRecoveryState({
	type: "invoice",
	endpoint: invoiceEmailEndpoint,
	selectedId: () => selectedInvoice?._id as string | undefined,
	tracker: emailRequests,
	onHydrateError: (error) => logger.error("Failed to discover invoice email recovery:", error),
});

$effect(() => {
	const invoiceId = selectedInvoice?._id as string | undefined;
	if (!invoiceId) {
		hydratedInvoiceId = "";
		return;
	}
	if (hydratedInvoiceId === invoiceId) return;
	hydratedInvoiceId = invoiceId;
	void emailRecovery.hydrate(invoiceId);
});

// Auto-open invoice from ?open= query param (e.g. from activity timeline)
let openHandled = false;
$effect(() => {
	if (records.enabled || openHandled || invoices.length === 0) return;
	const openId = $page.url.searchParams.get("open");
	if (openId) {
		const match = invoices.find((inv: Invoice) => inv._id === openId);
		if (match) {
			selectInvoice(match);
			openHandled = true;
		}
	}
});

const allStatuses: InvoiceStatus[] = [
	"draft",
	"sent",
	"paid",
	"partial",
	"overdue",
	"canceled",
];

let filteredInvoices = $derived(
	records.enabled ? invoices : invoices.filter((inv: Invoice) => {
		if (statusFilter !== "all" && inv.status !== statusFilter) return false;
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			const matchNumber = inv.invoiceNumber?.toLowerCase().includes(q);
			const matchClient = inv.clientName?.toLowerCase().includes(q);
			if (!matchNumber && !matchClient) return false;
		}
		return true;
	}),
);

let stats = $derived({
	total: invoices.length,
	draft: invoices.filter((i: Invoice) => i.status === "draft").length,
	sent: invoices.filter((i: Invoice) => i.status === "sent").length,
	paid: invoices.filter((i: Invoice) => i.status === "paid").length,
	overdue: invoices.filter((i: Invoice) => i.status === "overdue").length,
	recurring: invoices.filter((i: Invoice) => i.invoiceType === "recurring")
		.length,
	deposits: invoices.filter((i: Invoice) => i.invoiceType === "deposit")
		.length,
});

function sendInvoiceEmailRequest(
	invoiceId: string,
	body: Record<string, unknown>,
) {
	return emailRequests.post(
		invoiceEmailKey(invoiceId),
		invoiceEmailEndpoint(invoiceId),
		body,
		{
		retries: 2,
		},
	);
}

async function createInvoice(body: InvoiceCreatePayload): Promise<string> {
	const epoch = createEpoch;
	const invoiceId = await client.mutation(api.invoices.create, {
		siteUrl: config.siteUrl,
		clientId: toId(body.clientId),
		invoiceType: body.invoiceType,
		items: body.items,
		taxPercent: body.taxPercent,
		notes: body.notes,
		dueDate: body.dueDate,
		recurring: body.recurring,
		depositPercent: body.depositPercent,
		totalProject: body.totalProject,
		milestoneName: body.milestoneName,
		milestoneIndex: body.milestoneIndex,
		parentInvoiceId: body.parentInvoiceId === undefined ? undefined : toId(body.parentInvoiceId),
	});
	if (pageAlive && epoch === createEpoch) {
		showCreateModal = false;
		createEpoch += 1;
	}
	return invoiceId;
}

async function handleCreate(body: InvoiceCreatePayload) {
	await createInvoice(body);
}

async function saveAndSendInvoice(body: InvoiceCreateAndSendPayload) {
	const { templateId, emailSubject, emailBody, ...invoiceBody } = body;
	const label = clients.find((client: Client) => client._id === invoiceBody.clientId)?.name;
	const invoiceId = await createInvoice(invoiceBody);
	const owner = sendReceipts.begin(invoiceId, label);
	try {
		const request = sendInvoiceEmailRequest(invoiceId, {
			templateId,
			customSubject: emailSubject,
			customBody: emailBody,
		});
		bindInvoiceAttempt(owner);
		const result = await request;
		sendReceipts.bindAttempt(owner, result.attemptId);
		if (sendReceipts.settle(owner, "confirmed", "email request confirmed")) {
			confirmInvoiceEmail(invoiceId);
		}
	} catch (err) {
		const attempt = presentableDocumentEmailRecoveryFromError(err);
		const canonical = documentEmailRecoveryFromError(err);
		if (canonical) sendReceipts.bindAttempt(owner, canonical.attemptId);
		const current = sendReceipts.settle(owner, attempt ? "uncertain" : "failed", documentEmailFailureMessage(err));
		if (current) {
			if (attempt) {
				sendReceipts.bindAttempt(owner, attempt.attemptId);
				emailRecovery.remember(invoiceId, attempt);
			} else emailRecovery.clear(invoiceId);
		}
		logger.error("Invoice saved but its email was not confirmed:", err);
	}
}

function bindInvoiceAttempt(owner: ReceiptOwner) {
	const pending = emailRequests.pending(invoiceEmailKey(owner.id), invoiceEmailEndpoint(owner.id));
	if (pending) sendReceipts.bindAttempt(owner, pending.attemptId);
}

function confirmInvoiceEmail(invoiceId: string) {
	if (!pageAlive) return;
	emailRecovery.clear(invoiceId);
	if (selectedInvoice?._id === invoiceId) {
		selectedInvoice = {
			...selectedInvoice,
			status: statusAfterSuccessfulDocumentEmail(selectedInvoice.status),
		};
	}
}

async function handleSave(body: InvoiceUpdatePayload) {
	if (!selectedInvoice) return;
	const invoiceId = selectedInvoice._id as string;
	const invoiceSnapshot = selectedInvoice;
	const updated: Invoice | null = await client.mutation(api.invoices.update, {
		invoiceId: toId(invoiceId),
		siteUrl: config.siteUrl,
		items: body.items,
		taxPercent: body.taxPercent,
		notes: body.notes,
		dueDate: body.dueDate,
		status: body.status,
	});
	if (selectedInvoice?._id === invoiceId) {
		selectedInvoice = updated?._id === invoiceId ? updated : { ...invoiceSnapshot, ...body };
	}
}

async function handleAction(invoiceId: string, action: string) {
	if (action === "send") {
		await client.mutation(api.invoices.markSent, {
			invoiceId: toId(invoiceId),
			siteUrl: config.siteUrl,
		});
		if (selectedInvoice?._id === invoiceId) {
			selectedInvoice = { ...selectedInvoice, status: "sent" } as Invoice;
		}
	} else if (action === "pay") {
		await client.mutation(api.invoices.markPaid, {
			invoiceId: toId(invoiceId),
			siteUrl: config.siteUrl,
		});
		if (selectedInvoice?._id === invoiceId) {
			selectedInvoice = { ...selectedInvoice, status: "paid" } as Invoice;
		}
	} else if (action === "overdue" || action === "cancel") {
		const newStatus = action === "overdue" ? "overdue" : "canceled";
		await client.mutation(api.invoices.update, {
			invoiceId: toId(invoiceId),
			siteUrl: config.siteUrl,
			status: newStatus,
		});
		if (selectedInvoice?._id === invoiceId) {
			selectedInvoice = { ...selectedInvoice, status: newStatus } as Invoice;
		}
	}
}

async function handleSendEmail(
	invoiceId: string,
	templateId?: string,
	changeNote?: string,
) {
	invalidateSelection();
	const owner = sendReceipts.items.some(item => item.id === invoiceId) ? sendReceipts.begin(invoiceId) : null;
	if (owner && selectedInvoice?._id === invoiceId) selectedEmailGeneration = owner.generation;
	try {
		const request = sendInvoiceEmailRequest(invoiceId, { templateId, changeNote });
		if (owner) bindInvoiceAttempt(owner);
		const result = await request;
		if (owner) sendReceipts.bindAttempt(owner, result.attemptId);
		if (!owner || sendReceipts.settle(owner, "confirmed", "email request confirmed")) confirmInvoiceEmail(invoiceId);
	} catch (error) {
		const attempt = presentableDocumentEmailRecoveryFromError(error);
		const canonical = documentEmailRecoveryFromError(error);
		if (owner && canonical) sendReceipts.bindAttempt(owner, canonical.attemptId);
		const current = !owner || sendReceipts.settle(owner, attempt ? "uncertain" : "failed", documentEmailFailureMessage(error));
		if (owner && attempt) sendReceipts.bindAttempt(owner, attempt.attemptId);
		if (current && !attempt) emailRecovery.clear(invoiceId);
		throw error;
	}
}

function handleEmailResolved(result: {
	attemptId: string;
	recovery: DocumentEmailRecovery;
}) {
	if (!pageAlive || !emailRecovery.resolve(result)) return;
	dismissMatchingReceipt(result);
	if (!selectedInvoice) return;
	if (result.recovery.status === "sent") {
		selectedInvoice = {
			...selectedInvoice,
			status: statusAfterSuccessfulDocumentEmail(selectedInvoice.status),
		} as Invoice;
	}
}

function handleEmailRecovery(
	invoiceId: string,
	attempt: HydratedDocumentEmailAttempt,
) {
	if (pageAlive) emailRecovery.remember(invoiceId, attempt);
}

function dismissMatchingReceipt(result: { attemptId: string; recovery: DocumentEmailRecovery }) {
	if (!isTerminalDocumentEmailRecovery(result.recovery) || result.recovery.document.type !== "invoice"
		|| result.recovery.attemptId !== result.attemptId) return;
	const receipt = sendReceipts.items.find(item => item.id === result.recovery.document.id && item.attemptId === result.attemptId);
	if (!receipt) return;
	if (receipt.stage === "pending") {
		sendReceipts.settle(receipt, result.recovery.status === "sent" ? "confirmed" : "failed",
			result.recovery.status === "sent" ? "email request confirmed" : "email request recorded as not accepted");
	}
	sendReceipts.dismiss(receipt.id);
}

function dismissEmailRecovery(result: {
	attemptId: string;
	recovery: DocumentEmailRecovery;
}) {
	if (pageAlive && emailRecovery.dismiss(result)) dismissMatchingReceipt(result);
}

async function handleDelete() {
	if (!selectedInvoice) return;
	const invoiceId = selectedInvoice._id;
	await client.mutation(api.invoices.remove, {
		invoiceId: toId(invoiceId),
		siteUrl: config.siteUrl,
	});
	if (selectedInvoice?._id === invoiceId) selectInvoice(null);
}

async function handleShareLink() {
	if (!selectedInvoice) return;
	shareLinkCopied = false;
	try {
		await copyPortalLink(client, api, config.siteUrl, "invoice", selectedInvoice._id as string, selectedInvoice.clientId as string);
		shareLinkCopied = true;
		setTimeout(() => { shareLinkCopied = false; }, 3000);
	} catch (err) {
		logger.error("Failed to create share link:", err);
		addToast("Failed to create share link.");
	}
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
 void records.open(id).then((row) => { if (active && row && epoch === selectionEpoch && deepLinkedRecordId === id && !selectedInvoice) { selectInvoice(row); } });
 return () => {active = false;};
});
async function exportRecords() {
 if (!records.enabled) { return; }
 const rows = await records.all();
 if (!rows) return;
 try { downloadRecordsCsv(rows, "invoices.csv"); } catch (error) { addToast(error instanceof Error ? error.message : "Export failed."); }
}
</script>

<FeatureGate feature="invoicing" adminSession={data.adminSession}>
	{#if isLoading}
		<LoadingState />
	{:else}
	<div class="invoice-page admin-page">
		<PageHeader title="invoicing">
			{#snippet actions()}
				<button
					class="btn-add"
					onclick={openCreate}
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
					new invoice
				</button>
			{/snippet}
		</PageHeader>

		<div class="stats-line">
			{#if records.enabled}<span>on this page</span><span class="stat-sep">&middot;</span>{/if}
			<span>{stats.total} total</span>
			<span class="stat-sep">&middot;</span>
			<span>{stats.draft} draft</span>
			<span class="stat-sep">&middot;</span>
			<span>{stats.sent} sent</span>
			<span class="stat-sep">&middot;</span>
			<span>{stats.paid} paid</span>
			<span class="stat-sep">&middot;</span>
			<span>{stats.overdue} overdue</span>
			{#if stats.recurring > 0}
				<span class="stat-sep">&middot;</span>
				<span>{stats.recurring} recurring</span>
			{/if}
			{#if stats.deposits > 0}
				<span class="stat-sep">&middot;</span>
				<span>{stats.deposits} deposits</span>
			{/if}
		</div>

		<FilterBar
			filters={[
				{
					options: allStatuses.map((s) => ({
						value: s,
						label: s,
					})),
					value: statusFilter,
					allLabel: "all statuses",
					onchange: (v) => {
						invalidateSelection();
						statusFilter = v;
					},
				},
			]}
			{searchQuery}
			searchPlaceholder="search by invoice # or client..."
			onsearch={(q) => {
				invalidateSelection();
				searchQuery = q;
			}}
		/>

		<DocumentSendReceipts documentLabel="invoice" items={sendReceipts.items} onopen={openSavedInvoice} ondismiss={id => sendReceipts.dismiss(id)} />
	<RecordPagination {records} onrequest={invalidateSelection} onexport={() => void exportRecords()} />
		<InvoiceTable
			invoices={filteredInvoices}
			onselect={(inv) => {
				selectInvoice(inv);
			}}
		/>
	</div>

	{#if showCreateModal}
		<InvoiceCreateModal
			{clients}
			{invoices}
			{numberPreview}
			{emailTemplates}
			oncreate={handleCreate}
			onsaveandsend={saveAndSendInvoice}
			onclose={closeCreate}
		/>
	{/if}

	{#if selectedInvoice}
		<InvoiceDetailModal
			invoice={selectedInvoice}
			templates={emailTemplates}
			externalEmailAction={selectedEmailAction}
			onsave={handleSave}
			onaction={handleAction}
			onsend={handleSendEmail}
			ondelete={handleDelete}
			onshare={handleShareLink}
			{shareLinkCopied}
			onemailresolved={handleEmailResolved}
			emailRecoveryAttempt={emailRecovery.forDocument(selectedInvoice._id as string)}
			onemailrecovery={handleEmailRecovery}
			onemailterminal={handleEmailResolved}
			onemailrecoverydismiss={dismissEmailRecovery}
			onclose={() => selectInvoice(null)}
		/>
	{/if}
	{/if}
</FeatureGate>

<style>
	.invoice-page {
		padding: 48px 40px;
		max-width: 1200px;
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

	@media (max-width: 768px) {
		.invoice-page {
			padding: 20px 16px;
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
	}
</style>
