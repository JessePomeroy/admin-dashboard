<script lang="ts">
import { useQuery, useConvexClient } from "@mmailaender/convex-svelte";
import { getAdminConfig } from "../../config";
import { formatBytes, toId } from "../../utils";
import AdminModal from "../../components/AdminModal.svelte";
import type { Gallery, GalleryImage } from "../../types";
import GalleryUploader from "./GalleryUploader.svelte";
import GalleryImageGrid from "./GalleryImageGrid.svelte";

let { gallery, onclose }: {
	gallery: Gallery & { clientName: string };
	onclose: () => void;
} = $props();

const config = getAdminConfig();
const { api } = config;
const client = useConvexClient();

const imagesQuery = useQuery(api.galleries.getImages, { galleryId: gallery._id });
const galleryQuery = useQuery(api.galleries.get, { id: gallery._id });
let images = $derived(imagesQuery.data ?? []);
let liveGallery = $derived(galleryQuery.data ?? gallery);

let tab = $state<"images" | "settings">("images");
let saving = $state(false);
let deleting = $state(false);
let copyText = $state("copy link");

// Settings state
let editName = $state(gallery.name);
let editDownloadEnabled = $state(gallery.downloadEnabled);
let editFavoritesEnabled = $state(gallery.favoritesEnabled);
let editPassword = $state(gallery.password ?? "");

async function handleSaveSettings() {
	saving = true;
	try {
		await client.mutation(api.galleries.update, {
			id: toId(gallery._id),
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
		// Clean up R2 files
		for (const image of images) {
			try {
				await fetch("/api/admin/galleries/delete", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ r2Key: image.r2Key }),
				});
			} catch {
				// Non-fatal — R2 cleanup best-effort
			}
		}
		// Hard delete gallery + images + downloads from Convex
		await client.mutation(api.galleries.remove, { id: toId(gallery._id) });
		onclose();
	} catch {
		deleting = false;
	}
}

async function handleStatusChange(newStatus: string) {
	await client.mutation(api.galleries.update, {
		id: toId(gallery._id),
		status: newStatus as any,
	});
}

async function handleShare() {
	try {
		const token = await client.mutation(api.portal.createToken, {
			siteUrl: config.siteUrl,
			type: "gallery" as any,
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
	<div class="modal-body">
		<div class="detail-header">
			<span class="client-name">{gallery.clientName}</span>
			<span class="stats">
				{liveGallery.imageCount} image{liveGallery.imageCount !== 1 ? "s" : ""} — {formatBytes(liveGallery.totalSizeBytes)}
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
				<GalleryUploader galleryId={gallery._id as string} onupload={() => {}} />
				<GalleryImageGrid
					{images}
					galleryId={gallery._id as string}
					coverImageKey={liveGallery.coverImageKey}
					onchange={() => {}}
				/>
			</div>
		{:else}
			<form onsubmit={(e) => { e.preventDefault(); handleSaveSettings(); }} class="settings-form" role="tabpanel">
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
		{/if}
	</div>
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
	.field input, .field select {
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
