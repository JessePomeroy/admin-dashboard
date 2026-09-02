<script lang="ts">
import { useAdminClient } from "../adminClient";
import { getAdminConfig } from "../config";
import { logger } from "../logger";
import { addToast } from "../toast";
import type { InquiryStatus, InquiryUI } from "../types";
import { formatDateTime, toId } from "../utils";
import InquiryDetailModal from "./inquiries/InquiryDetailModal.svelte";
import InquiryTable from "./inquiries/InquiryTable.svelte";

let { data }: { data: { inquiries: InquiryUI[] } } = $props();

const config = getAdminConfig();
const { api } = config;
const convexClient = useAdminClient();

// svelte-ignore state_referenced_locally
let inquiries = $state<InquiryUI[]>(data.inquiries);
let selectedInquiry = $state<InquiryUI | null>(null);
let statusFilter = $state<"all" | InquiryStatus>("all");

const statusOptions: (InquiryStatus | "all")[] = ["all", "new", "read", "replied"];

let filteredInquiries = $derived(
	statusFilter === "all"
		? inquiries
		: inquiries.filter((inq) => inq.status === statusFilter),
);

function openInquiry(inq: InquiryUI) {
	selectedInquiry = inq;
}

function closeModal() {
	selectedInquiry = null;
}

async function updateStatus(id: string, newStatus: string) {
	// Capture the current status BEFORE applying the optimistic update so that
	// a failure reverts to the last-known-good state (not to the page-load
	// snapshot, which may itself be stale after earlier updates).
	const idx = inquiries.findIndex((inq: InquiryUI) => inq._id === id);
	const previousStatus: InquiryStatus | undefined =
		idx !== -1 ? inquiries[idx].status : undefined;
	const previousSelectedStatus =
		selectedInquiry?._id === id ? selectedInquiry.status : undefined;

	// Optimistic update
	if (idx !== -1) {
		inquiries[idx] = { ...inquiries[idx], status: newStatus as InquiryStatus };
		inquiries = [...inquiries];
	}
	if (selectedInquiry?._id === id) {
		selectedInquiry = {
			...selectedInquiry,
			status: newStatus as InquiryStatus,
		};
	}

	try {
		await convexClient.mutation(api.inquiries.updateStatus, {
			id: toId(id),
			status: newStatus as InquiryStatus,
		});
	} catch (err) {
		// Revert both the list and the open modal to the pre-update status
		if (idx !== -1 && previousStatus !== undefined) {
			inquiries[idx] = { ...inquiries[idx], status: previousStatus };
			inquiries = [...inquiries];
		}
		if (selectedInquiry?._id === id && previousSelectedStatus !== undefined) {
			selectedInquiry = {
				...selectedInquiry,
				status: previousSelectedStatus,
			};
		}
		logger.error("Failed to update inquiry status:", err);
		addToast("Failed to update inquiry status.");
	}
}
</script>

<div class="inquiries-page">
	<header class="page-header">
		<h1>inquiries</h1>
	</header>

	<div class="toolbar">
		<select class="filter-select" bind:value={statusFilter} aria-label="Filter by status">
			{#each statusOptions as status}
				<option value={status}>
					{status === "all" ? "all statuses" : status}
				</option>
			{/each}
		</select>
		<span class="count">{filteredInquiries.length} inquiries</span>
	</div>

	{#if filteredInquiries.length === 0}
		<div class="empty-state">no inquiries found</div>
	{:else}
		<InquiryTable inquiries={filteredInquiries} onview={openInquiry} />
	{/if}
</div>

{#if selectedInquiry}
	<InquiryDetailModal
		inquiry={selectedInquiry}
		onclose={closeModal}
		onupdatestatus={updateStatus}
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
