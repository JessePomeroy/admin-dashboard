<script lang="ts">
import type { ConvexClient } from "convex/browser";
import { setConvexClientContext } from "convex-svelte";
import { untrack } from "svelte";
import GalleryDeliveryPage from "../src/lib/pages/gallery-delivery/GalleryDeliveryPage.svelte";
let { client }: { client: ConvexClient } = $props();
setConvexClientContext(untrack(() => client));
</script>
<GalleryDeliveryPage adminSession={{ status: "authorized", email: "owner@example.invalid", tier: "full", isCreator: true }} />
