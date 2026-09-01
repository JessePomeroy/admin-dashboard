<script lang="ts">
import { page } from "$app/stores";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../adminClient";
import { getAdminConfig } from "../config";
import FeatureGate from "../components/FeatureGate.svelte";
import LoadingState from "../components/LoadingState.svelte";
import type { Quote, QuotePreset } from "../types";
import {
	isTerminalDocumentEmailRecovery,
	type DocumentEmailRecovery,
	type DocumentEmailResolutionOutcome,
} from "../documentEmailRecovery";
import { copyPortalLink, toId } from "../utils";
import { addToast } from "../toast";
import { logger } from "../logger";
import {
	type HydratedDocumentEmailAttempt,
	createDocumentEmailRequestTracker,
	documentEmailFailureMessage,
	presentableDocumentEmailRecoveryFromError,
	statusAfterSuccessfulDocumentEmail,
} from "./documentEmailRequest";
import PresetManager from "./quotes/PresetManager.svelte";
import QuoteCreateModal from "./quotes/QuoteCreateModal.svelte";
import QuoteDetailModal from "./quotes/QuoteDetailModal.svelte";
import QuoteTable from "./quotes/QuoteTable.svelte";
import {
	type EditableQuotePackage,
	normalizeEditableQuotePackages,
} from "./quotes/quotePackages";

const config = getAdminConfig();
const { api } = config;

let { data } = $props();

const client = useAdminClient();
const quotesQuery = useQuery(api.quotes.list, { siteUrl: config.siteUrl });
const clientsQuery = useQuery(api.crm.listClients, { siteUrl: config.siteUrl });
const numberPreviewQuery = useQuery(api.quotes.getNextNumber, { siteUrl: config.siteUrl });
const presetsQuery = useQuery(api.quotes.listPresets, { siteUrl: config.siteUrl });
const invoiceNumberPreviewQuery = useQuery(api.invoices.getNextNumber, { siteUrl: config.siteUrl });
const emailTemplatesQuery = useQuery(api.emailTemplates.list, { siteUrl: config.siteUrl });

let quotes = $derived(quotesQuery.data ?? []);
let clients = $derived(clientsQuery.data ?? []);
let numberPreview = $derived(numberPreviewQuery.data ?? "QT-001");
let presets = $derived(presetsQuery.data ?? []);
let invoiceNumberPreview = $derived(invoiceNumberPreviewQuery.data ?? "INV-001");
let emailTemplates = $derived(emailTemplatesQuery.data ?? []);
let isLoading = $derived(quotesQuery.isLoading || clientsQuery.isLoading || numberPreviewQuery.isLoading || presetsQuery.isLoading || invoiceNumberPreviewQuery.isLoading);

// Tab state
let activeTab = $state<"quotes" | "presets">("quotes");

// Filter state
let statusFilter = $state("all");
let searchQuery = $state("");

// Modal state
let showCreateModal = $state(false);
let selectedQuote = $state<Quote | null>(null);
let saving = $state(false);

// Auto-open quote from ?open= query param
let openHandled = false;
$effect(() => {
	if (openHandled || quotes.length === 0) return;
	const openId = $page.url.searchParams.get("open");
	if (openId) {
		const match = quotes.find((q: Quote) => q._id === openId);
		if (match) {
			openDetailModal(match);
			openHandled = true;
		}
	}
});
let sending = $state(false);
let shareLinkCopied = $state(false);
let sendResult = $state<"success" | "error" | "uncertain" | null>(null);
let emailRecoveryAttempt = $state<HydratedDocumentEmailAttempt | null>(null);
let emailRecoveryDocumentId = $state("");
const emailRequests = createDocumentEmailRequestTracker();
let converting = $state(false);
let convertSuccess = $state(false);

// Preset modal state
let showPresetModal = $state(false);
let selectedPreset = $state<QuotePreset | null>(null);

const allStatuses = ["draft", "sent", "accepted", "declined", "expired"];

