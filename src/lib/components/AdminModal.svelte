<script lang="ts">
import type { Snippet } from "svelte";
import { modalLifecycle } from "../modalLifecycle";
import { dragSheet, sheetBackdropTransition, sheetTransition } from "./adminSheet";

interface Props {
	title: string;
	ariaLabel?: string;
	onclose: () => void;
	size?: "default" | "wide" | "narrow" | "full";
	children: Snippet;
}

let { title, ariaLabel, onclose, size = "default", children }: Props = $props();

function handleOverlayClick(e: MouseEvent) {
	if (e.target === e.currentTarget) {
		onclose();
	}
}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events (modalLifecycle owns keyboard handling.) -->
<div
	use:modalLifecycle={onclose}
	transition:sheetBackdropTransition|global
	class="modal-overlay"
	role="dialog"
	aria-modal="true"
	aria-label={ariaLabel ?? title}
	tabindex="-1"
	onclick={handleOverlayClick}
>
	<div
		class="modal-content"
		transition:sheetTransition|global
		class:modal-content-wide={size === "wide"}
		class:modal-content-narrow={size === "narrow"}
		class:modal-content-full={size === "full"}
		role="document"
	>
		<div class="sheet-handle" aria-hidden="true" use:dragSheet={onclose}>
			<span></span>
		</div>
		<div class="modal-header">
			<h2 class="modal-title">{title}</h2>
			<button class="modal-close" aria-label="Close dialog" onclick={onclose}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>

		<div class="modal-scroll-region">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(8px);
		padding: 1rem;
	}

	.modal-content {
		background: var(--admin-bg);
		border: 1px solid var(--admin-control-edge);
		border-radius: 0;
		width: 100%;
		max-width: var(--admin-modal-max-width, 540px);
		max-height: 90dvh;
		box-sizing: border-box;
		overflow-y: auto;
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
	}

	.modal-content-wide {
		max-width: 600px;
	}

	.modal-content-narrow {
		max-width: 420px;
	}

	.modal-content-full {
		max-width: 1100px;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 20px 28px;
		margin-bottom: 24px;
		border-bottom: 1px solid var(--admin-border-strong);
	}

	.modal-title {
		font-family: "Chillax", sans-serif;
		font-size: 1.35rem;
		font-weight: 500;
		color: var(--admin-heading);
		margin: 0;
	}

	.modal-close {
		background: none;
		border: none;
		color: var(--admin-text-muted);
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		transition: color 0.15s;
	}

	.modal-close:hover {
		color: var(--admin-heading);
	}

	.sheet-handle {
		display: none;
	}

	.modal-scroll-region {
		display: contents;
	}

	@media (max-width: 768px) {
		.sheet-handle {
			display: grid;
			place-items: center;
			flex: 0 0 36px;
			background: var(--admin-bg);
			touch-action: none;
			user-select: none;
			cursor: grab;
		}

		.sheet-handle:active { cursor: grabbing; }

		.sheet-handle span {
			width: 44px;
			height: 4px;
			background: var(--admin-text-muted);
			pointer-events: none;
		}

		.modal-header {
			flex-shrink: 0;
			background: var(--admin-bg);
			padding: var(--admin-modal-mobile-header-padding, 16px 20px);
		}

		.modal-overlay {
			align-items: flex-end;
			padding: 0;
		}

		.modal-content {
			display: flex;
			flex-direction: column;
			max-width: 100%;
			max-height: var(--admin-modal-mobile-max-height, 90dvh);
			border-radius: 0;
			overflow: hidden;
		}

		.modal-scroll-region {
			display: block;
			min-height: 0;
			overflow-y: auto;
			overscroll-behavior: contain;
		}
	}
</style>
