<script lang="ts">
import UpgradeBanner from "../components/UpgradeBanner.svelte";
import { getAdminConfig } from "../config";
import { hasFeature, type Tier } from "../features";
import GalleryDeliveryPage from "./gallery-delivery/GalleryDeliveryPage.svelte";

let {
	data,
	activeTab = "portfolio",
}: {
	data: { galleries: any[]; tier: Tier };
	activeTab?: "portfolio" | "delivery";
} = $props();

const config = getAdminConfig();
const hasWorker = !!config.galleryWorkerUrl;
const canDeliver = $derived(
	hasFeature(data.tier, "galleryDelivery") && hasWorker,
);

const galleries = $derived(data.galleries);

let tab = $state(activeTab);
const studioBaseUrl =
	config.sanityStudioUrl ?? "https://angelsrest.sanity.studio";
</script>

<div class="galleries-page">
	<header class="page-header">
		<h1>galleries</h1>
	</header>

	{#if hasWorker}
		<div class="tab-bar" role="tablist">
			<button class="tab" class:active={tab === "portfolio"} role="tab" aria-selected={tab === "portfolio"} onclick={() => (tab = "portfolio")}>portfolio</button>
			<button class="tab" class:active={tab === "delivery"} role="tab" aria-selected={tab === "delivery"} onclick={() => (tab = "delivery")}>delivery</button>
		</div>
	{/if}

	{#if tab === "delivery" && hasWorker}
		{#if canDeliver}
			<GalleryDeliveryPage />
		{:else}
			<UpgradeBanner feature="galleryDelivery" />
		{/if}
	{:else}
		{#if galleries.length === 0}
			<div class="empty-state">no galleries found</div>
		{:else}
			<div class="gallery-list">
				{#each galleries as gallery (gallery._id)}
					<div class="gallery-row">
						<div class="gallery-info">
							<span class="gallery-title">{gallery.title}</span>
							<span class="gallery-slug">/{gallery.slug}</span>
						</div>

						<div class="gallery-meta">
							<span class="meta-count">
								{gallery.imageCount || 0} image{(gallery.imageCount || 0) !== 1 ? "s" : ""}
							</span>

							{#if gallery.isVisible !== false}
								<span class="visibility-indicator visible">
									<span class="vis-dot"></span>
									visible
								</span>
							{:else}
								<span class="visibility-indicator hidden">
									<span class="vis-dot"></span>
									hidden
								</span>
							{/if}

							{#if gallery.featured}
								<span class="featured-indicator">featured</span>
							{/if}
						</div>

						<div class="gallery-actions">
							<a href="/gallery/{gallery.slug}" class="action-link" target="_blank" rel="noopener">
								view
							</a>
							<a
								href="{studioBaseUrl}/structure/gallery;{gallery._id}"
								class="action-link"
								target="_blank"
								rel="noopener"
							>
								edit in studio
							</a>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.galleries-page {
		padding: 48px 40px;
		max-width: 1000px;
	}

	.page-header {
		margin-bottom: 24px;
	}

	.page-header h1 {
		font-family: "Chillax", sans-serif;
		font-size: 1.8rem;
		font-weight: 500;
		color: var(--admin-heading);
		margin: 0;
		letter-spacing: -0.01em;
	}

	.tab-bar {
		display: flex;
		gap: 0;
		border-bottom: 1px solid var(--admin-border);
		margin-bottom: 24px;
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

	.gallery-list {
		display: flex;
		flex-direction: column;
	}

	.gallery-row {
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 18px 0;
		border-bottom: 1px solid var(--admin-border);
		transition: background 0.12s;
	}

	.gallery-row:first-child {
		border-top: 1px solid var(--admin-border);
	}

	.gallery-info {
		flex: 1;
		display: flex;
		align-items: baseline;
		gap: 10px;
		min-width: 0;
	}

	.gallery-title {
		font-size: 0.95rem;
		font-weight: 500;
		color: var(--admin-heading);
	}

	.gallery-slug {
		font-size: 0.76rem;
		color: var(--admin-text-subtle);
		font-family: monospace;
	}

	.gallery-meta {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-shrink: 0;
	}

	.meta-count {
		font-size: 0.8rem;
		color: var(--admin-text-muted);
	}

	.visibility-indicator {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 0.78rem;
		color: var(--admin-text-muted);
	}

	.vis-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}

	.visibility-indicator.visible .vis-dot {
		background: var(--status-sage);
	}

	.visibility-indicator.hidden .vis-dot {
		background: var(--admin-text-subtle);
	}

	.featured-indicator {
		font-size: 0.76rem;
		color: var(--status-amber);
	}

	.gallery-actions {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
	}

	.action-link {
		padding: 4px 12px;
		border: 1px solid var(--admin-border-strong);
		border-radius: 5px;
		color: var(--admin-text-muted);
		text-decoration: none;
		font-size: 0.76rem;
		font-family: "Synonym", system-ui, sans-serif;
		transition: color 0.15s, border-color 0.15s;
	}

	.action-link:hover {
		color: var(--admin-accent-hover);
		border-color: var(--admin-accent);
	}

	.empty-state {
		padding: 48px 0;
		color: var(--admin-text-subtle);
		font-size: 0.88rem;
	}

	@media (max-width: 768px) {
		.galleries-page {
			padding: 20px 16px;
		}

		.gallery-row {
			flex-direction: column;
			align-items: flex-start;
			gap: 10px;
		}

		.gallery-info {
			flex-direction: column;
			gap: 2px;
		}

		.gallery-meta {
			flex-wrap: wrap;
			gap: 12px;
		}

		.gallery-actions {
			width: 100%;
		}

		.action-link {
			flex: 1;
			text-align: center;
		}
	}
</style>