let filteredQuotes = $derived(
	quotes.filter((q: Quote) => {
		if (statusFilter !== "all" && q.status !== statusFilter) return false;
		if (searchQuery) {
			const s = searchQuery.toLowerCase();
			const matchNumber = q.quoteNumber?.toLowerCase().includes(s);
			const matchClient = q.clientName?.toLowerCase().includes(s);
			if (!matchNumber && !matchClient) return false;
		}
		return true;
	}),
);

let stats = $derived({
	total: quotes.length,
	draft: quotes.filter((q: Quote) => q.status === "draft").length,
	sent: quotes.filter((q: Quote) => q.status === "sent").length,
	accepted: quotes.filter((q: Quote) => q.status === "accepted").length,
	declined: quotes.filter((q: Quote) => q.status === "declined").length,
	expired: quotes.filter((q: Quote) => q.status === "expired").length,
});

// --- API handlers ---

async function saveNewQuote(formData: {
	clientId: string;
	category: string;
	packages: EditableQuotePackage[];
	validUntil: string;
	notes: string;
}) {
	saving = true;
	try {
		const packages = normalizeEditableQuotePackages(formData.packages);
		await client.mutation(api.quotes.create, {
			siteUrl: config.siteUrl,
			clientId: toId(formData.clientId),
			category: formData.category as "photography" | "web" | undefined,
			packages,
			validUntil: formData.validUntil || undefined,
			notes: formData.notes || undefined,
		});
		showCreateModal = false;
	} catch (err) {
		logger.error("Failed to create quote:", err);
		addToast("Failed to create quote.");
	} finally {
		saving = false;
	}
}

async function saveAndSendQuote(formData: {
	clientId: string;
	category: string;
	packages: EditableQuotePackage[];
	validUntil: string;
	notes: string;
	templateId?: string;
	emailSubject?: string;
	emailBody?: string;
}) {
	saving = true;
	try {
		const packages = normalizeEditableQuotePackages(formData.packages);
		const quoteId = await client.mutation(api.quotes.create, {
			siteUrl: config.siteUrl,
			clientId: toId(formData.clientId),
			category: formData.category as "photography" | "web" | undefined,
			packages,
			validUntil: formData.validUntil || undefined,
			notes: formData.notes || undefined,
		});
		showCreateModal = false;
		try {
			await emailRequests.post(
				`quote:${quoteId}`,
				`/api/admin/quotes/${quoteId}/send`,
				{
					templateId: formData.templateId,
					customSubject: formData.emailSubject,
					customBody: formData.emailBody,
				},
				{ retries: 2 },
			);
		} catch (err) {
			const attempt = presentableDocumentEmailRecoveryFromError(err) ?? null;
			if (!selectedQuote || selectedQuote._id === (quoteId as string)) {
				emailRecoveryAttempt = attempt;
				emailRecoveryDocumentId = attempt ? (quoteId as string) : "";
			}
			logger.error("Quote saved but its email was not confirmed:", err);
			addToast(`Quote saved. ${documentEmailFailureMessage(err)}`);
		}
	} catch (err) {
		logger.error("Failed to create quote:", err);
		addToast("Failed to create quote.");
	} finally {
		saving = false;
	}
}

async function saveAsPreset(presetData: {
	name: string;
	category: string;
	packages: EditableQuotePackage[];
}) {
	saving = true;
	try {
		const packages = normalizeEditableQuotePackages(presetData.packages);
		await client.mutation(api.quotes.createPreset, {
			siteUrl: config.siteUrl,
			name: presetData.name,
			category: presetData.category as "photography" | "web" | undefined,
			packages,
		});
	} catch (err) {
		logger.error("Failed to save preset:", err);
		addToast("Failed to save preset.");
	} finally {
		saving = false;
	}
}

