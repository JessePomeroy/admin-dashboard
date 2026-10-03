<script lang="ts">
import { useQuery } from "convex-svelte";
import type { PaginationResult } from "convex/server";
import { useAdminClient } from "../adminClient";
import { getAdminConfig } from "../config";
import { logger } from "../logger";
import { addToast } from "../toast";
import type { Inquiry, InquiryStatus, InquiryUI } from "../types";
import { toId } from "../utils";
import InquiryDetailModal from "./inquiries/InquiryDetailModal.svelte";
import InquiryTable from "./inquiries/InquiryTable.svelte";

let { data }: { data: { inquiries: InquiryUI[] } } = $props();

const config = getAdminConfig();
const { api } = config;
const convexClient = useAdminClient();

// svelte-ignore state_referenced_locally
let legacyInquiries = $state<InquiryUI[]>(data.inquiries);
let selection = $state<InquiryUI | null>(null);
let statusFilter = $state<"all" | InquiryStatus>("all");
let cursors = $state<(string | null)[]>([null]);
let requestId = $state(0);
let switchingPage = $state(false);
let pendingStatuses = $state<Record<string, InquiryStatus>>({});
const cursor = $derived(cursors[cursors.length - 1]);
const inquiryQuery = api.inquiries.listPaginated ? useQuery(api.inquiries.listPaginated, () => ({
	siteUrl: config.siteUrl,
	...(statusFilter === "all" ? {} : { status: statusFilter }),
	// Leave headroom under the backend's read ceiling for reactive changes.
	paginationOpts: { numItems: 25, cursor, id: requestId },
}), { keepPreviousData: false }) : null;
const result = $derived(inquiryQuery?.data as PaginationResult<Inquiry> | undefined);
const splitError = new Error("This inquiry page changed. Retry to reload it.");
const pageError = $derived(result?.pageStatus === "SplitRequired" ? splitError : inquiryQuery?.error);
const page = $derived(pageError ? undefined : result);
const loading = $derived(switchingPage || Boolean(inquiryQuery?.isLoading));
const hasNext = $derived(Boolean(page && !page.isDone && page.continueCursor && page.continueCursor !== cursor));
const inquiries = $derived(inquiryQuery
	? (page?.page ?? []).map((inquiry): InquiryUI => ({
		...inquiry, subject: inquiry.subject ?? null,
		submittedAt: new Date(inquiry._creationTime).toISOString(),
	}))
	: legacyInquiries);

$effect(() => {
	if (result || inquiryQuery?.error) switchingPage = false;
});

function withPendingStatus(inquiry: InquiryUI): InquiryUI {
	const status = pendingStatuses[inquiry._id];
	return status ? { ...inquiry, status } : inquiry;
}

const selectedInquiry = $derived(selection
	? withPendingStatus(inquiries.find((inquiry) => inquiry._id === selection?._id) ?? selection)
	: null);

const statusOptions: (InquiryStatus | "all")[] = ["all", "new", "read", "replied"];

const filteredInquiries = $derived(
	inquiries.map(withPendingStatus).filter((inquiry) => statusFilter === "all" || inquiry.status === statusFilter),
);

function openInquiry(inq: InquiryUI) {
	selection = inq;
}

function closeModal() {
	selection = null;
}

function resetPages() {
	if (!inquiryQuery) return;
	switchingPage = true;
	cursors = [null];
}

function nextPage() {
	if (loading || !hasNext || !page) return;
	switchingPage = true;
	cursors = [...cursors, page.continueCursor];
}

function previousPage() {
	if (loading || cursors.length === 1) return;
	switchingPage = true;
	cursors = cursors.slice(0, -1);
}

function retryPage() {
	if (loading) return;
	switchingPage = true;
	requestId += 1;
}

let deletingInquiry = $state(false);
let inquiryBusy = $state(false);
async function deleteInquiry(id: string) {
	if (!api.inquiries.remove || inquiryBusy || !globalThis.confirm("Permanently delete this inquiry? Sent email and activity history are retained.")) return;
	deletingInquiry = true;
	inquiryBusy = true;
	try {
		await convexClient.mutation(api.inquiries.remove, { id: toId(id) });
		if (!inquiryQuery) legacyInquiries = legacyInquiries.filter((inquiry) => inquiry._id !== id);
		if (selection?._id === id) selection = null;
		addToast("Inquiry deleted.");
	} catch { addToast("Could not delete the inquiry. Refresh and try again."); }
	finally { deletingInquiry = false; inquiryBusy = false; }
}

