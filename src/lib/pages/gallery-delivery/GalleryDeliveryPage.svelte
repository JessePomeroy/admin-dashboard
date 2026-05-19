<script lang="ts">
import { useQuery } from "@mmailaender/convex-svelte";
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";
import { formatBytes, formatTimestampDate, toId } from "../../utils";
import FeatureGate from "../../components/FeatureGate.svelte";
import LoadingState from "../../components/LoadingState.svelte";
import PageHeader from "../../components/PageHeader.svelte";
import type { TenantAdminServerSession } from "../../adminSession";
import type { Gallery } from "../../types";
import GalleryCreateModal from "./GalleryCreateModal.svelte";
import GalleryDetailModal from "./GalleryDetailModal.svelte";

let { adminSession }: { adminSession: TenantAdminServerSession } = $props();

const config = getAdminConfig();
const { api } = config;
const galleryApi = api.galleryDelivery!;
const client = useAdminClient();
const galleriesQuery = useQuery(galleryApi.listBySite, { siteUrl: config.siteUrl });

let galleries = $derived(galleriesQuery.data ?? []);
let isLoading = $derived(galleriesQuery.isLoading);

async function handleQuickAction(e: Event, galleryId: string, status: string) {
	e.stopPropagation();
	await client.mutation(galleryApi.update, { id: toId(galleryId), siteUrl: config.siteUrl, status });
}

let showCreateModal = $state(false);
let selectedGallery = $state<(Gallery & { clientName: string }) | null>(null);
let statusFilter = $state("all");

let filteredGalleries = $derived(
	galleries.filter((g: Gallery & { clientName: string }) => {
		if (statusFilter !== "all" && g.status !== statusFilter) return false;
		return true;
	}),
);

const statusLabels: Record<string, string> = {
	draft: "draft",
	uploading: "uploading",
	published: "published",
	archived: "archived",
};
</script>

