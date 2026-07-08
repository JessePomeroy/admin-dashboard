<script lang="ts">
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";
import { formatBytes, toId } from "../../utils";
import AdminModal from "../../components/AdminModal.svelte";
import FeatureGate from "../../components/FeatureGate.svelte";
import type { TenantAdminServerSession } from "../../adminSession";
import type { Gallery, GalleryImage } from "../../types";
import GalleryUploader from "./GalleryUploader.svelte";
import GalleryImageGrid from "./GalleryImageGrid.svelte";

interface UploadBatchSummary {
	totalCount: number;
	completedCount: number;
	totalSizeBytes: number;
	hasErrors: boolean;
}

interface GalleryStorageKeyPage {
	keys: string[];
	isDone: boolean;
	continueCursor?: string | null;
}

const CLEANUP_KEY_PAGE_SIZE = 500;

let { gallery, adminSession, onclose }: {
	gallery: Gallery & { clientName: string };
	adminSession: TenantAdminServerSession;
	onclose: () => void;
} = $props();

const config = getAdminConfig();
const { api } = config;
const galleryApi = api.galleryDelivery!;
const client = useAdminClient();

const imagesQuery = useQuery(galleryApi.getImages, () => ({ galleryId: gallery._id }));
const galleryQuery = useQuery(galleryApi.get, () => ({ id: gallery._id }));
let images = $derived((imagesQuery.data ?? []) as GalleryImage[]);
let liveGallery = $derived(galleryQuery.data ?? gallery);

let tab = $state<"images" | "settings">("images");
let saving = $state(false);
let deleting = $state(false);
let copyText = $state("copy link");
let uploadBatch = $state<UploadBatchSummary | null>(null);
let headerStats = $derived(
	uploadBatch && uploadBatch.totalCount > 0
		? `${uploadBatch.completedCount}/${uploadBatch.totalCount} uploaded — ${formatBytes(uploadBatch.totalSizeBytes)}`
		: `${liveGallery.imageCount} image${liveGallery.imageCount !== 1 ? "s" : ""} — ${formatBytes(liveGallery.totalSizeBytes)}`,
);

// Settings state
let editName = $state("");
let editDownloadEnabled = $state(false);
let editFavoritesEnabled = $state(false);
let editPassword = $state("");
let loadedGalleryId = $state<string | null>(null);

$effect(() => {
	if (loadedGalleryId === gallery._id) return;
	loadedGalleryId = gallery._id;
	editName = gallery.name;
	editDownloadEnabled = gallery.downloadEnabled;
	editFavoritesEnabled = gallery.favoritesEnabled;
	editPassword = gallery.password ?? "";
});

function handleUploadBatchChange(summary: UploadBatchSummary) {
	uploadBatch = summary.totalCount > 0 ? summary : null;
}

async function readResponseError(response: Response, fallback: string): Promise<string> {
	const detail = await response.text().catch(() => "");
	return detail || fallback;
}

async function deleteGalleryFiles(r2Keys: string[]): Promise<void> {
	if (r2Keys.length === 0) return;

	const bulkResponse = await fetch("/api/admin/galleries/bulk-delete", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ keys: r2Keys }),
	});
	if (bulkResponse.ok) return;
	if (bulkResponse.status !== 404) {
		throw new Error(await readResponseError(bulkResponse, "Failed to delete gallery files"));
	}

	for (const r2Key of r2Keys) {
		const response = await fetch("/api/admin/galleries/delete", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ r2Key }),
		});
		if (!response.ok) {
			throw new Error(await readResponseError(response, "Failed to delete gallery files"));
		}
	}
}

async function loadGalleryFileKeys(): Promise<string[]> {
	if (!galleryApi.listImageStorageKeys) {
		return images.map((image) => image.r2Key);
	}

	const keys: string[] = [];
	let cursor: string | null = null;
	do {
		const page = (await client.query(galleryApi.listImageStorageKeys, {
			galleryId: toId(gallery._id),
			paginationOpts: {
				numItems: CLEANUP_KEY_PAGE_SIZE,
				cursor,
			},
		})) as GalleryStorageKeyPage;
		keys.push(...page.keys);
		cursor = page.continueCursor ?? null;
		if (page.isDone) break;
	} while (cursor !== null);

	return keys;
}

