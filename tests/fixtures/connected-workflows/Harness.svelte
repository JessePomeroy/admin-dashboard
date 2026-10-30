<script lang="ts">
import { setConvexClientContext } from "convex-svelte";
import type { ConvexClient } from "convex/browser";
import { untrack } from "svelte";
import InquiriesPage from "../../../src/lib/pages/InquiriesPage.svelte";
import ClientInquiries from "../../../src/lib/pages/crm/ClientInquiries.svelte";
import GalleryProofs from "../../../src/lib/pages/gallery-delivery/GalleryProofs.svelte";
let { client }: { client: ConvexClient } = $props();
setConvexClientContext(untrack(() => client));
let screen = $state("inquiries");
</script>
<nav><button onclick={() => screen = "inquiries"}>inquiry inbox</button><button onclick={() => screen = "proofs"}>gallery selections</button><button onclick={() => screen = "client"}>client requests</button></nav>
{#if screen === "inquiries"}
	<InquiriesPage data={{ inquiries: [], adminSession: { status: "authorized", tier: "full", isCreator: false, email: "owner@example.test" } }} />
{:else if screen === "client"}
	<main><h1>client requests</h1><ClientInquiries clientId="client-1" /></main>
{:else}
	<main><h1>gallery selections</h1><GalleryProofs galleryId="gallery-1" currentSubmissionId="proof-1" /></main>
{/if}
<style>nav { display: flex; flex-wrap: wrap; gap: 12px; padding: 16px; border-bottom: 1px solid var(--admin-border); } button { font: inherit; color: var(--admin-text); background: var(--admin-bg); border: 1px solid var(--admin-border-strong); padding: 8px 12px; border-radius: 6px; } main { padding: 24px; max-width: 1000px; margin: auto; }</style>