async function updateStatus(id: string, newStatus: InquiryStatus) {
	if (inquiryBusy) return;
	inquiryBusy = true;
	// Pending edits never replace the authoritative page. Failure reveals the
	// latest query result, including updates received while this request ran.
	pendingStatuses = { ...pendingStatuses, [id]: newStatus };

	try {
		await convexClient.mutation(api.inquiries.updateStatus, {
			id: toId(id),
			status: newStatus,
		});
		if (!inquiryQuery) legacyInquiries = legacyInquiries.map((inquiry) => inquiry._id === id ? { ...inquiry, status: newStatus } : inquiry);
		// Keep the open detail usable when its new status removes it from this filter.
		if (selection?._id === id) selection = { ...selection, status: newStatus };
	} catch (err) {
		logger.error("Failed to update inquiry status:", err);
		addToast("Failed to update inquiry status.");
	} finally {
		const remaining = { ...pendingStatuses };
		delete remaining[id];
		pendingStatuses = remaining;
		inquiryBusy = false;
	}
}
</script>

<div class="inquiries-page admin-page">
	<header class="page-header">
		<h1>inquiries</h1>
	</header>

	<div class="toolbar">
		<select class="filter-select" bind:value={statusFilter} onchange={resetPages} aria-label="Filter by status">
			{#each statusOptions as status}
				<option value={status}>
					{status === "all" ? "all statuses" : status}
				</option>
			{/each}
		</select>
		{#if !loading && !pageError}
			<span class="count">{filteredInquiries.length} {filteredInquiries.length === 1 ? "inquiry" : "inquiries"}{inquiryQuery ? " on this page" : ""}</span>
		{/if}
	</div>

	{#if pageError}
		<div class="empty-state" role="alert">
			<p>could not load this inquiry page</p>
			<button class="page-button" onclick={retryPage}>retry</button>
		</div>
	{:else if loading}
		<div class="empty-state" role="status">loading inquiries…</div>
	{:else if filteredInquiries.length === 0}
		<div class="empty-state">no inquiries found</div>
	{:else}
		<InquiryTable inquiries={filteredInquiries} onview={openInquiry} />
	{/if}
	{#if inquiryQuery}
		<nav class="pagination" aria-label="Inquiry pages">
			<button class="page-button" onclick={previousPage} disabled={loading || cursors.length === 1}>previous</button>
			<span class="count" aria-live="polite">page {cursors.length}</span>
			<button class="page-button" onclick={nextPage} disabled={loading || !hasNext}>next</button>
		</nav>
	{/if}
</div>

{#if selectedInquiry}
	<InquiryDetailModal
		inquiry={selectedInquiry}
		onclose={closeModal}
		onupdatestatus={updateStatus}
		ondelete={api.inquiries.remove ? deleteInquiry : undefined}
		deleting={deletingInquiry}
		busy={inquiryBusy}
	/>
{/if}

<style>
	.inquiries-page {
		padding: 48px 40px;
		max-width: 1100px;
	}

	.page-header {
		margin-bottom: 32px;
	}

	.page-header h1 {
		font-family: "Chillax", sans-serif;
		font-size: 1.8rem;
		font-weight: 500;
		color: var(--admin-heading);
		margin: 0;
		letter-spacing: -0.01em;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 24px;
	}

	.filter-select {
		padding: 7px 12px;
		background: var(--admin-dropdown-bg);
		border: 1px solid var(--admin-border-strong);
		border-radius: 6px;
		color: var(--admin-text);
		font-size: 0.83rem;
		font-family: "Synonym", system-ui, sans-serif;
	}

	.count {
		font-size: 0.8rem;
		color: var(--admin-text-subtle);
	}

	.empty-state {
		padding: 48px 0;
		color: var(--admin-text-subtle);
		font-size: 0.88rem;
	}

	.pagination {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-top: 24px;
	}

	.page-button {
		padding: 7px 12px;
		border: 1px solid var(--admin-border-strong);
		border-radius: 6px;
		background: var(--admin-dropdown-bg);
		color: var(--admin-text);
		font: inherit;
		font-size: 0.83rem;
		cursor: pointer;
	}

	.page-button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.page-button:focus-visible {
		outline: 2px solid var(--admin-accent);
		outline-offset: 3px;
	}

	@media (max-width: 768px) {
		.inquiries-page {
			padding: 20px 16px;
		}

		.toolbar {
			flex-direction: column;
			align-items: flex-start;
			gap: 8px;
		}
	}
</style>
