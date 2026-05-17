<script lang="ts">
import type { Snippet } from "svelte";
import { type Feature, hasFeature, type Tier } from "../features";
import { getAdminConfig } from "../config";
import UpgradeBanner from "./UpgradeBanner.svelte";

interface Props {
	feature: Feature;
	tier: Tier;
	isCreator?: boolean;
	platformUrl?: string;
	siteUrl?: string;
	clientEmail?: string;
	children: Snippet;
}

const config = getAdminConfig();

let { feature, tier, isCreator = config.isCreator, platformUrl, siteUrl, clientEmail, children }: Props =
	$props();
let unlocked = $derived(hasFeature(tier, feature, { isCreator }));
</script>

{#if unlocked}
	{@render children()}
{:else}
	<UpgradeBanner {feature} {platformUrl} {siteUrl} {clientEmail} />
{/if}
