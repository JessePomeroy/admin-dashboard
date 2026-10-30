<script lang="ts">
import { useQuery } from "convex-svelte";
import type { PaginationResult } from "convex/server";
import { beforeNavigate } from "$app/navigation";
import { onDestroy, onMount } from "svelte";
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
import type { GalleryUploadController, GalleryUploadSnapshot } from "./galleryUploadController";
import { useGalleryUploadFactory } from "./galleryUploadFactory.svelte";
import { logger } from "../../logger";

let { adminSession }: { adminSession: TenantAdminServerSession } = $props();

const config = getAdminConfig();
const { api } = config;
const galleryApi = api.galleryDelivery!;
const client = useAdminClient();
type GalleryWithClient = Gallery & { clientName: string };
let statusFilter = $state("all");
let cursors = $state<(string | null)[]>([null]);
let requestId = $state(0);
let switchingPage = $state(false);
const paginated = Boolean(galleryApi.listBySitePaginated);
const cursor = $derived(cursors[cursors.length - 1]);
const regularQuery = useQuery(galleryApi.listBySitePaginated ?? galleryApi.listBySite, () => statusFilter === "submitted" ? "skip" : paginated ? {
	siteUrl: config.siteUrl, ...(statusFilter === "all" ? {} : { status: statusFilter }),
	paginationOpts: { numItems: 25, cursor, id: requestId },
} : { siteUrl: config.siteUrl }, { keepPreviousData: false });
const submittedQuery = galleryApi.listSubmittedProofs && paginated ? useQuery(galleryApi.listSubmittedProofs, () => statusFilter === "submitted" ? {
 siteUrl: config.siteUrl, paginationOpts: { numItems: 25, cursor, id: requestId },
} : "skip", { keepPreviousData: false }) : null;
const galleriesQuery = $derived(statusFilter === "submitted" && submittedQuery ? submittedQuery : regularQuery);
const result = $derived(galleriesQuery.data as PaginationResult<GalleryWithClient> | GalleryWithClient[] | undefined);
const page = $derived(result && !Array.isArray(result) ? result : undefined);
const splitError = new Error("This gallery page changed. Retry to reload it.");
const pageError = $derived(page?.pageStatus === "SplitRequired" ? splitError : galleriesQuery.error);
const hasNext = $derived(Boolean(page && !page.isDone && page.continueCursor && page.continueCursor !== cursor));
$effect(() => { if (result || galleriesQuery.error) switchingPage = false; });
const uploadFactory = useGalleryUploadFactory();
const uploadPolicy = $derived(uploadFactory.policy);

type UploadQueue = { gallery: GalleryWithClient; controller: GalleryUploadController; snapshot: GalleryUploadSnapshot };
let uploadQueues = $state.raw<UploadQueue[]>([]);
let disposed = false;
const visibleQueues = $derived(uploadQueues.filter((queue) => queue.snapshot.files.length > 0));
const hasUnfinishedUploads = $derived(uploadQueues.some((queue) => queue.snapshot.deletingSelected || queue.snapshot.files.some((file) =>
	["pending", "uploading", "processing"].includes(file.status) || (file.status === "error" && Boolean(file.r2Key)),
)));

function openGallery(gallery: GalleryWithClient) {
	if (!uploadQueues.some((queue) => queue.gallery._id === gallery._id)) {
		// Own each queue for this page visit, independently of modal and tab lifetimes.
		const controller = uploadFactory.create(gallery._id, {
			onchange: (snapshot) => {
				if (!disposed) uploadQueues = uploadQueues.map((queue) => queue.gallery._id === gallery._id ? { ...queue, snapshot } : queue);
			},
		});
		uploadQueues = [...uploadQueues, { gallery, controller, snapshot: controller.getSnapshot() }];
	}
	selectedGallery = gallery;
}

beforeNavigate((navigation) => {
	if (navigation.willUnload) return;
	if (hasUnfinishedUploads && !globalThis.confirm("Uploads are unfinished. Leave this page and cancel them?")) navigation.cancel();
});
onMount(() => {
	const warnBeforeUnload = (event: BeforeUnloadEvent) => {
		if (!hasUnfinishedUploads) return;
		event.preventDefault();
		event.returnValue = "";
	};
	window.addEventListener("beforeunload", warnBeforeUnload);
	return () => window.removeEventListener("beforeunload", warnBeforeUnload);
});
onDestroy(() => {
	disposed = true;
	for (const queue of uploadQueues) void queue.controller.dispose().catch((error) => logger.warn("Could not cancel unfinished uploads:", error));
});

const galleries = $derived(pageError ? [] : Array.isArray(result) ? result : page?.page ?? []);
const isLoading = $derived(switchingPage || galleriesQuery.isLoading || (!result && !pageError));

function changeFilter(status: string) {
	if (statusFilter === status) return;
	statusFilter = status;
	cursors = [null];
	if (paginated) switchingPage = true;
}
function nextPage() {
	if (isLoading || !hasNext || !page) return;
	switchingPage = true;
	cursors = [...cursors, page.continueCursor];
}
function previousPage() {
	if (isLoading || cursors.length === 1) return;
	switchingPage = true;
	cursors = cursors.slice(0, -1);
}
function retryPage() {
	if (!paginated) { window.location.reload(); return; }
	switchingPage = true;
	requestId += 1;
}

async function handleQuickAction(e: Event, galleryId: string, status: string) {
	e.stopPropagation();
	await client.mutation(galleryApi.update, { id: toId(galleryId), siteUrl: config.siteUrl, status });
}

let showCreateModal = $state(false);
let selectedGallery = $state<(Gallery & { clientName: string }) | null>(null);
const selectedQueue = $derived(uploadQueues.find((queue) => queue.gallery._id === selectedGallery?._id));

