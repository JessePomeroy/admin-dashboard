<script lang="ts">
import type { ConvexClient } from "convex/browser";
import { setConvexClientContext } from "convex-svelte";
import { untrack } from "svelte";
import InquiriesPage from "../src/lib/pages/InquiriesPage.svelte";

let { client }: { client: ConvexClient } = $props();
setConvexClientContext(untrack(() => client));
</script>

<InquiriesPage data={{}} />
