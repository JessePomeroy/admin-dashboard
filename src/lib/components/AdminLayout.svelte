<script lang="ts">
import { onMount } from "svelte";
import { browser } from "$app/environment";
import { page } from "$app/stores";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../adminClient";
import { getCatalogProductEditorCapability } from "../catalogProductCapability";
import { getAdminCapabilitiesForLayout } from "../capabilities";
import { isDark } from "../theme";
import { getAdminConfig } from "../config";
import { logger } from "../logger";
import NotificationWidget from "./NotificationWidget.svelte";
import Toast from "./Toast.svelte";
import AdminNavIcon from "./AdminNavIcon.svelte";
import ChangePasswordForm from "./ChangePasswordForm.svelte";
import EditorNavigation from "./EditorNavigation.svelte";
import { getAdminNavItems, hrefToNotificationKey, isAdminRouteActive } from "./adminNavigation";
import "../theme.css";
import "../styles/editor-shell.css";

const config = getAdminConfig();
const { api } = config;

let { data, children } = $props();

let dark = $state(true);

// Build CSS override string from custom theme
let themeStyle = $derived(() => {
	const overrides = dark ? config.theme?.dark : config.theme?.light;
	if (!overrides) return "";
	return Object.entries(overrides)
		.filter(([, v]) => v)
		.map(([k, v]) => `--${k}: ${v}`)
		.join("; ");
});

// Sync theme with public site preference
onMount(() => {
	const unsub = isDark.subscribe((val) => {
		dark = val;
		if (val) {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}
	});
	return unsub;
});

function toggleTheme() {
	if (dark) {
		isDark.setLight();
	} else {
		isDark.setDark();
	}
}

// Lock body scroll when mobile sidebar is open
$effect(() => {
	if (browser) {
		if (mobileMenuOpen || editorMenuOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}
	}
});

let capabilities = $derived(
	getAdminCapabilitiesForLayout(data, {
		boardProjectTypes: config.boardProjectTypes,
	}),
);
let siteSettingsEditorEnabled = $derived(
	Boolean(config.editor?.siteSettings && api.siteEditor),
);
let homepageQuoteEditorEnabled = $derived(
	Boolean(config.editor?.homepageQuote && api.siteEditor),
);
let contactPageEditorEnabled = $derived(
	Boolean(config.editor?.contactPage && api.siteEditor),
);
let aboutPageEditorEnabled = $derived(
	Boolean(config.editor?.aboutPage && api.siteEditor),
);
let modelingPageEditorEnabled = $derived(
	Boolean(config.editor?.modelingPage && api.siteEditor),
);
let pagesEditorEnabled = $derived(
	homepageQuoteEditorEnabled
		|| contactPageEditorEnabled
		|| aboutPageEditorEnabled
		|| modelingPageEditorEnabled,
);
let portfolioEditorEnabled = $derived(
	Boolean(config.editor?.portfolio && api.portfolioEditor),
);
let blogEditorEnabled = $derived(
	Boolean(config.editor?.blog && api.blogContent && api.postContent),
);
let productsEditorEnabled = $derived(Boolean(getCatalogProductEditorCapability(config)));
let editorEnabled = $derived(
	siteSettingsEditorEnabled
		|| pagesEditorEnabled
		|| portfolioEditorEnabled
		|| productsEditorEnabled
		|| blogEditorEnabled,
);
let editorActive = $derived(
	editorEnabled && isAdminRouteActive("/admin/editor", $page.url.pathname),
);
let navItems = $derived(getAdminNavItems({ editorEnabled }));
let mobileMenuOpen = $state(false);
let editorMenuOpen = $state(false);

$effect(() => {
	if (!editorActive) editorMenuOpen = false;
});

// Auth session state (subscribe to nanostore)
let authUserEmail = $state<string | undefined>(undefined);
if (config.authClient) {
	const sessionStore = config.authClient.useSession();
	if (sessionStore?.subscribe) {
		sessionStore.subscribe((val) => {
			authUserEmail = val?.data?.user?.email;
		});
	}
}

// Notification dots
const convexClient = useAdminClient();
let unreadFlags = $state<Record<string, boolean>>({
	orders: false,
	inquiries: false,
	messages: false,
	crm: false,
	quotes: false,
	invoices: false,
	contracts: false,
});
let notificationsReady = $state(false);

// Subscribe to notifications
const notificationsRef = api.notifications?.getUnreadFlags;
if (notificationsRef) {
	const notificationsQuery = useQuery(notificationsRef, { siteUrl: config.siteUrl });
	$effect(() => {
		if (notificationsQuery.data) {
			unreadFlags = notificationsQuery.data as Record<string, boolean>;
			notificationsReady = true;
		}
	});
}