async function handleSaveSettings() {
	saving = true;
	try {
		await client.mutation(galleryApi.update, {
			id: toId(gallery._id),
			siteUrl: config.siteUrl,
			name: editName,
			downloadEnabled: editDownloadEnabled,
			favoritesEnabled: editFavoritesEnabled,
			password: editPassword || undefined,
		});
		onclose();
	} catch {
		// stay open on error
	} finally {
		saving = false;
	}
}

async function handleDelete() {
	if (!confirm("Delete this gallery and all its images? This cannot be undone.")) return;
	deleting = true;
	try {
		const r2Keys = await loadGalleryFileKeys();
		await deleteGalleryFiles(r2Keys);

		// Hard delete gallery + images + downloads from Convex
		await client.mutation(galleryApi.remove, { id: toId(gallery._id) });
		onclose();
	} catch {
		deleting = false;
	}
}

async function handleStatusChange(newStatus: string) {
	await client.mutation(galleryApi.update, {
		id: toId(gallery._id),
		siteUrl: config.siteUrl,
		status: newStatus,
	});
}

async function handleShare() {
	try {
		const token = await client.mutation(api.portal.createToken, {
			siteUrl: config.siteUrl,
			type: "gallery",
			documentId: gallery._id as string,
			clientId: toId(gallery.clientId),
		});
		const url = `${window.location.origin}/delivery/${token}`;
		await navigator.clipboard.writeText(url);
		copyText = "copied!";
		setTimeout(() => (copyText = "copy link"), 2000);
	} catch {
		copyText = "failed";
	}
}
</script>

