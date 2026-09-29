<script lang="ts">
import type { Snippet } from "svelte";

let {
	title,
	actions,
	saveState,
	showActions = true,
	variant = "settings",
}: {
	title: Snippet;
	actions: Snippet;
	saveState?: string;
	showActions?: boolean;
	variant?: "settings" | "blog" | "gallery";
} = $props();

const saveLabel = (state: string) => state === "offline"
	? "offline — saved on this device"
	: state === "saved"
		? "draft saved"
		: state === "dirty"
			? "unsaved changes"
			: state;
</script>

<header class:settings-header={variant !== "gallery"} class:gallery-header={variant === "gallery"}>
	<div class="editor-header-title">{@render title()}</div>
	{#if showActions}<div class="editor-header-actions" class:actions={variant !== "blog"} class:header-actions={variant === "blog"}>
		{#if saveState}
			<span class="editor-save-status" class:save-state={variant === "settings"} class:save-status={variant === "blog"} class:status={variant === "gallery"} class:gallery-status={variant === "gallery"} data-save-state={saveState} data-publication-save-state={saveState} aria-live="polite">{saveLabel(saveState)}</span>
		{/if}
		{@render actions()}
	</div>{/if}
</header>

<style>
.editor-header-title { min-width: 0; }
.editor-header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.editor-save-status { color: var(--admin-text-subtle); font-size: .74rem; margin-right: 4px; }
.editor-save-status.gallery-status { font-size: .7rem; white-space: nowrap; }
.gallery-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 28px; margin-bottom: 18px; }
@media (max-width: 820px) {
	.gallery-header { align-items: flex-start; flex-direction: column; }
	.gallery-header .editor-header-actions { justify-content: flex-start; }
}
@media (max-width: 640px) {
	:global(.settings-header:has(.publication-control)),
	.gallery-header:has(:global(.publication-control)) { align-items: stretch; gap: 12px; }
	.editor-header-actions:has(:global(.publication-control)) { width: 100%; justify-content: flex-start; }
	.editor-header-actions:has(:global(.publication-control)) .editor-save-status[data-save-state="saved"] { display: none; }
}
</style>