async function saveQuoteEdit(editData: {
	packages: EditableQuotePackage[];
	category: "photography" | "web";
	validUntil: string;
	notes: string;
}) {
	if (!selectedQuote) return;
	saving = true;
	try {
		const packages = normalizeEditableQuotePackages(editData.packages);
		await client.mutation(api.quotes.update, {
			quoteId: toId(selectedQuote._id),
			siteUrl: config.siteUrl,
			packages,
			validUntil: editData.validUntil || undefined,
			notes: editData.notes || undefined,
		});
		selectedQuote = {
			...selectedQuote,
			packages,
			category: editData.category,
			validUntil: editData.validUntil || undefined,
			notes: editData.notes || undefined,
		} as Quote;
	} catch (err) {
		logger.error("Failed to update quote:", err);
		addToast("Failed to save changes.");
	} finally {
		saving = false;
	}
}

async function sendQuoteEmail(templateId?: string, changeNote?: string) {
	if (!selectedQuote) return;
	const quoteId = selectedQuote._id as string;
	sending = true;
	sendResult = null;
	try {
		await emailRequests.post(
			`quote:${quoteId}`,
			`/api/admin/quotes/${quoteId}/send`,
			{ templateId, changeNote },
			{ retries: 2 },
		);
		if (emailRecoveryDocumentId === quoteId) {
			emailRecoveryAttempt = null;
			emailRecoveryDocumentId = "";
		}
		if (selectedQuote?._id === quoteId) {
			sendResult = "success";
			selectedQuote = {
				...selectedQuote,
				status: statusAfterSuccessfulDocumentEmail(selectedQuote.status),
			} as Quote;
		}
	} catch (err) {
		logger.error("Failed to send quote email:", err);
		addToast(documentEmailFailureMessage(err));
		const attempt = presentableDocumentEmailRecoveryFromError(err) ?? null;
		if (!selectedQuote || selectedQuote._id === quoteId) {
			emailRecoveryAttempt = attempt;
			sendResult = attempt ? "uncertain" : "error";
			emailRecoveryDocumentId = attempt ? quoteId : "";
		}
	} finally {
		sending = false;
	}
}

function handleQuoteEmailResolved(result: {
	attemptId: string;
	outcome: DocumentEmailResolutionOutcome;
	recovery: DocumentEmailRecovery;
}) {
	const documentId = result.recovery.document.id;
	emailRequests.clearResolved(`quote:${documentId}`, result.attemptId);
	const pending = emailRequests.pending(
		`quote:${documentId}`,
		`/api/admin/quotes/${documentId}/send`,
	);
	if (
		(pending && pending.attemptId !== result.attemptId) ||
		(emailRecoveryDocumentId === documentId &&
			emailRecoveryAttempt?.attemptId !== result.attemptId)
	) {
		return;
	}
	if (selectedQuote && documentId !== selectedQuote._id) return;
	emailRecoveryAttempt = {
		attemptId: result.attemptId,
		recovery: result.recovery,
	};
	emailRecoveryDocumentId = documentId;
	if (!selectedQuote) return;
	if (result.recovery.status === "sent") {
		sendResult = "uncertain";
		selectedQuote = {
			...selectedQuote,
			status: statusAfterSuccessfulDocumentEmail(selectedQuote.status),
		} as Quote;
		addToast("Accepted email delivery recorded.", "success");
	} else {
		sendResult = "uncertain";
		addToast("Email recorded as not accepted. No replacement was sent.", "success");
	}
}

