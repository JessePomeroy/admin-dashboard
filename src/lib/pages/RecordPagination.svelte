<script lang="ts">
let {
	records,
	onexport,
}: {
	records: {
		enabled: boolean;
		isLoading: boolean;
		error: Error | null | undefined;
		pageNumber: number;
		hasNext: boolean;
		hasPrevious: boolean;
		exporting: boolean;
		exportCount: number;
		exportError: string;
		deepLinkError: string;
		next: () => void;
		previous: () => void;
		refresh: () => void;
	};
	onexport?: () => void;
} = $props();
</script>
{#if records.enabled}
	<div class="record-pages">
		{#if records.error}<p role="alert">Could not load records. {records.error.message}</p>{/if}
		{#if records.deepLinkError}<p role="alert">{records.deepLinkError}</p>{/if}
		{#if records.exportError}<p role="alert">{records.exportError}</p>{/if}
		<nav aria-label="Record pages">
			<button disabled={!records.hasPrevious || records.isLoading} onclick={records.previous}>previous</button>
			<span aria-live="polite">{records.isLoading ? "loading records…" : `page ${records.pageNumber}`}</span>
			<button disabled={!records.hasNext || records.isLoading} onclick={records.next}>next</button>
			<button disabled={records.isLoading} onclick={records.refresh}>refresh</button>
			{#if onexport}<button disabled={records.exporting} onclick={onexport}>{records.exporting ? `exporting ${records.exportCount}…` : "export matching records"}</button>{/if}
		</nav>
	</div>
{/if}
<style>
	.record-pages {
		margin-block: 16px;
		color: var(--admin-text-muted);
	}
	nav {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
	}
	button {
		min-height: 44px;
		padding: 8px 12px;
		border: 1px solid var(--admin-border);
		background: transparent;
		color: var(--admin-text);
		font: inherit;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	button:hover:not(:disabled) {
		background: var(--admin-active);
	}
	button:focus-visible {
		outline: 2px solid var(--admin-accent);
		outline-offset: 3px;
	}
	p {
		max-width: 70ch;
		line-height: 1.6;
	}
</style>
