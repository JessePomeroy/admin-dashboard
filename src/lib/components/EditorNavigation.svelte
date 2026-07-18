<script lang="ts">
import { isAdminRouteActive } from "./adminNavigation";

let {
	pathname,
	siteSettingsEnabled = false,
	pagesEnabled = false,
	portfolioEnabled = false,
	blogEnabled = false,
	mobile = false,
	open = false,
	onDismiss,
}: {
	pathname: string;
	siteSettingsEnabled?: boolean;
	pagesEnabled?: boolean;
	portfolioEnabled?: boolean;
	blogEnabled?: boolean;
	mobile?: boolean;
	open?: boolean;
	onDismiss?: () => void;
} = $props();

let items = $derived([
	...(siteSettingsEnabled
		? [{ href: "/admin/editor", label: "site settings" }]
		: []),
	...(pagesEnabled
		? [{ href: "/admin/editor/pages", label: "pages" }]
		: []),
	...(portfolioEnabled
		? [{ href: "/admin/editor/portfolio", label: "portfolio" }]
		: []),
	...(blogEnabled
		? [{ href: "/admin/editor/blog", label: "blog" }]
		: []),
]);

function isCurrent(href: string) {
	return href === "/admin/editor"
		? pathname === href
		: isAdminRouteActive(href, pathname);
}
</script>

<aside
	class="editor-navigation"
	class:mobile
	class:open
	id={mobile ? "editor-mobile-navigation" : undefined}
	aria-label="Site editor navigation"
	aria-hidden={mobile && !open ? "true" : undefined}
>
	<div class="editor-heading">
		<span class="editor-kicker">workspace</span>
		<strong>editor</strong>
		{#if mobile}
			<button type="button" onclick={onDismiss} aria-label="close editor sections">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
					<line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
				</svg>
			</button>
		{/if}
	</div>
	<nav>
		{#each items as item}
			<a href={item.href} class:active={isCurrent(item.href)} aria-current={isCurrent(item.href) ? "page" : undefined} onclick={onDismiss}>
				{item.label}
			</a>
		{/each}
	</nav>
</aside>

<style>
	.editor-navigation {
		position: fixed;
		inset: 0 auto 0 var(--editor-rail-width, 72px);
		width: var(--editor-panel-width, 272px);
		box-sizing: border-box;
		padding: 34px 24px;
		background: var(--admin-surface);
		border-right: 1px solid var(--admin-border);
		box-shadow: 16px 0 36px color-mix(in srgb, var(--admin-bg) 24%, transparent);
		z-index: 48;
	}

	.editor-heading {
		display: flex;
		flex-direction: column;
		gap: 4px;
		position: relative;
		padding: 0 12px 30px;
	}

	.editor-kicker {
		font-size: 0.64rem;
		letter-spacing: 0.14em;
		color: var(--admin-text-subtle);
	}

	strong {
		font-family: var(--admin-font-display);
		font-size: 1.34rem;
		font-weight: 500;
		color: var(--admin-heading);
	}

	.editor-heading button {
		position: absolute;
		top: -5px;
		right: 4px;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--admin-text-muted);
		cursor: pointer;
	}

	.editor-heading button:hover {
		color: var(--admin-heading);
		background: var(--admin-active);
	}

	.editor-heading button svg {
		width: 17px;
		height: 17px;
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	a {
		padding: 12px;
		border-radius: 6px;
		color: var(--admin-text-muted);
		text-decoration: none;
		font-size: 0.9rem;
	}

	a:hover,
	a.active {
		color: var(--admin-heading);
		background: var(--admin-active);
	}

	.mobile {
		display: none;
	}

	@media (max-width: 640px) {
		.editor-navigation:not(.mobile) {
			display: none;
		}

		.mobile {
			display: none;
			flex-direction: column;
			position: fixed;
			inset: 56px auto 0 0;
			width: min(88vw, 340px);
			padding: 26px 22px;
			border-right: 1px solid var(--admin-border);
			box-shadow: 18px 0 50px rgba(0, 0, 0, 0.24);
			transform: translateX(-100%);
			visibility: hidden;
			pointer-events: none;
			z-index: 49;
		}

		.mobile.open {
			display: flex;
			transform: translateX(0);
			visibility: visible;
			pointer-events: auto;
		}

		.mobile .editor-heading {
			padding-bottom: 26px;
		}
	}

	@media (prefers-reduced-motion: no-preference) {
		.mobile {
			transition: transform 0.22s ease, visibility 0.22s ease;
		}
	}
</style>
