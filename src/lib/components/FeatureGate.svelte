<script lang="ts">
import type { Snippet } from "svelte";
import { type Feature, hasFeature } from "../features";
import type { TenantAdminServerSession } from "../adminSession";
import { getAdminSessionCapabilityInput } from "../capabilities";
import UpgradeBanner from "./UpgradeBanner.svelte";

interface Props {
	feature: Feature;
	adminSession: TenantAdminServerSession;
	/** @deprecated Self-service checkout is retired; retained for source compatibility. */
	platformUrl?: string;
	/** @deprecated Self-service checkout is retired; retained for source compatibility. */
	siteUrl?: string;
	/** @deprecated Self-service checkout is retired; retained for source compatibility. */
	clientEmail?: string;
	children: Snippet;
}

let { feature, adminSession, children }: Props = $props();
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
	<UpgradeBanner {feature} />
{/if}
