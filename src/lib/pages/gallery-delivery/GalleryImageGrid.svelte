<script lang="ts">
import { useConvexClient } from "convex-svelte";
import { getAdminConfig } from "../../config";
import type { GalleryImage } from "../../types";

let { images, galleryId, onchange }: {
	images: GalleryImage[];
	galleryId: string;
	onchange: () => void;
} = $props();

const config = getAdminConfig();
const { api } = config;
const client = useConvexClient();

function thumbUrl(image: GalleryImage): string {
	const thumbKey = image.r2Key.replace("/original/", "/thumb/");
	return `${config.galleryWorkerUrl}/image/${thumbKey}`;
}

async function handleSetCover(image: GalleryImage) {
	await client.mutation(api.galleries.update, {
		id: galleryId as any,
		coverImageKey: image.r2Key,
	});
	onchange();
}

async function handleDelete(image: GalleryImage) {
	const r2Key = await client.mutation(api.galleries.removeImage, { id: image._id as any });

	// Tell server to clean up R2 objects
	try {
		await fetch("/api/admin/galleries/delete", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ r2Key }),
		});
	} catch {
		// Non-fatal — R2 cleanup can happen later
	}

	onchange();
}

async function handleToggleFavorite(image: GalleryImage) {
	await client.mutation(api.galleries.updateImage, {
		id: image._id as any,
		isFavorite: !image.isFavorite,
	});
	onchange();
}
</script>

{#if images.length === 0}
	<p class="empty">no images uploaded yet</p>
{:else}
	<div class="grid">
		{#each images as image (image._id)}
			<div class="grid-item">
				<img src={thumbUrl(image)} alt={image.filename} loading="lazy" />
				<div class="overlay">
					<span class="filename">{image.filename}</span>
					<div class="item-actions">
						<button onclick={() => handleSetCover(image)} title="Set as cover">cover</button>
						<button onclick={() => handleToggleFavorite(image)} title="Toggle favorite">
							{image.isFavorite ? "unfav" : "fav"}
						</button>
						<button class="delete-btn" onclick={() => handleDelete(image)} title="Delete">del</button>
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 8px;
	}

	.grid-item {
		position: relative;
		aspect-ratio: 1;
		overflow: hidden;
		border-radius: 6px;
		border: 1px solid var(--admin-border);
	}

	.grid-item img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(transparent 50%, rgba(0, 0, 0, 0.7));
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
		font-size: 0.68rem;
		color: #fff;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item-actions {
		display: flex;
		gap: 4px;
		margin-top: 4px;
	}

	.item-actions button {
		padding: 2px 8px;
		background: rgba(255, 255, 255, 0.2);
		border: none;
		border-radius: 3px;
		color: #fff;
		font-size: 0.66rem;
		cursor: pointer;
	}

	.item-actions button:hover {
		background: rgba(255, 255, 255, 0.35);
	}

	.delete-btn:hover {
		background: rgba(220, 80, 80, 0.6) !important;
	}

	.empty {
		color: var(--admin-text-subtle);
		font-size: 0.82rem;
	}
</style>
