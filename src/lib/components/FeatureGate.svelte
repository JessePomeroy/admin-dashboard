<script lang="ts">
import type { Snippet } from "svelte";
import { type Feature, hasFeature, type Tier } from "../features";
import { getAdminConfig } from "../config";
import type { TenantAdminServerSession } from "../adminSession";
import { getAdminCapabilityFallback } from "../capabilities";
import UpgradeBanner from "./UpgradeBanner.svelte";

interface Props {
	feature: Feature;
	adminSession?: TenantAdminServerSession;
	tier?: Tier;
	isCreator?: boolean;
	platformUrl?: string;
	siteUrl?: string;
	clientEmail?: string;
	children: Snippet;
}

const config = getAdminConfig();

let { feature, adminSession, tier, isCreator, platformUrl, siteUrl, clientEmail, children }: Props =
	$props();
let capabilityFallback = $derived(
	getAdminCapabilityFallback(adminSession, {
		tier: tier ?? (config.isCreator ? "full" : "basic"),
		isCreator: isCreator ?? config.isCreator,
	}),
);
let unlocked = $derived(
	hasFeature(capabilityFallback.tier, feature, {
		isCreator: capabilityFallback.isCreator,
	}),
);
</script>

{#if unlocked}
	{@render children()}
{:else}
	<UpgradeBanner {feature} {platformUrl} {siteUrl} {clientEmail} />
{/if}
