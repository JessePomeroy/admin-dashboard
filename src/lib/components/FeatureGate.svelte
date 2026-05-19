<script lang="ts">
import type { Snippet } from "svelte";
import { type Feature, hasFeature } from "../features";
import type { TenantAdminServerSession } from "../adminSession";
import { getAdminSessionCapabilityInput } from "../capabilities";
import UpgradeBanner from "./UpgradeBanner.svelte";

interface Props {
	feature: Feature;
	adminSession: TenantAdminServerSession;
	platformUrl?: string;
	siteUrl?: string;
	clientEmail?: string;
	children: Snippet;
}

let { feature, adminSession, platformUrl, siteUrl, clientEmail, children }: Props = $props();
let capability = $derived(getAdminSessionCapabilityInput(adminSession));
let unlocked = $derived(
	hasFeature(capability.tier, feature, {
		isCreator: capability.isCreator,
	}),
);
</script>

{#if unlocked}
	{@render children()}
{:else}
	<UpgradeBanner {feature} {platformUrl} {siteUrl} {clientEmail} />
{/if}
