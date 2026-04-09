<script lang="ts">
import { formatDateTime } from "../utils";
import InquiryDetailModal from "./inquiries/InquiryDetailModal.svelte";
import InquiryTable from "./inquiries/InquiryTable.svelte";

let { data } = $props();

// svelte-ignore state_referenced_locally
let inquiries = $state(data.inquiries);
let selectedInquiry = $state<any>(null);
let statusFilter = $state("all");

const statusOptions = ["all", "new", "read", "replied"];

let filteredInquiries = $derived(
	statusFilter === "all"
		? inquiries
		: inquiries.filter((inq: any) => inq.status === statusFilter),
);

function openInquiry(inq: any) {
	selectedInquiry = inq;
}

function closeModal() {
	selectedInquiry = null;
}

async function updateStatus(id: string, newStatus: string) {
	// Optimistic update
	const idx = inquiries.findIndex((inq: any) => inq._id === id);
	if (idx !== -1) {
		inquiries[idx] = { ...inquiries[idx], status: newStatus };
		inquiries = [...inquiries];
	}
	if (selectedInquiry?._id === id) {
		selectedInquiry = { ...selectedInquiry, status: newStatus };
	}

	try {
		const response = await fetch(`/api/admin/inquiries/${id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status: newStatus }),
		});
		if (!response.ok) {
			// Revert on failure
			if (idx !== -1) {
				inquiries[idx] = {
					...inquiries[idx],
					status:
						data.inquiries.find((inq: any) => inq._id === id)?.status || "new",
				};
				inquiries = [...inquiries];
			}
			console.error("Failed to update inquiry status");
		}
	} catch (err) {
		console.error("Failed to update inquiry status:", err);
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
		background: transparent;
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
