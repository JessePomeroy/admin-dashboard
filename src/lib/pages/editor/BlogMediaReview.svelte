<script lang="ts">
import { portfolioMediaUrl, type PortfolioMediaAsset } from "../../portfolioEditor";

type BlogMediaReviewItem = {
	id: string;
	assetId: string;
	label: string;
	altText?: string;
	caption?: string;
	error?: string;
};

let {
	items,
	mediaById,
	mediaBaseUrl,
	disabled = false,
	onAltTextChange,
}: {
	items: BlogMediaReviewItem[];
	mediaById: Map<string, PortfolioMediaAsset>;
	mediaBaseUrl?: string;
	disabled?: boolean;
	onAltTextChange: (item: BlogMediaReviewItem, value: string) => void;
} = $props();
</script>

<div class="media-review">
	{#each items as item, index (item.id)}
		{@const asset = mediaById.get(item.assetId)}
		{@const inputId = `blog-media-alt-${index}`}
		{@const helpId = `${inputId}-help`}
		{@const errorId = `${inputId}-error`}
		<div class="media-row">
			<div class="media-preview" aria-hidden="true">
				{#if asset && mediaBaseUrl}
					<img src={portfolioMediaUrl(mediaBaseUrl, asset.derivatives.thumb.key)} alt="" />
				{:else}
					<span>preview unavailable</span>
				{/if}
			</div>
			<div class="media-copy">
				<strong>{item.label}</strong>
				<span>{asset?.originalFilename ?? item.assetId}</span>
				{#if item.caption}<small>caption: {item.caption}</small>{/if}
			</div>
			<div class="alt-field">
				<label for={inputId}>alt text for {item.label}</label>
				<input
					id={inputId}
					type="text"
					maxlength="500"
					value={item.altText ?? ""}
					disabled={disabled}
					aria-invalid={Boolean(item.error)}
					aria-describedby={item.error ? `${helpId} ${errorId}` : helpId}
					oninput={(event) => onAltTextChange(item, event.currentTarget.value)}
				/>
				<small id={helpId}>Describe what is visibly important. Avoid guesses or search phrases.</small>
				{#if item.error}<small id={errorId} class="field-error">{item.error}</small>{/if}
			</div>
		</div>
	{/each}
</div>

<style>
	.media-review {
		display: grid;
		border-top: 1px solid var(--admin-border);
	}

	.media-row {
		display: grid;
		grid-template-columns: 112px minmax(150px, 0.45fr) minmax(260px, 1fr);
		align-items: center;
		gap: 18px;
		padding: 16px 0;
		border-bottom: 1px solid var(--admin-border);
	}

	.media-preview {
		display: grid;
		place-items: center;
		width: 112px;
		height: 88px;
		overflow: hidden;
		border-radius: 7px;
		background: var(--admin-surface-raised);
		color: var(--admin-text-subtle);
		font-size: 0.75rem;
		text-align: center;
	}

	.media-preview img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.media-copy,
	.alt-field {
		display: grid;
		gap: 5px;
		min-width: 0;
	}

	.media-copy strong {
		color: var(--admin-heading);
		font-weight: 500;
	}

	.media-copy span,
	.media-copy small,
	.alt-field small {
		color: var(--admin-text-muted);
		font-size: 0.82rem;
		overflow-wrap: anywhere;
	}

	.alt-field {
		color: var(--admin-text);
	}

	.media-row input {
		width: 100%;
		box-sizing: border-box;
	}

	.media-row .field-error {
		color: var(--admin-danger, #ff8f8f);
	}

	@media (max-width: 820px) {
		.media-row {
			grid-template-columns: 88px 1fr;
		}

		.media-preview {
			width: 88px;
			height: 72px;
		}

		.alt-field {
			grid-column: 1 / -1;
		}
	}
</style>