<FeatureGate feature="galleryDelivery" {adminSession}>
<div class="delivery-page">
	<PageHeader title="client galleries">
		{#snippet actions()}
			<button class="create-btn" onclick={() => (showCreateModal = true)}>+ new gallery</button>
		{/snippet}
	</PageHeader>

	<div class="filter-row">
		{#each ["all", "draft", "published", "archived"] as s}
			<button
				class="filter-chip"
				class:active={statusFilter === s}
				aria-pressed={statusFilter === s}
				onclick={() => (statusFilter = s)}
			>
				{s}
			</button>
		{/each}
	</div>

	{#if isLoading}
		<LoadingState />
	{:else if filteredGalleries.length === 0}
		<div class="empty-state">
			{#if statusFilter !== "all"}
				no {statusFilter} galleries
			{:else}
				no client galleries yet — create one to start delivering photos
			{/if}
		</div>
	{:else}
		<div class="gallery-list">
			{#each filteredGalleries as gallery (gallery._id)}
				<div class="gallery-row">
					<button class="row-main" onclick={() => (selectedGallery = gallery)}>
						<div class="gallery-info">
							<span class="gallery-name">{gallery.name}</span>
							<span class="gallery-client">{gallery.clientName}</span>
						</div>
						<div class="gallery-meta">
							<span class="meta-item">{gallery.imageCount} image{gallery.imageCount !== 1 ? "s" : ""}</span>
							<span class="meta-item">{formatBytes(gallery.totalSizeBytes)}</span>
							<span class="status-badge status-{gallery.status}">{statusLabels[gallery.status]}</span>
						</div>
						<span class="gallery-date">{formatTimestampDate(gallery._creationTime)}</span>
					</button>
					<div class="row-actions">
						{#if gallery.status === "draft"}
							<button class="action-btn publish" onclick={(e) => handleQuickAction(e, gallery._id, "published")}>publish</button>
						{:else if gallery.status === "published"}
							<button class="action-btn" onclick={(e) => handleQuickAction(e, gallery._id, "archived")}>archive</button>
						{:else if gallery.status === "archived"}
							<button class="action-btn" onclick={(e) => handleQuickAction(e, gallery._id, "draft")}>restore</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if showCreateModal}
	<GalleryCreateModal onclose={() => (showCreateModal = false)} />
{/if}

{#if selectedGallery}
	<GalleryDetailModal
		gallery={selectedGallery}
		{adminSession}
		onclose={() => (selectedGallery = null)}
	/>
{/if}
</FeatureGate>

<style>
	.delivery-page {
		padding: 48px 40px;
		max-width: 1000px;
	}

	.filter-row {
		display: flex;
		gap: 8px;
		margin-bottom: 24px;
	}

	.filter-chip {
		padding: 5px 14px;
		border: 1px solid var(--admin-border);
		border-radius: 20px;
		background: transparent;
		color: var(--admin-text-muted);
		font-size: 0.78rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.filter-chip.active {
		border-color: var(--admin-accent);
		color: var(--admin-accent);
	}

	.create-btn {
		padding: 7px 18px;
		background: var(--admin-accent);
		color: var(--admin-bg);
		border: none;
		border-radius: 6px;
		font-size: 0.8rem;
		font-family: "Synonym", system-ui, sans-serif;
		cursor: pointer;
		transition: background 0.15s;
	}

	.create-btn:hover {
		background: var(--admin-accent-hover);
	}

	.gallery-list {
		display: flex;
		flex-direction: column;
	}

	.gallery-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 18px 0;
		border-bottom: 1px solid var(--admin-border);
	}

	.gallery-row:first-child {
		border-top: 1px solid var(--admin-border);
	}

	.row-main {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 24px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		font-family: inherit;
		padding: 0;
		min-width: 0;
		transition: opacity 0.12s;
	}

	.row-main:hover {
		opacity: 0.8;
	}

	.row-actions {
		flex-shrink: 0;
	}

	.action-btn {
		padding: 4px 14px;
		border: 1px solid var(--admin-border-strong);
		border-radius: 5px;
		background: transparent;
		color: var(--admin-text-muted);
		font-size: 0.74rem;
		font-family: inherit;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
	}

	.action-btn:hover {
		color: var(--admin-accent);
		border-color: var(--admin-accent);
	}

	.action-btn.publish {
		border-color: var(--admin-accent);
		color: var(--admin-accent);
	}

	.action-btn.publish:hover {
		background: var(--admin-accent);
		color: var(--admin-bg);
	}

	.gallery-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}

	.gallery-name {
		font-size: 0.95rem;
		font-weight: 500;
		color: var(--admin-heading);
	}

	.gallery-client {
		font-size: 0.78rem;
		color: var(--admin-text-subtle);
	}

	.gallery-meta {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-shrink: 0;
	}

	.meta-item {
		font-size: 0.8rem;
		color: var(--admin-text-muted);
	}

	.status-badge {
		font-size: 0.72rem;
		padding: 2px 10px;
		border-radius: 10px;
		font-weight: 500;
	}

	.status-draft { background: var(--admin-surface-raised); color: var(--admin-text-muted); }
	.status-uploading { background: var(--status-amber); color: #000; }
	.status-published { background: var(--status-sage); color: #000; }
	.status-archived { background: var(--admin-border); color: var(--admin-text-subtle); }

	.gallery-date {
		font-size: 0.76rem;
		color: var(--admin-text-subtle);
		flex-shrink: 0;
	}

	.empty-state {
		padding: 48px 0;
		color: var(--admin-text-subtle);
		font-size: 0.88rem;
	}

	@media (max-width: 768px) {
		.delivery-page { padding: 20px 16px; }
		.gallery-row { flex-direction: column; align-items: flex-start; gap: 10px; }
		.gallery-meta { flex-wrap: wrap; gap: 12px; }
	}
</style>
