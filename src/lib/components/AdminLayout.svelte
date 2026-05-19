<script lang="ts">
import { onMount } from "svelte";
import { browser } from "$app/environment";
import { page } from "$app/stores";
import { useQuery } from "@mmailaender/convex-svelte";
import { useAdminClient } from "../adminClient";
import { getAdminCapabilitiesForLayout } from "../capabilities";
import type { Feature } from "../features";
import { isDark } from "../theme";
import { getAdminConfig } from "../config";
import { logger } from "../logger";
import NotificationWidget from "./NotificationWidget.svelte";
import Toast from "./Toast.svelte";
import "../theme.css";

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
		if (mobileMenuOpen) {
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
let mobileMenuOpen = $state(false);

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

const hrefToFlagKey: Record<string, string> = {
	"/admin/orders": "orders",
	"/admin/inquiries": "inquiries",
	"/admin/messages": "messages",
	"/admin/crm": "crm",
	"/admin/quotes": "quotes",
	"/admin/invoicing": "invoices",
	"/admin/contracts": "contracts",
};

// Mark page as seen when navigating (only after notifications query has returned)
let lastMarkedPath = $state("");
$effect(() => {
	const pathname = $page.url.pathname;
	const pageKey = hrefToFlagKey[pathname];
	if (pageKey && pageKey !== lastMarkedPath && api.notifications?.markSeen && notificationsReady) {
		lastMarkedPath = pageKey;
		convexClient.mutation(api.notifications.markSeen, {
			siteUrl: config.siteUrl,
			page: pageKey,
		}).catch((err: unknown) => logger.warn("Failed to mark notifications seen:", pageKey, err));
	}
});

// Change password state
let showPasswordForm = $state(false);
let currentPassword = $state("");
let newPassword = $state("");
let passwordError = $state("");
let passwordSuccess = $state(false);
let passwordSaving = $state(false);

async function handleChangePassword(e: Event) {
	e.preventDefault();
	if (!config.authClient) return;
	passwordError = "";
	passwordSaving = true;
	try {
		const result = await config.authClient.changePassword({
			currentPassword,
			newPassword,
		});
		if (result?.error) {
			passwordError = result.error.message || "Password change failed";
		} else {
			passwordSuccess = true;
			currentPassword = "";
			newPassword = "";
			setTimeout(() => {
				showPasswordForm = false;
				passwordSuccess = false;
			}, 1500);
		}
	} catch (err: unknown) {
		passwordError =
			err instanceof Error ? err.message : "Failed to change password";
	} finally {
		passwordSaving = false;
	}
}

const navItems: {
	href: string;
	label: string;
	icon: string;
	feature?: Feature;
	separator?: boolean;
	creatorOnly?: boolean;
}[] = [
	// Site operations
	{ href: "/admin", label: "dashboard", icon: "grid", feature: "dashboard" },
	{
		href: "/admin/inquiries",
		label: "inquiries",
		icon: "mail",
		feature: "inquiries",
	},
	{
		href: "/admin/orders",
		label: "orders",
		icon: "package",
		feature: "orders",
	},
	{
		href: "/admin/galleries",
		label: "galleries",
		icon: "image",
		feature: "galleries",
	},
	// CRM workflow
	{ href: "/admin/crm", label: "clients", icon: "clients", feature: "crm", separator: true },
	{ href: "/admin/board", label: "board", icon: "board", feature: "board" },
	{ href: "/admin/quotes", label: "quotes", icon: "quotes", feature: "quotes" },
	{
		href: "/admin/contracts",
		label: "contracts",
		icon: "contracts",
		feature: "contracts",
	},
	{
		href: "/admin/invoicing",
		label: "invoicing",
		icon: "invoicing",
		feature: "invoicing",
	},
	// Support tools
	{ href: "/admin/emails", label: "emails", icon: "emails", feature: "emails", separator: true },
	{
		href: "/admin/messages",
		label: "messages",
		icon: "messages",
		feature: "messages",
		creatorOnly: true,
	},
	{
		href: "/admin/platform",
		label: "platform",
		icon: "platform",
		separator: true,
		creatorOnly: true,
	},
];

function isActive(href: string, pathname: string): boolean {
	if (href === "/admin") return pathname === "/admin";
	return pathname.startsWith(href);
}

function closeMobileMenu() {
	mobileMenuOpen = false;
}
</script>

<div class="admin-layout" data-admin style={themeStyle()}>
	<!-- Mobile header -->
	<header class="mobile-header">
		<button class="hamburger" onclick={() => (mobileMenuOpen = !mobileMenuOpen)} aria-label="Toggle menu">
			<span class="hamburger-line" class:open={mobileMenuOpen}></span>
			<span class="hamburger-line" class:open={mobileMenuOpen}></span>
			<span class="hamburger-line" class:open={mobileMenuOpen}></span>
		</button>
		<span class="mobile-brand">{config.siteName}</span>
	</header>

	<!-- Mobile overlay -->
	{#if mobileMenuOpen}
		<button class="mobile-overlay" onclick={closeMobileMenu} aria-label="Close menu"></button>
	{/if}

	<!-- Sidebar -->
	<aside class="sidebar" class:sidebar-open={mobileMenuOpen} aria-label="Admin navigation">
		<div class="sidebar-brand">
			<span class="brand-text">{config.siteName}</span>
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
					class:active={!locked && isActive(item.href, $page.url.pathname)}
					class:locked
					onclick={(e) => { if (locked) e.preventDefault(); closeMobileMenu(); }}
				>
					<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						{#if item.icon === "grid"}
							<rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
						{:else if item.icon === "package"}
							<path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
						{:else if item.icon === "mail"}
							<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
						{:else if item.icon === "image"}
							<rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
						{:else if item.icon === "clients"}
							<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
						{:else if item.icon === "board"}
							<rect x="3" y="3" width="5" height="14" rx="1"/><rect x="10" y="3" width="5" height="10" rx="1"/><rect x="17" y="3" width="5" height="18" rx="1"/>
						{:else if item.icon === "invoicing"}
							<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
						{:else if item.icon === "quotes"}
						<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
					{:else if item.icon === "contracts"}
							<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
						{:else if item.icon === "emails"}
							<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/>
						{:else if item.icon === "messages"}
							<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
						{:else if item.icon === "platform"}
							<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
						{/if}
					</svg>
					<span>{item.label}</span>
					{#if hrefToFlagKey[item.href] && unreadFlags[hrefToFlagKey[item.href]] && !isActive(item.href, $page.url.pathname)}
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
					<button class="theme-toggle" onclick={() => { showPasswordForm = !showPasswordForm; passwordError = ""; passwordSuccess = false; currentPassword = ""; newPassword = ""; }}>
						<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
						</svg>
						<span>change password</span>
					</button>
					{#if showPasswordForm}
						<form class="pw-form" onsubmit={handleChangePassword}>
							{#if passwordError}
								<p class="pw-error" role="alert">{passwordError}</p>
							{/if}
							{#if passwordSuccess}
								<p class="pw-success" role="status">password updated</p>
							{:else}
								<input
									type="password"
									class="pw-input"
									placeholder="current password"
									aria-label="Current password"
									bind:value={currentPassword}
									required
								/>
								<input
									type="password"
									class="pw-input"
									placeholder="new password (8+ chars)"
									aria-label="New password"
									bind:value={newPassword}
									required
									minlength="8"
								/>
								<button type="submit" class="pw-submit" disabled={passwordSaving}>
									{passwordSaving ? "..." : "update"}
								</button>
							{/if}
						</form>
					{/if}
					<button class="theme-toggle" onclick={() => config.authClient?.signOut()}>
						<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
						</svg>
						<span>sign out</span>
					</button>
			{/if}
			<button class="theme-toggle" onclick={toggleTheme}>
				<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					{#if dark}
						<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
					{:else}
						<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
					{/if}
				</svg>
				<span>{dark ? "light mode" : "dark mode"}</span>
			</button>
			<a href="/" class="back-link">
				<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
				</svg>
				<span>back to site</span>
			</a>
		</div>
	</aside>

	<!-- Main content -->
	<main class="admin-main">
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
		background: var(--admin-bg);
		color: var(--admin-text);
		font-family: "Synonym", system-ui, sans-serif;
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
		font-family: "Chillax", sans-serif;
		font-size: 1.05rem;
		font-weight: 500;
		color: var(--admin-heading);
		letter-spacing: 0.01em;
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
		background: var(--admin-bg);
		border-right: 1px solid var(--admin-border);
		display: flex;
		flex-direction: column;
		z-index: 50;
	}

	.sidebar-brand {
		padding: 28px 24px 24px;
	}

	.brand-text {
		font-family: "Chillax", sans-serif;
		font-size: 1.15rem;
		font-weight: 500;
		color: var(--admin-heading);
		letter-spacing: 0.01em;
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
		font-family: "Synonym", system-ui, sans-serif;
		font-size: 0.88rem;
		font-weight: 400;
		letter-spacing: 0.01em;
		transition: color 0.15s;
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

	.nav-item.active .nav-icon {
		opacity: 1;
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
		padding: 8px 12px;
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

	.pw-form {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 12px;
	}

	.pw-input {
		background: var(--admin-surface);
		border: 1px solid var(--admin-border);
		border-radius: 4px;
		padding: 7px 10px;
		font-size: 0.8rem;
		color: var(--admin-heading);
		font-family: "Synonym", system-ui, sans-serif;
		outline: none;
	}

	.pw-input:focus {
		border-color: var(--admin-accent);
	}

	.pw-input::placeholder {
		color: var(--admin-text-subtle);
	}

	.pw-submit {
		background: var(--admin-accent);
		color: var(--admin-bg);
		border: none;
		border-radius: 4px;
		padding: 7px 12px;
		font-size: 0.8rem;
		font-family: "Synonym", system-ui, sans-serif;
		cursor: pointer;
		margin-top: 2px;
	}

	.pw-submit:disabled {
		opacity: 0.5;
	}

	.pw-error {
		color: rgb(248, 113, 113);
		font-size: 0.78rem;
		margin: 0;
	}

	.pw-success {
		color: rgb(74, 222, 128);
		font-size: 0.78rem;
		margin: 0;
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
		font-family: "Synonym", system-ui, sans-serif;
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
		font-family: "Synonym", system-ui, sans-serif;
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
			transition: transform 0.25s ease;
		}

		.sidebar-open {
			transform: translateX(0);
		}

		.admin-main {
			margin-left: 0;
			padding-top: 56px;
			max-width: 100vw;
		}
	}
</style>
