<script lang="ts">
import { useConvexClient } from "convex-svelte";
import { getAdminConfig } from "../../config";
import { dndzone } from "svelte-dnd-action";
import type { GalleryImage } from "../../types";

let { images, galleryId, coverImageKey, onchange }: {
	images: GalleryImage[];
	galleryId: string;
	coverImageKey?: string;
	onchange: () => void;
} = $props();

const config = getAdminConfig();
const { api } = config;
const client = useConvexClient();

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
		id: item._id as any,
		order: index,
	}));
	await client.mutation(api.galleries.reorderImages, { updates });
	onchange();
}

async function handleSetCover(image: GalleryImage) {
	await client.mutation(api.galleries.update, {
		id: galleryId as any,
		coverImageKey: image.r2Key,
	});
	onchange();
}

async function handleDelete(image: GalleryImage) {
	await client.mutation(api.galleries.removeImage, { id: image._id as any });

	try {
		await fetch("/api/admin/galleries/delete", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ r2Key: image.r2Key }),
		});
	} catch {
		// Non-fatal
	}

	onchange();
}
</script>

{#if images.length === 0}
	<p class="empty">no images uploaded yet</p>
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
				<img src={thumbUrl(image)} alt={image.filename} loading="lazy" />
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

	.grid-item:hover .overlay {
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