<AdminModal title={gallery.name} {onclose} size="wide">
	<FeatureGate feature="galleryDelivery" {adminSession}>
	<div class="modal-body">
		<div class="detail-header">
			<span class="client-name">{gallery.clientName}</span>
			<span class="stats">
				{headerStats}
				{#if uploadBatch?.hasErrors}
					<span class="error-text">— some failed</span>
				{/if}
			</span>
			<div class="header-actions">
				{#if liveGallery.status === "draft"}
					<button class="status-action-btn publish" onclick={() => handleStatusChange("published")}>publish</button>
				{:else if liveGallery.status === "published"}
					<button class="status-action-btn" onclick={() => handleStatusChange("archived")}>archive</button>
				{:else if liveGallery.status === "archived"}
					<button class="status-action-btn" onclick={() => handleStatusChange("draft")}>restore</button>
				{/if}
				{#if liveGallery.status === "published"}
					<button class="share-btn" onclick={handleShare}>{copyText}</button>
				{:else}
					<span class="share-hint">publish to share</span>
				{/if}
			</div>
		</div>

		<div class="tabs" role="tablist">
			<button class="tab" class:active={tab === "images"} role="tab" aria-selected={tab === "images"} onclick={() => (tab = "images")}>images</button>
			<button class="tab" class:active={tab === "settings"} role="tab" aria-selected={tab === "settings"} onclick={() => (tab = "settings")}>settings</button>
		</div>

		{#if tab === "images"}
			<div class="images-section" role="tabpanel">
				<GalleryUploader
					galleryId={gallery._id as string}
					{adminSession}
					onupload={() => {}}
					onbatchchange={handleUploadBatchChange}
				/>
				<GalleryImageGrid
					{images}
					galleryId={gallery._id as string}
					coverImageKey={liveGallery.coverImageKey}
					knownImageCount={liveGallery.imageCount}
					onchange={() => {}}
				/>
			</div>
		{:else}
			<div role="tabpanel">
				<form onsubmit={(e) => { e.preventDefault(); handleSaveSettings(); }} class="settings-form">
					<div class="field">
						<label for="edit-name">name</label>
						<input id="edit-name" type="text" bind:value={editName} />
					</div>

					<div class="toggles">
						<label class="toggle">
							<input type="checkbox" bind:checked={editDownloadEnabled} />
							<span>allow downloads</span>
						</label>
						<label class="toggle">
							<input type="checkbox" bind:checked={editFavoritesEnabled} />
							<span>allow favorites</span>
						</label>
					</div>

					<div class="field">
						<label for="edit-password">password</label>
						<input id="edit-password" type="text" bind:value={editPassword} placeholder="leave blank for token-only" />
					</div>

					<div class="actions">
						<button class="delete-btn" type="button" onclick={handleDelete}>
							{deleting ? "deleting..." : "delete gallery"}
						</button>
						<button type="submit" class="save-btn" disabled={saving}>
							{saving ? "saving..." : "save settings"}
						</button>
					</div>
				</form>
			</div>
		{/if}
	</div>
	</FeatureGate>
</AdminModal>

<style>
	.modal-body {
		padding: 0 28px 28px;
	}

	.detail-header {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 16px;
	}

	.client-name { font-size: 0.82rem; color: var(--admin-text-muted); }
	.stats { font-size: 0.78rem; color: var(--admin-text-subtle); }
	.error-text { color: var(--status-rose); }
	.header-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; }

	.status-action-btn {
		padding: 5px 14px;
		border: 1px solid var(--admin-border-strong);
		border-radius: 5px;
		background: transparent;
		color: var(--admin-text-muted);
		font-size: 0.78rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.status-action-btn:hover {
		color: var(--admin-accent);
		border-color: var(--admin-accent);
	}

	.status-action-btn.publish {
		border-color: var(--admin-accent);
		color: var(--admin-accent);
	}

	.status-action-btn.publish:hover {
		background: var(--admin-accent);
		color: var(--admin-bg);
	}

	.share-btn {
		padding: 5px 14px;
		border: 1px solid var(--admin-accent);
		border-radius: 5px;
		background: transparent;
		color: var(--admin-accent);
		font-size: 0.78rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.share-btn:hover {
		background: var(--admin-accent);
		color: var(--admin-bg);
	}

	.share-hint {
		font-size: 0.72rem;
		color: var(--admin-text-subtle);
		font-style: italic;
	}

	.tabs {
		display: flex;
		gap: 0;
		border-bottom: 1px solid var(--admin-border);
		margin-bottom: 20px;
	}

	.tab {
		padding: 8px 20px;
		border: none;
		background: transparent;
		color: var(--admin-text-muted);
		font-size: 0.82rem;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		font-family: inherit;
	}

	.tab.active {
		color: var(--admin-accent);
		border-bottom-color: var(--admin-accent);
	}

	.images-section {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.settings-form { display: flex; flex-direction: column; gap: 18px; }
	.field { display: flex; flex-direction: column; gap: 5px; }
	.field label { font-size: 0.78rem; color: var(--admin-text-muted); }
	.field input {
		padding: 8px 12px;
		border: 1px solid var(--admin-border);
		border-radius: 5px;
		background: var(--admin-bg);
		color: var(--admin-text);
		font-size: 0.88rem;
		font-family: inherit;
	}

	.toggles { display: flex; gap: 24px; }
	.toggle {
		display: flex; align-items: center; gap: 8px;
		font-size: 0.82rem; color: var(--admin-text); cursor: pointer;
	}
	.toggle input { accent-color: var(--admin-accent); }

	.actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
	.save-btn {
		padding: 7px 18px;
		background: var(--admin-accent);
		color: var(--admin-bg);
		border: none;
		border-radius: 6px;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.save-btn:disabled { opacity: 0.5; }

	.delete-btn {
		margin-right: auto;
		padding: 7px 18px;
		background: transparent;
		border: 1px solid var(--status-rose);
		border-radius: 6px;
		color: var(--status-rose);
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.delete-btn:hover {
		background: var(--status-rose);
		color: var(--admin-bg);
	}
</style>