// Mark page as seen when navigating (only after notifications query has returned)
let lastMarkedPath = $state("");
$effect(() => {
	const pathname = $page.url.pathname;
	const pageKey = hrefToNotificationKey[pathname];
	if (pageKey && pageKey !== lastMarkedPath && api.notifications?.markSeen && notificationsReady) {
		lastMarkedPath = pageKey;
		convexClient.mutation(api.notifications.markSeen, {
			siteUrl: config.siteUrl,
			page: pageKey,
		}).catch((err: unknown) => logger.warn("Failed to mark notifications seen:", pageKey, err));
	}
});

let showPasswordForm = $state(false);
function closeMobileMenu() {
	mobileMenuOpen = false;
	editorMenuOpen = false;
}
</script>

<div class="admin-layout" class:editor-workspace={editorActive} data-admin style={themeStyle()}>
	<!-- Mobile header -->
	<header class="mobile-header">
		{#if editorActive}
			<a href="/admin" class="editor-mobile-back" aria-label="back to admin" onclick={closeMobileMenu}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
				</svg>
				<span>admin</span>
			</a>
			<span class="mobile-brand">editor</span>
			<button
				class="editor-mobile-menu"
				onclick={() => (editorMenuOpen = !editorMenuOpen)}
				aria-label="toggle editor sections"
				aria-controls="editor-mobile-navigation"
				aria-expanded={editorMenuOpen}
			>
				<span>sections</span>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M6 9l6 6 6-6" />
				</svg>
			</button>
		{:else}
			<button class="hamburger" onclick={() => (mobileMenuOpen = !mobileMenuOpen)} aria-label="Toggle menu">
				<span class="hamburger-line" class:open={mobileMenuOpen}></span>
				<span class="hamburger-line" class:open={mobileMenuOpen}></span>
				<span class="hamburger-line" class:open={mobileMenuOpen}></span>
			</button>
			<span class="mobile-brand">{config.siteName}</span>
		{/if}
	</header>

	<!-- Mobile overlay -->
	{#if mobileMenuOpen || editorMenuOpen}
		<button class="mobile-overlay" onclick={closeMobileMenu} aria-label="Close menu"></button>
	{/if}

	<!-- Sidebar -->
	<aside class="sidebar" class:sidebar-open={mobileMenuOpen && !editorActive} class:editor-compact={editorActive} aria-label="Admin navigation">
		<div class="sidebar-brand">
			<span class="brand-text">{config.siteName}</span>
			<span class="brand-mark" aria-hidden="true">{config.siteName.slice(0, 1)}</span>
		</div>

		<nav class="sidebar-nav" aria-label="Main navigation">
			{#each navItems as item}
				{@const locked = item.feature ? !capabilities.hasFeature(item.feature) : false}
				{@const hidden = item.creatorOnly && !capabilities.isCreator}
				{#if hidden}
					<!-- hidden for non-creator -->
				{:else}
				{#if item.separator}
					<div class="nav-separator"></div>
				{/if}
				<a
					href={locked ? "#" : item.href}
					class="nav-item"
					class:active={!locked && isAdminRouteActive(item.href, $page.url.pathname)}
					class:locked
					aria-label={editorActive ? item.label : undefined}
					title={editorActive ? item.label : undefined}
					onclick={(e) => { if (locked) e.preventDefault(); closeMobileMenu(); }}
				>
					<AdminNavIcon icon={item.icon} />
					<span>{item.label}</span>
					{#if hrefToNotificationKey[item.href] && unreadFlags[hrefToNotificationKey[item.href]] && !isAdminRouteActive(item.href, $page.url.pathname)}
						<span class="nav-dot" aria-label="new content"></span>
					{/if}
					{#if locked}
						<svg class="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
						</svg>
					{/if}
				</a>
				{/if}
			{/each}
		</nav>
		<div class="sidebar-footer">
			{#if config.authClient && authUserEmail}
					<div class="user-info">
						<span class="user-email">{authUserEmail}</span>
					</div>
					<button class="theme-toggle" onclick={() => (showPasswordForm = !showPasswordForm)} aria-label="change password" title={editorActive ? "change password" : undefined}>
						<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
						</svg>
						<span>change password</span>
					</button>
					{#if showPasswordForm}
						<ChangePasswordForm
							changePassword={(input) => config.authClient!.changePassword(input)}
							onSuccess={() => (showPasswordForm = false)}
						/>
					{/if}
					<button class="theme-toggle" onclick={() => config.authClient?.signOut()} aria-label="sign out" title={editorActive ? "sign out" : undefined}>
						<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
						</svg>
						<span>sign out</span>
					</button>
			{/if}
			<button class="theme-toggle" onclick={toggleTheme} aria-label={dark ? "switch to light mode" : "switch to dark mode"} title={editorActive ? (dark ? "light mode" : "dark mode") : undefined}>
				<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					{#if dark}
						<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
					{:else}
						<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
					{/if}
				</svg>
				<span>{dark ? "light mode" : "dark mode"}</span>
			</button>
			<a href="/" class="back-link" aria-label="back to site" title={editorActive ? "back to site" : undefined}>
				<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
				</svg>
				<span>back to site</span>
			</a>
		</div>
	</aside>

	{#if editorActive}
		<EditorNavigation
			pathname={$page.url.pathname}
			siteSettingsEnabled={siteSettingsEditorEnabled}
			pagesEnabled={pagesEditorEnabled}
			portfolioEnabled={portfolioEditorEnabled}
			productsEnabled={productsEditorEnabled}
			productsHref={config.editor?.products?.baseHref}
			blogEnabled={blogEditorEnabled}
		/>
		<EditorNavigation
			pathname={$page.url.pathname}
			siteSettingsEnabled={siteSettingsEditorEnabled}
			pagesEnabled={pagesEditorEnabled}
			portfolioEnabled={portfolioEditorEnabled}
			productsEnabled={productsEditorEnabled}
			productsHref={config.editor?.products?.baseHref}
			blogEnabled={blogEditorEnabled}
			mobile
			open={editorMenuOpen}
			onDismiss={() => (editorMenuOpen = false)}
		/>
	{/if}

	<!-- Main content -->
	<main class="admin-main" class:editor-active={editorActive}>
		{@render children()}
	</main>

	<Toast />
	{#if notificationsReady}
		<NotificationWidget {unreadFlags} />
	{/if}
</div>

<style>
	.admin-layout {
		display: flex;
		min-height: 100vh;
		background: var(--editor-canvas, var(--admin-bg));
		color: var(--admin-text);
		font-family: var(--admin-font-body);
		text-transform: lowercase;
	}

	/* Mobile header */
	.mobile-header {
		display: none;
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 56px;
		background: var(--admin-bg);
		border-bottom: 1px solid var(--admin-border);
		align-items: center;
		padding: 0 20px;
		z-index: 40;
		gap: 14px;
	}

	.mobile-brand {
		font-family: var(--admin-font-display);
		font-size: 1.05rem;
		font-weight: 500;
		color: var(--admin-heading);
		letter-spacing: 0.01em;
	}

	.editor-mobile-back,
	.editor-mobile-menu {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		min-height: 36px;
		padding: 8px 10px;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--admin-text-muted);
		font: inherit;
		font-size: 0.78rem;
		text-decoration: none;
		cursor: pointer;
	}

	.editor-mobile-back:hover,
	.editor-mobile-menu:hover {
		color: var(--admin-heading);
		background: var(--admin-active);
	}

	.editor-mobile-back svg,
	.editor-mobile-menu svg {
		width: 16px;
		height: 16px;
	}

	.editor-mobile-menu {
		margin-left: auto;
	}

	.hamburger {
		display: flex;
		flex-direction: column;
		gap: 5px;
		background: none;
		border: none;
		cursor: pointer;
		padding: 4px;
	}

	.hamburger-line {
		width: 20px;
		height: 1.5px;
		background: var(--admin-text-muted);
		border-radius: 1px;
		transition: transform 0.2s, opacity 0.2s;
	}

	.hamburger-line.open:nth-child(1) {
		transform: translateY(6.5px) rotate(45deg);
	}

	.hamburger-line.open:nth-child(2) {
		opacity: 0;
	}

	.hamburger-line.open:nth-child(3) {
		transform: translateY(-6.5px) rotate(-45deg);
	}

	.mobile-overlay {
		display: none;
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(4px);
		z-index: 45;
	}

	/* Sidebar */
	.sidebar {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		width: 220px;
		background: var(--editor-chrome, var(--admin-bg));
		border-right: 1px solid var(--admin-border);
		display: flex;
		flex-direction: column;
		z-index: 50;
	}

	.sidebar-brand {
		display: flex;
		align-items: flex-end;
		position: relative;
		box-sizing: border-box;
		flex: 0 0 var(--editor-header-height, 64px);
		height: var(--editor-header-height, 64px);
		overflow: hidden;
		padding: 0 24px var(--editor-header-baseline-inset, 12px);
	}

	.brand-text {
		display: block;
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
		font-family: var(--admin-font-display);
		font-size: 1.15rem;
		font-weight: 500;
		color: var(--admin-heading);
		letter-spacing: 0.01em;
		white-space: nowrap;
	}

	.brand-mark {
		position: absolute;
		bottom: var(--editor-header-baseline-inset, 12px);
		left: 10px;
		display: block;
		width: 30px;
		overflow: hidden;
		color: var(--admin-heading);
		font-family: var(--admin-font-display);
		font-size: 1rem;
		font-weight: 500;
		letter-spacing: 0.01em;
		opacity: 0;
		text-align: center;
		white-space: nowrap;
		pointer-events: none;
	}

	.nav-separator {
		height: 1px;
		background: var(--admin-border);
		margin: 8px 12px;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 6px;
		color: var(--admin-text-muted);
		text-decoration: none;
		font-family: var(--admin-font-body);
		font-size: 0.88rem;
		font-weight: 400;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}

	.nav-item > span:not(.nav-dot),
	.theme-toggle > span,
	.back-link > span {
		min-width: 0;
		max-width: 150px;
		overflow: hidden;
		opacity: 1;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.nav-item:hover {
		color: var(--admin-heading);
	}

	.nav-item.active {
		color: var(--admin-heading);
		font-weight: 500;
	}

	.nav-icon {
		width: 17px;
		height: 17px;
		flex-shrink: 0;
		opacity: 0.7;
	}

	.nav-item.locked {
		opacity: 0.35;
		cursor: default;
	}

	.nav-item.locked:hover {
		color: var(--admin-text-muted);
	}

	.nav-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--admin-accent);
		margin-left: auto;
		flex-shrink: 0;
		animation: dot-fade-in 0.2s ease;
	}

	@keyframes dot-fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.lock-icon {
		width: 12px;
		height: 12px;
		margin-left: auto;
		opacity: 0.5;
	}

	.sidebar-nav {
		flex: 1;
		padding: 6px 7px;
		display: flex;
		flex-direction: column;
		gap: 1px;
		overflow-y: auto;
	}

	.sidebar-footer {
		padding: 16px 12px;
		flex-shrink: 0;
	}

	.user-info {
		padding: 0 12px 8px;
		border-bottom: 1px solid var(--admin-border);
		margin-bottom: 8px;
	}

	.user-email {
		font-size: 0.78rem;
		color: var(--admin-text-subtle);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: block;
	}

	.theme-toggle {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 6px;
		color: var(--admin-text-subtle);
		background: none;
		border: none;
		font-family: var(--admin-font-body);
		font-size: 0.82rem;
		cursor: pointer;
		transition: color 0.15s;
		width: 100%;
		text-align: left;
	}

	.theme-toggle:hover {
		color: var(--admin-text);
	}

	.back-link {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 6px;
		color: var(--admin-text-subtle);
		text-decoration: none;
		font-family: var(--admin-font-body);
		font-size: 0.82rem;
		transition: color 0.15s;
	}

	.back-link:hover {
		color: var(--admin-text);
	}

	/* Main content */
	.admin-main {
		flex: 1;
		margin-left: 220px;
		min-height: 100vh;
		max-width: calc(100vw - 220px);
		overflow-x: hidden;
	}

	/* Keep every operational workspace on the same quiet 64px header seam as
	 * the editor. Page-local layouts still own their content below the line. */
	:global(.admin-main:not(.editor-active) > [class$="-page"]),
	:global(.admin-main:not(.editor-active) > .dashboard) {
		box-sizing: border-box;
		width: 100%;
		max-width: 1120px;
		padding: 0 40px 72px;
	}

	:global(.admin-main:not(.editor-active) .page-header) {
		min-height: var(--editor-header-height, 64px);
		margin: 0 0 28px;
		border-bottom: 1px solid var(--admin-border);
	}

	:global(.admin-main:not(.editor-active) .page-header h1) {
		font-size: 1.3rem;
		font-weight: 500;
	}

	/* Mobile responsive */
	@media (max-width: 768px) {
		.mobile-header {
			display: flex;
		}

		.mobile-overlay {
			display: block;
		}

		.sidebar {
			transform: translateX(-100%);
		}

		.sidebar-open {
			transform: translateX(0);
		}

		.admin-main {
			margin-left: 0;
			padding-top: 56px;
			max-width: 100vw;
		}

		:global(.admin-main:not(.editor-active) > [class$="-page"]),
		:global(.admin-main:not(.editor-active) > .dashboard) {
			padding: 0 20px 48px;
		}

		:global(.admin-main:not(.editor-active) .page-header) {
			min-height: auto;
			padding: 18px 0;
		}
	}

	@media (max-width: 768px) and (prefers-reduced-motion: no-preference) {
		.sidebar {
			transition: transform 0.25s ease;
		}
	}
</style>