function handleQuoteEmailTerminal(result: {
	attemptId: string;
	recovery: DocumentEmailRecovery;
}) {
	const documentId = result.recovery.document.id;
	emailRequests.clearResolved(`quote:${documentId}`, result.attemptId);
	const pending = emailRequests.pending(
		`quote:${documentId}`,
		`/api/admin/quotes/${documentId}/send`,
	);
	if (
		(pending && pending.attemptId !== result.attemptId) ||
		(emailRecoveryDocumentId === documentId &&
			emailRecoveryAttempt?.attemptId !== result.attemptId)
	) {
		return;
	}
	if (selectedQuote && selectedQuote._id !== documentId) return;
	emailRecoveryAttempt = {
		attemptId: result.attemptId,
		recovery: result.recovery,
	};
	emailRecoveryDocumentId = documentId;
	if (!selectedQuote) return;
	if (result.recovery.status === "sent") {
		selectedQuote = {
			...selectedQuote,
			status: statusAfterSuccessfulDocumentEmail(selectedQuote.status),
		} as Quote;
	}
}

function dismissQuoteEmailRecovery(result: {
	attemptId: string;
	recovery: DocumentEmailRecovery;
}) {
	if (
		emailRecoveryDocumentId === result.recovery.document.id &&
		emailRecoveryAttempt?.attemptId === result.attemptId
	) {
		emailRecoveryAttempt = null;
		emailRecoveryDocumentId = "";
	}
	if (selectedQuote && selectedQuote._id !== result.recovery.document.id) return;
	sendResult = result.recovery.status === "sent" ? "success" : null;
}

async function quoteAction(action: string) {
	if (!selectedQuote) return;
	saving = true;
	try {
		if (action === "send") {
			await client.mutation(api.quotes.markSent, {
				quoteId: toId(selectedQuote._id),
				siteUrl: config.siteUrl,
			});
			selectedQuote = { ...selectedQuote, status: "sent" } as Quote;
		} else if (action === "accept") {
			await client.mutation(api.quotes.markAccepted, {
				quoteId: toId(selectedQuote._id),
				siteUrl: config.siteUrl,
			});
			selectedQuote = { ...selectedQuote, status: "accepted" } as Quote;
		} else if (action === "decline") {
			await client.mutation(api.quotes.markDeclined, {
				quoteId: toId(selectedQuote._id),
				siteUrl: config.siteUrl,
			});
			selectedQuote = { ...selectedQuote, status: "declined" } as Quote;
		} else if (action === "expire") {
			await client.mutation(api.quotes.update, {
				quoteId: toId(selectedQuote._id),
				siteUrl: config.siteUrl,
				status: "expired",
			});
			selectedQuote = { ...selectedQuote, status: "expired" } as Quote;
		}
	} catch (err) {
		logger.error("Failed to update quote:", err);
		addToast("Failed to save changes.");
	} finally {
		saving = false;
	}
}

async function deleteQuote() {
	if (!selectedQuote) return;
	saving = true;
	try {
		await client.mutation(api.quotes.remove, {
			quoteId: toId(selectedQuote._id),
			siteUrl: config.siteUrl,
		});
		selectedQuote = null;
	} catch (err) {
		logger.error("Failed to delete quote:", err);
		addToast("Failed to delete quote.");
	} finally {
		saving = false;
	}
}

async function convertToInvoice(convertData: {
	invoiceType: string;
	dueDate: string;
	notes: string;
}) {
	if (!selectedQuote) return;
	converting = true;
	try {
		const invoiceId = await client.mutation(api.quotes.convertToInvoice, {
			quoteId: toId(selectedQuote._id),
			siteUrl: config.siteUrl,
			invoiceType: convertData.invoiceType as "one-time" | "recurring" | "deposit" | "package" | "milestone",
			dueDate: convertData.dueDate || undefined,
			notes: convertData.notes || undefined,
		});
		selectedQuote = {
			...selectedQuote,
			convertedToInvoice: invoiceId,
		} as Quote;
		convertSuccess = true;
	} catch (err) {
		logger.error("Failed to convert quote to invoice:", err);
		addToast("Failed to convert to invoice.");
	} finally {
		converting = false;
	}
}

async function copyShareLink() {
	if (!selectedQuote) return;
	shareLinkCopied = false;
	try {
		await copyPortalLink(client, api, config.siteUrl, "quote", selectedQuote._id as string, selectedQuote.clientId as string);
		shareLinkCopied = true;
		setTimeout(() => { shareLinkCopied = false; }, 3000);
	} catch (err) {
		logger.error("Failed to create share link:", err);
		addToast("Failed to create share link.");
	}
}

