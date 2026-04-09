<script lang="ts">
import { useQuery, useConvexClient } from "convex-svelte";
import { getAdminConfig } from "../../config";
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
let images = $derived(imagesQuery.data ?? []);

let tab = $state<"images" | "settings">("images");
let saving = $state(false);
let copyText = $state("copy link");

// Settings state
let editName = $state(gallery.name);
let editStatus = $state(gallery.status);
let editDownloadEnabled = $state(gallery.downloadEnabled);
let editFavoritesEnabled = $state(gallery.favoritesEnabled);
let editPassword = $state(gallery.password ?? "");

function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function handleSaveSettings() {
	saving = true;
	try {
		await client.mutation(api.galleries.update, {
			id: gallery._id as any,
			name: editName,
			status: editStatus as any,
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

async function handleShare() {
	try {
		const token = await client.mutation(api.portal.createToken, {
			siteUrl: config.siteUrl,
			type: "gallery" as any,
			documentId: gallery._id as string,
			clientId: gallery.clientId as any,
		});
		const url = `${window.location.origin}/gallery/${token}`;
		await navigator.clipboard.writeText(url);
		copyText = "copied!";
		setTimeout(() => (copyText = "copy link"), 2000);
	} catch {
		copyText = "failed";
	}
}

function handleUploadDone() {
	// imagesQuery will auto-refresh via Convex reactivity
}

function handleGridChange() {
	// Convex reactivity handles refresh
}
</script>

<AdminModal title={gallery.name} {onclose} wide>
	<div class="detail-header">
		<span class="client-name">{gallery.clientName}</span>
		<span class="stats">{gallery.imageCount} images — {formatBytes(gallery.totalSizeBytes)}</span>
		<div class="header-actions">
			<button class="share-btn" onclick={handleShare}>{copyText}</button>
		</div>
	</div>

	<div class="tabs">
		<button class="tab" class:active={tab === "images"} onclick={() => (tab = "images")}>images</button>
		<button class="tab" class:active={tab === "settings"} onclick={() => (tab = "settings")}>settings</button>
	</div>

	{#if tab === "images"}
		<div class="images-section">
			<GalleryUploader galleryId={gallery._id as string} onupload={handleUploadDone} />
			<div class="image-grid-wrapper">
				<GalleryImageGrid {images} galleryId={gallery._id as string} onchange={handleGridChange} />
			</div>
		</div>
	{:else}
		<form onsubmit={(e) => { e.preventDefault(); handleSaveSettings(); }} class="settings-form">
			<div class="field">
				<label for="edit-name">name</label>
				<input id="edit-name" type="text" bind:value={editName} />
			</div>

			<div class="field">
				<label for="edit-status">status</label>
				<select id="edit-status" bind:value={editStatus}>
					<option value="draft">draft</option>
					<option value="published">published</option>
					<option value="archived">archived</option>
				</select>
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
				<button type="submit" class="save-btn" disabled={saving}>
					{saving ? "saving..." : "save settings"}
				</button>
			</div>
		</form>
	{/if}
</AdminModal>

<style>
	.detail-header {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 16px;
	}

	.client-name {
		font-size: 0.82rem;
		color: var(--admin-text-muted);
	}

	.stats {
		font-size: 0.78rem;
		color: var(--admin-text-subtle);
	}

	.header-actions {
		margin-left: auto;
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

	.image-grid-wrapper {
		min-height: 100px;
	}

	.settings-form {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

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

	.actions { display: flex; justify-content: flex-end; margin-top: 8px; }
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
</style>
