<script lang="ts">
import { isAdminRouteActive } from "./adminNavigation";

let { pathname, mobile = false }: { pathname: string; mobile?: boolean } = $props();

const items = [{ href: "/admin/editor", label: "site settings" }];
</script>

<aside class="editor-navigation" class:mobile aria-label="Site editor navigation">
	<div class="editor-heading">
		<span class="editor-kicker">editor</span>
		<strong>site editor</strong>
	</div>
	<nav>
		{#each items as item}
			<a href={item.href} class:active={isAdminRouteActive(item.href, pathname)} aria-current={isAdminRouteActive(item.href, pathname) ? "page" : undefined}>
				{item.label}
			</a>
		{/each}
	</nav>
</aside>

<style>
	.editor-navigation {
		position: fixed;
		inset: 0 auto 0 64px;
		width: 220px;
		box-sizing: border-box;
		padding: 28px 18px;
		background: var(--admin-surface);
		border-right: 1px solid var(--admin-border);
		z-index: 48;
	}

	.editor-heading {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 0 10px 24px;
	}

	.editor-kicker {
		font-size: 0.68rem;
		letter-spacing: 0.14em;
		color: var(--admin-text-subtle);
	}

	strong {
		font-family: var(--admin-font-display);
		font-size: 1rem;
		font-weight: 500;
		color: var(--admin-heading);
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	a {
		padding: 10px;
		border-radius: 6px;
		color: var(--admin-text-muted);
		text-decoration: none;
		font-size: 0.84rem;
	}

	a:hover,
	a.active {
		color: var(--admin-heading);
		background: var(--admin-active);
	}

	.mobile {
		display: none;
	}

	@media (max-width: 768px) {
		.editor-navigation:not(.mobile) {
			display: none;
		}

		.mobile {
			display: block;
			position: static;
			width: auto;
			padding: 12px;
			margin: 4px 12px 12px;
			border: 1px solid var(--admin-border);
			border-radius: 8px;
		}

		.mobile .editor-heading {
			padding-bottom: 10px;
		}
	}
</style>
