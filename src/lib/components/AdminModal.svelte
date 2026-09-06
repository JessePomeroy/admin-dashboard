<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	title: string;
	ariaLabel?: string;
	onclose: () => void;
	size?: "default" | "wide" | "narrow" | "full";
	children: Snippet;
}

let { title, ariaLabel, onclose, size = "default", children }: Props = $props();

let contentEl = $state<HTMLDivElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

$effect(() => {
	if (contentEl) {
		previouslyFocused = document.activeElement as HTMLElement;
		const closeBtn = contentEl.querySelector<HTMLElement>(".modal-close");
		closeBtn?.focus();
	}
	return () => {
		previouslyFocused?.focus();
	};
});

function handleKeydown(e: KeyboardEvent) {
	if (e.key === "Escape") {
		onclose();
		return;
	}
	if (e.key === "Tab" && contentEl) {
		const focusable = contentEl.querySelectorAll<HTMLElement>(
			'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
		);
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}
}

function handleOverlayClick(e: MouseEvent) {
	if (e.target === e.currentTarget) {
		onclose();
	}
}
</script>

<div
	class="modal-overlay"
	role="dialog"
	aria-modal="true"
	aria-label={ariaLabel ?? title}
	tabindex="-1"
	onclick={handleOverlayClick}
	onkeydown={handleKeydown}
>
	<div
		class="modal-content"
		class:modal-content-wide={size === "wide"}
		class:modal-content-narrow={size === "narrow"}
		class:modal-content-full={size === "full"}
		bind:this={contentEl}
		role="document"
	>
		<div class="modal-header">
			<h2 class="modal-title">{title}</h2>
			<button class="modal-close" aria-label="Close dialog" onclick={onclose}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>

		{@render children()}
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
		border: 1px solid var(--admin-border);
		border-radius: 12px;
		width: 100%;
		max-width: var(--admin-modal-max-width, 540px);
		max-height: 90vh;
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
		padding: 24px 28px 20px;
	}

	.modal-title {
		font-family: "Chillax", sans-serif;
		font-size: 1.1rem;
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

	@media (max-width: 768px) {
		.modal-header {
			padding: var(--admin-modal-mobile-header-padding, 24px 28px 20px);
		}

		.modal-overlay {
			align-items: flex-end;
			padding: 0;
		}

		.modal-content {
			max-width: 100%;
			max-height: var(--admin-modal-mobile-max-height, 85vh);
			border-radius: 12px 12px 0 0;
		}
	}
</style>