// Preset API handlers

async function saveNewPreset(presetData: {
	name: string;
	category: "photography" | "web" | "";
	packages: EditableQuotePackage[];
}) {
	saving = true;
	try {
		const packages = normalizeEditableQuotePackages(presetData.packages);
		await client.mutation(api.quotes.createPreset, {
			siteUrl: config.siteUrl,
			name: presetData.name,
			category: presetData.category ? (presetData.category as "photography" | "web") : undefined,
			packages,
		});
	} catch (err) {
		logger.error("Failed to create preset:", err);
		addToast("Failed to create preset.");
	} finally {
		saving = false;
	}
}

async function savePresetEdit(editData: {
	presetId: string;
	name: string;
	category: "photography" | "web" | "";
	packages: EditableQuotePackage[];
}) {
	saving = true;
	try {
		const packages = normalizeEditableQuotePackages(editData.packages);
		await client.mutation(api.quotes.updatePreset, {
			presetId: toId(editData.presetId),
			siteUrl: config.siteUrl,
			name: editData.name,
			category: editData.category ? (editData.category as "photography" | "web") : undefined,
			packages,
		});
		selectedPreset = {
			...selectedPreset!,
			name: editData.name,
			category: editData.category || undefined,
			packages,
		} as QuotePreset;
	} catch (err) {
		logger.error("Failed to update preset:", err);
		addToast("Failed to save preset.");
	} finally {
		saving = false;
	}
}

async function deletePreset(presetId: string) {
	saving = true;
	try {
		await client.mutation(api.quotes.removePreset, {
			presetId: toId(presetId),
			siteUrl: config.siteUrl,
		});
		showPresetModal = false;
		selectedPreset = null;
	} catch (err) {
		logger.error("Failed to delete preset:", err);
		addToast("Failed to delete preset.");
	} finally {
		saving = false;
	}
}

async function hydrateQuoteRecovery(quoteId: string) {
	const key = `quote:${quoteId}`;
	const endpoint = `/api/admin/quotes/${quoteId}/send`;
	const pending = emailRequests.pending(key, endpoint);
	if (pending) {
		emailRecoveryAttempt = { attemptId: pending.attemptId };
		emailRecoveryDocumentId = quoteId;
		sendResult = "uncertain";
	}
	try {
		const hydrated = await emailRequests.hydrate(key, endpoint, {
			type: "quote",
			id: quoteId,
		});
		if (selectedQuote?._id !== quoteId) return;
		if (hydrated) {
			emailRecoveryAttempt = hydrated;
			emailRecoveryDocumentId = quoteId;
			sendResult = "uncertain";
		} else if (
			emailRecoveryDocumentId === quoteId &&
			(!emailRecoveryAttempt?.recovery ||
				!isTerminalDocumentEmailRecovery(emailRecoveryAttempt.recovery))
		) {
			emailRecoveryAttempt = null;
			emailRecoveryDocumentId = "";
		}
	} catch (error) {
		logger.error("Failed to discover quote email recovery:", error);
	}
}

function visibleQuoteRecovery(quoteId: string) {
	return emailRecoveryDocumentId === quoteId ? emailRecoveryAttempt : null;
}

function openDetailModal(quote: Quote) {
	selectedQuote = { ...quote };
	sendResult = null;
	shareLinkCopied = false;
	converting = false;
	convertSuccess = false;
	void hydrateQuoteRecovery(quote._id as string);
}

function openPresetModal(preset?: QuotePreset) {
	selectedPreset = preset ? ({ ...preset } as QuotePreset) : null;
	showPresetModal = true;
}

function closePresetModal() {
	showPresetModal = false;
	selectedPreset = null;
}
</script>

