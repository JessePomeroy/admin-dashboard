<script lang="ts">
import type { ConvexClient } from "convex/browser";
import { setConvexClientContext } from "convex-svelte";
import { untrack } from "svelte";
import GalleryProofs from "../src/lib/pages/gallery-delivery/GalleryProofs.svelte";
let { client }: { client: ConvexClient } = $props();
setConvexClientContext(untrack(() => client));
</script>
<GalleryProofs galleryId="gallery-1" currentSubmissionId="proof-1" />