let filteredGalleries = $derived(
	galleries.filter((g: Gallery & { clientName: string }) => {
		if (!paginated && statusFilter !== "all" && g.status !== statusFilter) return false;
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
<div class="delivery-page admin-page">
	<PageHeader title="client galleries">
		{#snippet actions()}
			<button class="create-btn" onclick={() => (showCreateModal = true)}>+ new gallery</button>
		{/snippet}
	</PageHeader>

	<div class="filter-row">
		{#each ["all", "draft", "uploading", "published", "archived", ...(submittedQuery ? ["submitted"] : [])] as s}
			<button
				class="filter-chip"
				class:active={statusFilter === s}
				aria-pressed={statusFilter === s}
				onclick={() => changeFilter(s)}
			>
				{s === "submitted" ? "submitted selections" : s}
			</button>
		{/each}
	</div>

	{#if visibleQueues.length > 0}
		<aside class="upload-queues" aria-label="gallery upload queues">
			<p>uploads continue while this page is open</p>
			{#each visibleQueues as queue (queue.gallery._id)}
				<div class="queue-row">
					<span>{queue.gallery.name} · {queue.snapshot.completedCount}/{queue.snapshot.totalCount} uploaded{queue.snapshot.hasErrors ? " · needs attention" : queue.snapshot.paused ? " · paused" : ""}</span>
					<button class="action-btn" onclick={() => openGallery(queue.gallery)}>view uploads</button>
					{#if queue.snapshot.files.some((file) => file.status !== "done")}
						<button class="action-btn" disabled={queue.snapshot.deletingSelected} onclick={() => {
							if (globalThis.confirm(`Cancel unfinished uploads for ${queue.gallery.name}? Completed files stay in the gallery.`)) void queue.controller.cancelPendingUploads();
						}}>cancel unfinished</button>
					{/if}
				</div>
			{/each}
		</aside>
	{/if}

	{#if pageError}
		<div class="empty-state" role="alert">
			<p>could not load this gallery page</p>
			<button class="action-btn page-button" onclick={retryPage}>{paginated ? "retry" : "reload"}</button>
		</div>
	{:else if isLoading}
		<LoadingState />
	{:else if filteredGalleries.length === 0}
		<div class="empty-state">
			{#if statusFilter === "submitted"}
				no submitted selections
			{:else if statusFilter !== "all"}
				no {statusFilter} galleries
			{:else}
				no client galleries yet — create one to start delivering files
			{/if}
		</div>
	{:else}
		<div class="gallery-list">
			{#each filteredGalleries as gallery (gallery._id)}
				<div class="gallery-row">
					<button class="row-main" onclick={() => openGallery(gallery)}>
						<div class="gallery-info">
							<span class="gallery-name">{gallery.name}</span>
							<span class="gallery-client">{gallery.clientName}</span>
						</div>
						<div class="gallery-meta">
							{#if gallery.proofSubmissionId}<span class="status-badge">selection submitted</span>{/if}
							<span class="meta-item">{gallery.imageCount} file{gallery.imageCount !== 1 ? "s" : ""}</span>
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
	{#if paginated}
		<nav class="pagination" aria-label="gallery pages">
			<button class="page-button" disabled={isLoading || cursors.length === 1} onclick={previousPage}>previous</button>
			<span>page {cursors.length}{!isLoading && !pageError ? ` · ${filteredGalleries.length} galleries on this page` : ""}</span>
			<button class="page-button" disabled={isLoading || Boolean(pageError) || !hasNext} onclick={nextPage}>next</button>
		</nav>
	{/if}
</div>

{#if showCreateModal}
	<GalleryCreateModal onclose={() => (showCreateModal = false)} />
{/if}

{#if selectedGallery && selectedQueue}
	{#key selectedGallery._id}
	<GalleryDetailModal
		gallery={selectedGallery}
		{adminSession}
		uploadController={selectedQueue.controller}
		{uploadPolicy}
		onclose={() => (selectedGallery = null)}
	/>
	{/key}
{/if}
</FeatureGate>

<style>
	.pagination { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; margin-top: 24px; }
	.pagination span { color: var(--admin-text-muted); font-size: 0.8rem; text-align: center; }
	.page-button { min-height: 44px; padding: 8px 16px; border: 1px solid var(--admin-border); background: var(--admin-surface); color: var(--admin-text); cursor: pointer; }
	.page-button:disabled { opacity: 0.5; cursor: default; }
	.upload-queues { margin-bottom: 24px; border: 1px solid var(--admin-border); padding: 16px; }
	.upload-queues > p { margin: 0 0 12px; color: var(--admin-text-muted); font-size: 0.8rem; }
	.queue-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; font-size: 0.85rem; }
	.queue-row + .queue-row { margin-top: 12px; }
	.queue-row > span { flex: 1 1 220px; min-width: 0; overflow-wrap: anywhere; }
	.queue-row .action-btn { min-height: 44px; padding: 8px 12px; }
	.delivery-page {
		padding: 48px 40px;
		max-width: 1000px;
	}

	.filter-row {
		display: flex;
		gap: 0;
		width: fit-content;
		max-width: 100%;
		flex-wrap: wrap;
		border: 1px solid var(--admin-control-edge);
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
		padding: 4px 8px;
		border-radius: 0;
		font-weight: 500;
	}

	.status-draft { background: var(--admin-surface-raised); color: var(--admin-text-muted); }
	.status-uploading { background: color-mix(in srgb, var(--status-amber) 12%, transparent); color: var(--admin-heading); }
	.status-published { background: color-mix(in srgb, var(--status-sage) 12%, transparent); color: var(--admin-heading); }
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
		.row-main { width: 100%; flex-wrap: wrap; gap: 12px; }
		.gallery-info { flex-basis: 100%; }
	}
</style>
