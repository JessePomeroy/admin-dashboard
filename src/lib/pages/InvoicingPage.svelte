<script lang="ts">
import { page } from "$app/stores";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../adminClient";
import { getAdminConfig } from "../config";
import FeatureGate from "../components/FeatureGate.svelte";
import FilterBar from "../components/FilterBar.svelte";
import LoadingState from "../components/LoadingState.svelte";
import PageHeader from "../components/PageHeader.svelte";
import type { Invoice, InvoiceStatus } from "../types";
import {
	isTerminalDocumentEmailRecovery,
	type DocumentEmailRecovery,
	type DocumentEmailResolutionOutcome,
} from "../documentEmailRecovery";
import { addToast } from "../toast";
import { logger } from "../logger";
import { copyPortalLink, toId } from "../utils";
import {
	type HydratedDocumentEmailAttempt,
	createDocumentEmailRequestTracker,
	documentEmailFailureMessage,
	presentableDocumentEmailRecoveryFromError,
	statusAfterSuccessfulDocumentEmail,
} from "./documentEmailRequest";
import InvoiceCreateModal from "./invoicing/InvoiceCreateModal.svelte";
import InvoiceDetailModal from "./invoicing/InvoiceDetailModal.svelte";
import InvoiceTable from "./invoicing/InvoiceTable.svelte";

const config = getAdminConfig();
const { api } = config;

let { data } = $props();

const client = useAdminClient();
const invoicesQuery = useQuery(api.invoices.list, { siteUrl: config.siteUrl });
const clientsQuery = useQuery(api.crm.listClients, { siteUrl: config.siteUrl });
const numberPreviewQuery = useQuery(api.invoices.getNextNumber, { siteUrl: config.siteUrl });
const templatesQuery = useQuery(api.emailTemplates.list, { siteUrl: config.siteUrl });

let invoices = $derived(invoicesQuery.data ?? []);
let clients = $derived(clientsQuery.data ?? []);
let numberPreview = $derived(numberPreviewQuery.data ?? "INV-001");
let emailTemplates = $derived(templatesQuery.data ?? []);
let isLoading = $derived(invoicesQuery.isLoading || clientsQuery.isLoading || numberPreviewQuery.isLoading);

let statusFilter = $state("all");
let searchQuery = $state("");
let showCreateModal = $state(false);
let selectedInvoice = $state<Invoice | null>(null);
let shareLinkCopied = $state(false);
const emailRequests = createDocumentEmailRequestTracker();
let pageEmailRecovery = $state<{
	documentId: string;
	attempt: HydratedDocumentEmailAttempt;
} | null>(null);
let hydratedInvoiceId = "";

function invoiceEmailKey(invoiceId: string) {
	return `invoice:${invoiceId}`;
}

function invoiceEmailEndpoint(invoiceId: string) {
	return `/api/admin/invoicing/${invoiceId}/send`;
}

function rememberInvoiceRecovery(
	invoiceId: string,
	attempt: HydratedDocumentEmailAttempt,
) {
	pageEmailRecovery = { documentId: invoiceId, attempt };
}

function visibleInvoiceRecovery(
	invoiceId: string,
): HydratedDocumentEmailAttempt | null {
	return pageEmailRecovery?.documentId === invoiceId
		? pageEmailRecovery.attempt
		: null;
}

async function hydrateInvoiceRecovery(invoiceId: string) {
	const key = invoiceEmailKey(invoiceId);
	const endpoint = invoiceEmailEndpoint(invoiceId);
	const pending = emailRequests.pending(key, endpoint);
	if (pending) rememberInvoiceRecovery(invoiceId, { attemptId: pending.attemptId });
	try {
		const hydrated = await emailRequests.hydrate(key, endpoint, {
			type: "invoice",
			id: invoiceId,
		});
		if (selectedInvoice?._id !== invoiceId) return;
		if (hydrated) rememberInvoiceRecovery(invoiceId, hydrated);
		else if (
			pageEmailRecovery?.documentId === invoiceId &&
			(!pageEmailRecovery.attempt.recovery ||
				!isTerminalDocumentEmailRecovery(pageEmailRecovery.attempt.recovery))
		) {
			pageEmailRecovery = null;
		}
	} catch (error) {
		logger.error("Failed to discover invoice email recovery:", error);
	}
}

$effect(() => {
	const invoiceId = selectedInvoice?._id as string | undefined;
	if (!invoiceId) {
		hydratedInvoiceId = "";
		return;
	}
	if (hydratedInvoiceId === invoiceId) return;
	hydratedInvoiceId = invoiceId;
	void hydrateInvoiceRecovery(invoiceId);
});

