<script lang="ts">
import { isAdminRouteActive } from "./adminNavigation";

let {
	pathname,
	siteSettingsEnabled = false,
	pagesEnabled = false,
	portfolioEnabled = false,
	productsEnabled = false,
	productsHref = "/admin/editor/products",
	blogEnabled = false,
	mobile = false,
	open = false,
	onDismiss,
}: {
	pathname: string;
	siteSettingsEnabled?: boolean;
	pagesEnabled?: boolean;
	portfolioEnabled?: boolean;
	productsEnabled?: boolean;
	productsHref?: string;
	blogEnabled?: boolean;
	mobile?: boolean;
	open?: boolean;
	onDismiss?: () => void;
} = $props();

let items = $derived([
	...(portfolioEnabled
		? [{ href: "/admin/editor/portfolio", label: "portfolio" }]
		: []),
	...(productsEnabled
		? [{ href: productsHref, label: "products" }]
		: []),
	...(blogEnabled
		? [{ href: "/admin/editor/blog", label: "blog" }]
		: []),
	...(pagesEnabled
		? [{ href: "/admin/editor/pages", label: "pages" }]
		: []),
	...(siteSettingsEnabled
		? [{ href: "/admin/editor", label: "site settings" }]
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
		inset: 0 auto 0 var(--editor-rail-width, 52px);
		width: var(--editor-panel-width, 168px);
		box-sizing: border-box;
		padding: 20px 12px;
		background: var(--editor-navigation);
		border-right: 1px solid var(--admin-border);
		z-index: 48;
	}

	.editor-heading {
		display: flex;
		flex-direction: column;
		gap: 2px;
		position: relative;
		padding: 0 8px 20px;
	}

	.editor-navigation:not(.mobile) {
		padding-top: 0;
	}

	.editor-navigation:not(.mobile) .editor-heading {
		box-sizing: border-box;
		justify-content: flex-end;
		height: var(--editor-header-height, 64px);
		padding: 0 8px var(--editor-header-baseline-inset, 12px);
	}

	strong {
		font-family: var(--admin-font-display);
		font-size: 1.08rem;
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
		gap: 0;
		border-left: 1px solid var(--admin-border);
	}

	a {
		position: relative;
		padding: 9px 8px 9px 13px;
		color: var(--admin-text-muted);
		text-decoration: none;
		font-size: 0.76rem;
		transition: color 0.15s ease, background-color 0.15s ease;
	}

	a:hover {
		color: var(--admin-heading);
		background: color-mix(in srgb, var(--admin-heading) 3%, transparent);
	}

	a.active {
		color: var(--admin-heading);
		background: transparent;
		font-weight: 500;
	}

	a.active::before {
		position: absolute;
		top: 7px;
		bottom: 7px;
		left: -2px;
		width: 3px;
		background: var(--admin-accent-strong);
		content: "";
	}

	a:focus-visible {
		outline: 1px solid var(--admin-accent-strong);
		outline-offset: -1px;
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
