<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	title: string;
	actions?: Snippet;
}

let { title, actions }: Props = $props();
</script>

<header class="page-header">
	<div class="header-left">
		<h1>{title}</h1>
	</div>
	{#if actions}
		<div class="header-actions">
			{@render actions()}
		</div>
	{/if}
</header>

<style>
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: var(--editor-header-height, 64px);
		margin-bottom: 28px;
		border-bottom: 1px solid var(--admin-border);
	}

	h1 {
		font-family: "Chillax", sans-serif;
		font-size: 1.3rem;
		font-weight: 500;
		color: var(--admin-heading);
		margin: 0;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	@media (max-width: 768px) {
		.page-header {
			min-height: auto;
			padding: 18px 0;
			gap: 12px;
			flex-wrap: wrap;
		}
	}
</style>
