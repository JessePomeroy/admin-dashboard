<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { page } from "$app/stores";
import type { AdminAuthClient } from "../config";
import { addToast } from "../toast";

type Props = {
	listAccounts: NonNullable<AdminAuthClient["listAccounts"]>;
	linkSocial: NonNullable<AdminAuthClient["linkSocial"]>;
	callbackURL: string;
};

let { listAccounts, linkSocial, callbackURL }: Props = $props();
let status = $state<"checking" | "linked" | "unlinked" | "unavailable" | "opening">("checking");
let active = true;
let readGeneration = 0;
onDestroy(() => { active = false; });

function callbackMessage(code: string | null) {
	if (code === "access_denied") return "google connection canceled. you can try again.";
	if (code === "email_doesn't_match") return "use the google account with the same email as your admin login.";
	if (code === "account_already_linked_to_different_user") return "this google account is connected to another login. contact your administrator.";
	return "google wasn't connected. try again.";
}

async function checkConnection(returnedError?: string) {
	const generation = ++readGeneration;
	status = "checking";
	try {
		const result = await listAccounts();
		if (!active || generation !== readGeneration) return;
		if (result.error || !Array.isArray(result.data)) {
			status = "unavailable";
			return;
		}
		status = result.data.some(account => account.providerId === "google") ? "linked" : "unlinked";
		if (status === "unlinked" && returnedError) addToast(returnedError);
	} catch {
		if (active && generation === readGeneration) status = "unavailable";
	}
}

onMount(() => {
	const returnedError = $page.url.searchParams.get("google_link") === "error"
		? callbackMessage($page.url.searchParams.get("error")) : undefined;
	void checkConnection(returnedError);
	const restore = (event: PageTransitionEvent) => {
		if (event.persisted) void checkConnection();
	};
	window.addEventListener("pageshow", restore);
	return () => window.removeEventListener("pageshow", restore);
});

async function connect() {
	if (status !== "unlinked") return;
	status = "opening";
	try {
		const callback = new URL(callbackURL, window.location.href);
		const errorCallback = new URL(callback);
		errorCallback.searchParams.set("google_link", "error");
		const result = await linkSocial({
			provider: "google",
			callbackURL: callback.href,
			errorCallbackURL: errorCallback.href,
			disableRedirect: true,
		});
		if (!active) return;
		if (result.error || !result.data?.url) throw new Error("Google link request failed");
		const destination = new URL(result.data.url);
		if (destination.protocol !== "https:" || destination.hostname !== "accounts.google.com"
			|| destination.port || destination.username || destination.password) {
			throw new Error("Unexpected Google authorization destination");
		}
		// Explicit linking must let the person choose the matching Google account.
		const prompts = new Set((destination.searchParams.get("prompt") ?? "").split(/\s+/).filter(value => value && value !== "none"));
		prompts.add("select_account");
		destination.searchParams.set("prompt", [...prompts].join(" "));
		window.location.assign(destination.href);
	} catch {
		if (!active) return;
		status = "unlinked";
		addToast("couldn't open google. try again.");
	}
}
</script>

{#if status === "unlinked" || status === "opening" || status === "unavailable"}
	<button
		type="button"
		class="theme-toggle google-link"
		disabled={status === "opening"}
		aria-label={status === "unavailable" ? "retry google connection check" : "connect google"}
		title={status === "unavailable" ? "couldn't check google connection. try again." : "connect google"}
		onclick={() => status === "unavailable" ? checkConnection() : connect()}
	>
			<svg class="nav-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
			</svg>
		<span>
			{status === "opening" ? "opening google…" : status === "unavailable" ? "retry google check" : "connect google"}
		</span>
	</button>
{/if}

<style>
	.google-link:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.google-link:disabled { cursor: wait; opacity: 0.6; }
</style>
