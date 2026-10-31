<script lang="ts">
let {
	conflict,
	recovered,
	error,
	onreload,
	ondownload,
}: {
	conflict: boolean;
	recovered: boolean;
	error: string;
	onreload: () => void;
	ondownload: () => void;
} = $props();
</script>

{#if conflict || recovered || error}
	<div class="recovery" role={conflict || error ? "alert" : "status"}>
		<p>{error || (conflict ? "This draft changed elsewhere. Your local edits are preserved. Download them before choosing the server draft." : recovered ? "Recovered unsaved work from this tab. Review it before saving." : "")}</p>
		<div class="actions">
			<button type="button" onclick={ondownload}>download my draft</button>
			{#if conflict}<button type="button" onclick={onreload}>use server draft</button>{/if}
		</div>
	</div>
{/if}

<style>
	.recovery {
		padding-block: 16px;
		margin-bottom: 20px;
		border-block: 1px solid var(--admin-border);
		color: var(--admin-text);
	}
	p {
		max-width: 70ch;
		margin: 0 0 12px;
		line-height: 1.6;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	button {
		min-height: 44px;
		padding: 8px 12px;
		border: 1px solid var(--admin-border-strong);
		background: transparent;
		color: var(--admin-text);
		font: inherit;
		cursor: pointer;
	}
	button:hover {
		background: var(--admin-active);
	}
	button:focus-visible {
		outline: 2px solid var(--admin-accent);
		outline-offset: 3px;
	}
</style>
