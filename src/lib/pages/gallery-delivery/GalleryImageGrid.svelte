<script lang="ts">
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";
import { toId } from "../../utils";
import { logger } from "../../logger";
import { dndzone } from "svelte-dnd-action";
import type { GalleryImage } from "../../types";
import {
	galleryFileExtension,
	isBrowserPreviewableGalleryFile,
} from "../../galleryUploadPolicy";

let { images, galleryId, coverImageKey, knownImageCount, onchange }: {
	images: GalleryImage[];
	galleryId: string;
	coverImageKey?: string;
	knownImageCount?: number;
	onchange: () => void;
} = $props();

const config = getAdminConfig();
const { api } = config;
const galleryApi = api.galleryDelivery!;
const client = useAdminClient();

// Local copy for drag-and-drop reordering
let items = $state<(GalleryImage & { id: string })[]>([]);

// Sync from props whenever images change
$effect(() => {
	items = images.map((img) => ({ ...img, id: img._id as string }));
});

function thumbUrl(image: GalleryImage): string {
	const thumbKey = image.r2Key.replace("/original/", "/thumb/");
	return `${config.galleryWorkerUrl}/image/${thumbKey}`;
}

function canPreview(image: GalleryImage): boolean {
	return isBrowserPreviewableGalleryFile(image.filename);
}

function fileLabel(image: GalleryImage): string {
	return galleryFileExtension(image.filename).replace(".", "") || "file";
}

function isCover(image: GalleryImage): boolean {
	return !!coverImageKey && image.r2Key === coverImageKey;
}

function handleDndConsider(e: CustomEvent<{ items: typeof items }>) {
	items = e.detail.items;
}

async function handleDndFinalize(e: CustomEvent<{ items: typeof items }>) {
	items = e.detail.items;

	// Save new order to Convex
	const updates = items.map((item, index) => ({
		id: toId(item._id),
		order: index,
	}));
	await client.mutation(galleryApi.reorderImages, { updates });
	onchange();
}

async function handleSetCover(image: GalleryImage) {
	await client.mutation(galleryApi.update, {
		id: toId(galleryId),
		siteUrl: config.siteUrl,
		coverImageKey: image.r2Key,
	});
	onchange();
}

async function handleDelete(image: GalleryImage) {
	await client.mutation(galleryApi.removeImage, { id: toId(image._id) });

	try {
		await fetch("/api/admin/galleries/delete", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ r2Key: image.r2Key }),
		});
	} catch (err) {
		logger.warn("Failed to delete R2 image:", image.r2Key, err);
	}

	onchange();
}
</script>

{#if images.length === 0}
	<p class="empty">
		{knownImageCount && knownImageCount > 0
			? `loading ${knownImageCount} uploaded image${knownImageCount !== 1 ? "s" : ""}...`
			: "no images uploaded yet"}
	</p>
{:else}
	<div
		class="grid"
		use:dndzone={{ items, flipDurationMs: 200, type: "gallery-images", dropTargetStyle: { outline: "2px dashed var(--admin-accent)" } }}
		onconsider={handleDndConsider}
		onfinalize={handleDndFinalize}
	>
		{#each items as image (image.id)}
			<div class="grid-item" class:is-cover={isCover(image)}>
				{#if isCover(image)}
					<span class="cover-badge">cover</span>
				{/if}
				{#if canPreview(image)}
					<img src={thumbUrl(image)} alt={image.filename} loading="lazy" />
				{:else}
					<div class="file-tile" aria-label={image.filename}>
						<span>{fileLabel(image)}</span>
					</div>
				{/if}
				<div class="overlay">
					<span class="filename">{image.filename}</span>
					<div class="item-actions">
						{#if !isCover(image)}
							<button onclick={() => handleSetCover(image)}>set cover</button>
						{/if}
						<button class="delete-btn" onclick={() => handleDelete(image)}>delete</button>
					</div>
				</div>
			</div>
		{/each}
	</div>
	<p class="drag-hint">drag to reorder</p>
{/if}

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 8px;
		border-radius: 8px;
		padding: 4px;
	}

	.grid-item {
		position: relative;
		aspect-ratio: 1;
		overflow: hidden;
		border-radius: 6px;
		border: 1px solid var(--admin-border);
		cursor: grab;
	}

	.grid-item:active {
		cursor: grabbing;
	}

	.grid-item.is-cover {
		border: 2px solid var(--admin-accent);
	}

	.cover-badge {
		position: absolute;
		top: 6px;
		left: 6px;
		z-index: 2;
		padding: 2px 8px;
		background: var(--admin-accent);
		color: var(--admin-bg);
		font-size: 0.64rem;
		font-weight: 600;
		border-radius: 4px;
		letter-spacing: 0.03em;
	}

	.grid-item img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.file-tile {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--admin-surface-raised) 78%, var(--admin-accent));
		color: var(--admin-heading);
		text-transform: uppercase;
		font-size: 0.9rem;
		letter-spacing: 0.08em;
	}

	.file-tile span {
		padding: 6px 10px;
		border: 1px solid var(--admin-border-strong);
		border-radius: 4px;
	}

	.overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(transparent 40%, var(--admin-bg, rgba(0, 0, 0, 0.75)));
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		padding: 8px;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.grid-item:hover .overlay,
	.grid-item:focus-within .overlay {
		opacity: 1;
	}

	.filename {
		font-size: 0.66rem;
		color: var(--admin-heading);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-bottom: 4px;
	}

	.item-actions {
		display: flex;
		gap: 4px;
	}

	.item-actions button {
		padding: 3px 8px;
		background: var(--admin-surface-raised);
		border: 1px solid var(--admin-border);
		border-radius: 3px;
		color: var(--admin-text);
		font-size: 0.64rem;
		cursor: pointer;
		transition: background 0.12s;
	}

	.item-actions button:hover {
		background: var(--admin-accent);
		color: var(--admin-bg);
		border-color: var(--admin-accent);
	}

	.delete-btn:hover {
		background: var(--status-rose) !important;
		border-color: var(--status-rose) !important;
	}

	.drag-hint {
		font-size: 0.72rem;
		color: var(--admin-text-subtle);
		margin: 4px 0 0;
	}

	.empty {
		color: var(--admin-text-subtle);
		font-size: 0.82rem;
	}
</style>