// Auto-open invoice from ?open= query param (e.g. from activity timeline)
let openHandled = false;
$effect(() => {
	if (openHandled || invoices.length === 0) return;
	const openId = $page.url.searchParams.get("open");
	if (openId) {
		const match = invoices.find((inv: Invoice) => inv._id === openId);
		if (match) {
			selectedInvoice = match;
			openHandled = true;
		}
	}
});

const allStatuses: InvoiceStatus[] = [
	"draft",
	"sent",
	"paid",
	"overdue",
	"canceled",
];

let filteredInvoices = $derived(
	invoices.filter((inv: Invoice) => {
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

async function sendInvoiceEmailRequest(
	invoiceId: string,
	body: Record<string, unknown>,
) {
	await emailRequests.post(
		invoiceEmailKey(invoiceId),
		invoiceEmailEndpoint(invoiceId),
		body,
		{
		retries: 2,
		},
	);
}

async function handleCreate(body: Record<string, unknown>) {
	await client.mutation(api.invoices.create, {
		siteUrl: config.siteUrl,
		clientId: toId(body.clientId as string),
		invoiceType: body.invoiceType as "one-time" | "recurring" | "deposit" | "package" | "milestone",
		items: body.items as { description: string; quantity: number; unitPrice: number }[],
		taxPercent: body.taxPercent as number | undefined,
		notes: body.notes as string | undefined,
		dueDate: body.dueDate as string | undefined,
		recurring: body.recurring as Invoice["recurring"],
		depositPercent: body.depositPercent as number | undefined,
		totalProject: body.totalProject as number | undefined,
		milestoneName: body.milestoneName as string | undefined,
		milestoneIndex: body.milestoneIndex as number | undefined,
		parentInvoiceId: toId(body.parentInvoiceId as string),
	});
	showCreateModal = false;
}

async function saveAndSendInvoice(body: Record<string, unknown> & { templateId?: string; emailSubject?: string; emailBody?: string }) {
	const { templateId, emailSubject, emailBody, ...invoiceBody } = body;
	const invoiceId = await client.mutation(api.invoices.create, {
		siteUrl: config.siteUrl,
		clientId: toId(invoiceBody.clientId as string),
		invoiceType: invoiceBody.invoiceType as "one-time" | "recurring" | "deposit" | "package" | "milestone",
		items: invoiceBody.items as { description: string; quantity: number; unitPrice: number }[],
		taxPercent: invoiceBody.taxPercent as number | undefined,
		notes: invoiceBody.notes as string | undefined,
		dueDate: invoiceBody.dueDate as string | undefined,
		recurring: invoiceBody.recurring as Invoice["recurring"],
		depositPercent: invoiceBody.depositPercent as number | undefined,
		totalProject: invoiceBody.totalProject as number | undefined,
		milestoneName: invoiceBody.milestoneName as string | undefined,
		milestoneIndex: invoiceBody.milestoneIndex as number | undefined,
		parentInvoiceId: toId(invoiceBody.parentInvoiceId as string),
	});
	showCreateModal = false;
	try {
		await sendInvoiceEmailRequest(invoiceId as string, {
			templateId,
			customSubject: emailSubject,
			customBody: emailBody,
		});
	} catch (err) {
		const attempt = presentableDocumentEmailRecoveryFromError(err);
		if (
			attempt &&
			(!selectedInvoice || selectedInvoice._id === (invoiceId as string))
		) {
			rememberInvoiceRecovery(invoiceId as string, attempt);
		}
		logger.error("Invoice saved but its email was not confirmed:", err);
		addToast(`Invoice saved. ${documentEmailFailureMessage(err)}`);
	}
}

async function handleSave(body: Record<string, unknown>) {
	if (!selectedInvoice) return;
	const invoiceId = selectedInvoice._id as string;
	const invoiceSnapshot = selectedInvoice;
	await client.mutation(api.invoices.update, {
		invoiceId: toId(invoiceId),
		siteUrl: config.siteUrl,
		items: body.items as { description: string; quantity: number; unitPrice: number }[] | undefined,
		taxPercent: body.taxPercent as number | undefined,
		notes: body.notes as string | undefined,
		dueDate: body.dueDate as string | undefined,
		status: body.status as string | undefined,
	});
	if (selectedInvoice?._id === invoiceId) {
		selectedInvoice = { ...invoiceSnapshot, ...body } as Invoice;
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
	await sendInvoiceEmailRequest(invoiceId, { templateId, changeNote });
	if (pageEmailRecovery?.documentId === invoiceId) pageEmailRecovery = null;
	if (selectedInvoice?._id === invoiceId) {
		selectedInvoice = {
			...selectedInvoice,
			status: statusAfterSuccessfulDocumentEmail(selectedInvoice.status),
		} as Invoice;
	}
}

function handleEmailResolved(result: {
	attemptId: string;
	outcome: DocumentEmailResolutionOutcome;
	recovery: DocumentEmailRecovery;
}) {
	const documentId = result.recovery.document.id;
	emailRequests.clearResolved(
		invoiceEmailKey(documentId),
		result.attemptId,
	);
	const pending = emailRequests.pending(
		invoiceEmailKey(documentId),
		invoiceEmailEndpoint(documentId),
	);
	if (
		(pending && pending.attemptId !== result.attemptId) ||
		(pageEmailRecovery?.documentId === documentId &&
			pageEmailRecovery.attempt.attemptId !== result.attemptId)
	) {
		return;
	}
	if (selectedInvoice && documentId !== selectedInvoice._id) return;
	rememberInvoiceRecovery(documentId, {
		attemptId: result.attemptId,
		recovery: result.recovery,
	});
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
	if (selectedInvoice && selectedInvoice._id !== invoiceId) return;
	rememberInvoiceRecovery(invoiceId, attempt);
}

function handleEmailTerminal(result: {
	attemptId: string;
	recovery: DocumentEmailRecovery;
}) {
	const documentId = result.recovery.document.id;
	emailRequests.clearResolved(invoiceEmailKey(documentId), result.attemptId);
	const pending = emailRequests.pending(
		invoiceEmailKey(documentId),
		invoiceEmailEndpoint(documentId),
	);
	if (
		(pending && pending.attemptId !== result.attemptId) ||
		(pageEmailRecovery?.documentId === documentId &&
			pageEmailRecovery.attempt.attemptId !== result.attemptId)
	) {
		return;
	}
	if (selectedInvoice && selectedInvoice._id !== documentId) return;
	rememberInvoiceRecovery(documentId, {
		attemptId: result.attemptId,
		recovery: result.recovery,
	});
	if (!selectedInvoice) return;
	if (result.recovery.status === "sent") {
		selectedInvoice = {
			...selectedInvoice,
			status: statusAfterSuccessfulDocumentEmail(selectedInvoice.status),
		} as Invoice;
	}
}

function dismissEmailRecovery(result: {
	attemptId: string;
	recovery: DocumentEmailRecovery;
}) {
	if (
		pageEmailRecovery?.documentId === result.recovery.document.id &&
		pageEmailRecovery.attempt.attemptId === result.attemptId
	) {
		pageEmailRecovery = null;
	}
}

async function handleDelete() {
	if (!selectedInvoice) return;
	await client.mutation(api.invoices.remove, {
		invoiceId: toId(selectedInvoice._id),
		siteUrl: config.siteUrl,
	});
	selectedInvoice = null;
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
</script>

<FeatureGate feature="invoicing" adminSession={data.adminSession}>
	{#if isLoading}
		<LoadingState />
	{:else}
	<div class="invoice-page">
		<PageHeader title="invoicing">
			{#snippet actions()}
				<button
					class="btn-add"
					onclick={() => {
						showCreateModal = true;
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
					new invoice
				</button>
			{/snippet}
		</PageHeader>

		<div class="stats-line">
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
						statusFilter = v;
					},
				},
			]}
			{searchQuery}
			searchPlaceholder="search by invoice # or client..."
			onsearch={(q) => {
				searchQuery = q;
			}}
		/>

		<InvoiceTable
			invoices={filteredInvoices}
			onselect={(inv) => {
				selectedInvoice = { ...inv };
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
			onclose={() => {
				showCreateModal = false;
			}}
		/>
	{/if}

	{#if selectedInvoice}
		<InvoiceDetailModal
			invoice={selectedInvoice}
			templates={emailTemplates}
			onsave={handleSave}
			onaction={handleAction}
			onsend={handleSendEmail}
			ondelete={handleDelete}
			onshare={handleShareLink}
			{shareLinkCopied}
			onemailresolved={handleEmailResolved}
			emailRecoveryAttempt={visibleInvoiceRecovery(selectedInvoice._id as string)}
			onemailrecovery={handleEmailRecovery}
			onemailterminal={handleEmailTerminal}
			onemailrecoverydismiss={dismissEmailRecovery}
			onclose={() => {
				selectedInvoice = null;
			}}
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
