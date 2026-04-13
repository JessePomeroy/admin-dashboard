<script lang="ts">
import { goto } from "$app/navigation";
import { addToast } from "../toast";

let {
	unreadFlags,
}: {
	unreadFlags: Record<string, boolean>;
} = $props();

const items: { key: string; label: string; href: string }[] = [
	{ key: "orders", label: "new orders", href: "/admin/orders" },
	{ key: "inquiries", label: "new inquiries", href: "/admin/inquiries" },
	{ key: "messages", label: "unread messages", href: "/admin/messages" },
	{ key: "crm", label: "new clients", href: "/admin/crm" },
	{ key: "quotes", label: "quote updates", href: "/admin/quotes" },
	{ key: "invoices", label: "invoice updates", href: "/admin/invoicing" },
	{ key: "contracts", label: "contract updates", href: "/admin/contracts" },
];

let expanded = $state(false);

let unreadItems = $derived(items.filter((item) => unreadFlags[item.key]));
let unreadCount = $derived(unreadItems.length);

// Live toast: fire addToast when a flag flips false → true
let prevFlags = $state<Record<string, boolean>>({});

$effect(() => {
	// Skip the very first render (initial load shouldn't toast)
	if (Object.keys(prevFlags).length === 0) {
		prevFlags = { ...unreadFlags };
		return;
	}
	for (const item of items) {
		if (unreadFlags[item.key] && !prevFlags[item.key]) {
			addToast(item.label, "info");
		}
	}
	prevFlags = { ...unreadFlags };
});

function handleItemClick(href: string) {
	expanded = false;
	goto(href);
}

function handleToggle() {
	expanded = !expanded;
}

function handleKeydown(e: KeyboardEvent) {
	if (e.key === "Escape" && expanded) {
		expanded = false;
	}
}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if unreadCount > 0}
	<div class="notification-widget" class:expanded>
		{#if expanded}
			<div class="notification-list">
				<div class="notification-header">
					<span>{unreadCount} unread</span>
					<button class="close-btn" onclick={() => (expanded = false)} aria-label="Close notifications">&times;</button>
				</div>
				{#each unreadItems as item (item.key)}
					<button class="notification-item" onclick={() => handleItemClick(item.href)}>
						<span class="item-dot"></span>
						<span class="item-label">{item.label}</span>
						<svg class="item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="9 18 15 12 9 6" />
						</svg>
					</button>
				{/each}
			</div>
		{:else}
			<button class="notification-badge" onclick={handleToggle} aria-label="{unreadCount} unread notifications">
				<svg class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
					<path d="M13.73 21a2 2 0 01-3.46 0" />
				</svg>
				<span class="badge-count">{unreadCount}</span>
			</button>
		{/if}
	</div>
{/if}

<style>
	.notification-widget {
		position: fixed;
		bottom: 24px;
		right: 24px;
		z-index: 9998;
		font-family: "Synonym", system-ui, sans-serif;
		text-transform: lowercase;
	}

	.notification-badge {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 14px;
		background: var(--admin-surface-raised, #1e1e2a);
		border: 1px solid var(--admin-border-strong, #333);
		border-radius: 24px;
		color: var(--admin-text, #ccc);
		cursor: pointer;
		font-family: inherit;
		font-size: 0.82rem;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
		transition: border-color 0.15s, box-shadow 0.15s;
		animation: widget-in 0.3s ease-out;
	}

	.notification-badge:hover {
		border-color: var(--admin-accent, #8b7cf7);
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
	}

	.badge-icon {
		width: 15px;
		height: 15px;
		opacity: 0.8;
	}

	.badge-count {
		font-weight: 500;
		color: var(--admin-accent, #8b7cf7);
		min-width: 8px;
		text-align: center;
	}

	.notification-list {
		background: var(--admin-surface-raised, #1e1e2a);
		border: 1px solid var(--admin-border-strong, #333);
		border-radius: 10px;
		min-width: 220px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
		overflow: hidden;
		animation: list-in 0.15s ease-out;
	}

	.notification-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px 8px;
		font-size: 0.78rem;
		color: var(--admin-text-subtle, #777);
		font-weight: 500;
		letter-spacing: 0.02em;
	}

	.close-btn {
		background: none;
		border: none;
		color: var(--admin-text-subtle, #777);
		font-size: 1.1rem;
		cursor: pointer;
		padding: 0 2px;
		line-height: 1;
		opacity: 0.7;
	}

	.close-btn:hover {
		opacity: 1;
	}

	.notification-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 16px;
		background: none;
		border: none;
		color: var(--admin-text, #ccc);
		font-family: inherit;
		font-size: 0.84rem;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s;
	}

	.notification-item:hover {
		background: var(--admin-surface, #16161e);
	}

	.notification-item:last-child {
		padding-bottom: 12px;
	}

	.item-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--admin-accent, #8b7cf7);
		flex-shrink: 0;
	}

	.item-label {
		flex: 1;
	}

	.item-arrow {
		width: 14px;
		height: 14px;
		opacity: 0.3;
		flex-shrink: 0;
	}

	.notification-item:hover .item-arrow {
		opacity: 0.7;
	}

	@keyframes widget-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes list-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (max-width: 768px) {
		.notification-widget {
			bottom: 16px;
			right: 16px;
		}

		.notification-list {
			min-width: 200px;
		}
	}
</style>
