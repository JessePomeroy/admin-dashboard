<script lang="ts">
import { onMount } from "svelte";
import { type Toast, getToasts, removeToast, subscribe } from "../toast";

let toasts = $state<Toast[]>([]);

onMount(() => {
	toasts = getToasts();
	return subscribe(() => {
		toasts = getToasts();
	});
});
</script>

{#if toasts.length > 0}
	<div class="toast-container" role="status" aria-live="polite">
		{#each toasts as toast (toast.id)}
			<div class="toast toast-{toast.type}">
				<span class="toast-message">{toast.message}</span>
				<button
					class="toast-dismiss"
					onclick={() => removeToast(toast.id)}
					aria-label="Dismiss"
				>&times;</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		bottom: 24px;
		right: 24px;
		z-index: 9999;
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 400px;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-radius: 6px;
		font-size: 0.84rem;
		font-family: "Synonym", system-ui, sans-serif;
		line-height: 1.4;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
		animation: toast-in 0.2s ease-out;
	}

	.toast-error {
		background: var(--status-rose, #e74c5e);
		color: #fff;
	}

	.toast-success {
		background: var(--status-sage, #4a9e6e);
		color: #fff;
	}

	.toast-warning {
		background: var(--status-amber, #d4913a);
		color: #fff;
	}

	.toast-message {
		flex: 1;
	}

	.toast-dismiss {
		background: none;
		border: none;
		color: inherit;
		font-size: 1.1rem;
		cursor: pointer;
		opacity: 0.7;
		padding: 0 2px;
		line-height: 1;
	}

	.toast-dismiss:hover {
		opacity: 1;
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (max-width: 768px) {
		.toast-container {
			left: 16px;
			right: 16px;
			bottom: 16px;
			max-width: none;
		}
	}
</style>
