<script lang="ts">
import type { Snippet } from "svelte";
import { useQuery } from "@mmailaender/convex-svelte";
import { getAdminConfig } from "../config";
import LoginPage from "./LoginPage.svelte";
import LoadingState from "./LoadingState.svelte";
import "../theme.css";

const config = getAdminConfig();
const authClient = config.authClient;

let { children }: { children: Snippet } = $props();

// Subscribe to the session nanostore reactively
let sessionData = $state<{ user: { email: string; name?: string; image?: string } } | null>(null);
let sessionPending = $state(true);

if (authClient) {
	const sessionStore = authClient.useSession();
	// useSession() returns a nanostore atom — subscribe to get reactive updates
	if (sessionStore && typeof (sessionStore as any).subscribe === "function") {
		(sessionStore as any).subscribe((val: any) => {
			sessionData = val?.data ?? null;
			sessionPending = val?.isPending ?? false;
		});
	} else {
		// Fallback: plain object (matches our interface)
		sessionData = sessionStore?.data ?? null;
		sessionPending = sessionStore?.isPending ?? false;
	}
}

// Authorization check: verify user's email is allowed for this site
const userEmail = $derived(sessionData?.user?.email);
const accessCheck = $derived(
	userEmail && !config.isCreator
		? useQuery(config.api.adminAuth.checkAdminAccess, {
				email: userEmail,
				siteUrl: config.siteUrl,
			})
		: null,
);

// Creator sites skip the access check
const isAuthorized = $derived(
	config.isCreator || !accessCheck || accessCheck.data?.authorized === true,
);
const authCheckLoading = $derived(
	!config.isCreator && accessCheck && !accessCheck.data && !accessCheck.error,
);
</script>

{#if !authClient}
	{@render children()}
{:else if sessionPending || authCheckLoading}
	<div class="auth-loading" data-admin>
		<LoadingState />
	</div>
{:else if !sessionData}
	<LoginPage />
{:else if !isAuthorized}
	<div class="auth-denied" data-admin>
		<div class="denied-container">
			<h1 class="denied-title">{config.siteName}</h1>
			<p class="denied-message">
				this account ({userEmail}) is not authorized to access this admin panel.
			</p>
			<button
				class="denied-button"
				onclick={() => authClient?.signOut()}
			>
				sign out
			</button>
		</div>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.auth-loading {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--admin-bg);
	}

	.auth-denied {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--admin-bg);
		padding: 24px;
	}

	.denied-container {
		max-width: 360px;
		text-align: center;
	}

	.denied-title {
		font-family: "Chillax", sans-serif;
		font-size: 1.6rem;
		font-weight: 500;
		color: var(--admin-heading);
		margin: 0 0 12px;
		text-transform: lowercase;
	}

	.denied-message {
		color: var(--admin-text-muted);
		font-size: 0.88rem;
		margin: 0 0 24px;
		line-height: 1.5;
	}

	.denied-button {
		background: var(--admin-surface);
		border: 1px solid var(--admin-border);
		color: var(--admin-text);
		padding: 10px 24px;
		border-radius: 6px;
		font-size: 0.88rem;
		font-family: "Synonym", system-ui, sans-serif;
		cursor: pointer;
		transition: border-color 0.15s;
	}

	.denied-button:hover {
		border-color: var(--admin-border-strong);
	}
</style>