<FeatureGate feature="quotes" adminSession={data.adminSession}>
{#if isLoading}
	<LoadingState />
{:else}
<div class="quote-page">
	<header class="page-header">
		<div class="header-left">
			<h1>quotes</h1>
		</div>
		<button class="btn-add" onclick={() => { if (activeTab === "presets") openPresetModal(); else showCreateModal = true; }}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
			{activeTab === "presets" ? "new preset" : "new quote"}
		</button>
	</header>

	<div class="stats-line">
		<span>{stats.total} total</span>
		<span class="stat-sep">&middot;</span>
		<span>{stats.draft} draft</span>
		<span class="stat-sep">&middot;</span>
		<span>{stats.sent} sent</span>
		<span class="stat-sep">&middot;</span>
		<span>{stats.accepted} accepted</span>
		<span class="stat-sep">&middot;</span>
		<span>{stats.declined} declined</span>
		{#if stats.expired > 0}
			<span class="stat-sep">&middot;</span>
			<span>{stats.expired} expired</span>
		{/if}
	</div>

	<div class="tab-bar" role="tablist">
		<button class="tab-btn" class:tab-active={activeTab === "quotes"} role="tab" aria-selected={activeTab === "quotes"} onclick={() => { activeTab = "quotes"; }}>quotes</button>
		<button class="tab-btn" class:tab-active={activeTab === "presets"} role="tab" aria-selected={activeTab === "presets"} onclick={() => { activeTab = "presets"; }}>presets</button>
	</div>

	{#if activeTab === "quotes"}
		<div class="filter-bar">
			<select class="filter-select" bind:value={statusFilter}>
				<option value="all">all statuses</option>
				{#each allStatuses as s}
					<option value={s}>{s}</option>
				{/each}
			</select>
			<input class="filter-search" type="text" placeholder="search by quote # or client..." bind:value={searchQuery} />
		</div>

		<QuoteTable quotes={filteredQuotes} onselect={openDetailModal} />
	{:else}
		<PresetManager
			{presets}
			{showPresetModal}
			{selectedPreset}
			{saving}
			onopen={openPresetModal}
			onclose={closePresetModal}
			onsavenew={saveNewPreset}
			onsaveedit={savePresetEdit}
			ondelete={deletePreset}
		/>
	{/if}
</div>

{#if showCreateModal}
	<QuoteCreateModal
		{clients}
		{presets}
		{numberPreview}
		{saving}
		{emailTemplates}
		onsave={saveNewQuote}
		onsaveandsend={saveAndSendQuote}
		onsaveaspreset={saveAsPreset}
		onclose={() => { showCreateModal = false; }}
	/>
{/if}

{#if selectedQuote}
	<QuoteDetailModal
		quote={selectedQuote}
		{invoiceNumberPreview}
		{saving}
		{sending}
		{shareLinkCopied}
		{sendResult}
		emailRecoveryAttempt={visibleQuoteRecovery(selectedQuote._id as string)}
		{convertSuccess}
		{converting}
		templates={emailTemplates}
		onclose={() => { selectedQuote = null; sendResult = null; convertSuccess = false; }}
		onsaveedit={saveQuoteEdit}
		onsendquoteemail={sendQuoteEmail}
		onemailresolved={handleQuoteEmailResolved}
		onemailterminal={handleQuoteEmailTerminal}
		onemailrecoverydismiss={dismissQuoteEmailRecovery}
		onquoteaction={quoteAction}
		ondeletequote={deleteQuote}
		oncopysharelink={copyShareLink}
		onconverttoinvoice={convertToInvoice}
		onsendresultclear={() => { sendResult = null; }}
	/>
{/if}
{/if}
</FeatureGate>

<style>
	.quote-page {
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
		color: var(--admin-text-muted);
		font-size: 0.85rem;
		font-family: "Synonym", system-ui, sans-serif;
		padding: 8px 16px;
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
		.quote-page {
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
