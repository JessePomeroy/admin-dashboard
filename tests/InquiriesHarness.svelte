<script lang="ts">
import type { ConvexClient } from "convex/browser";
import { setConvexClientContext } from "convex-svelte";
import { untrack } from "svelte";
import InquiriesPage from "../src/lib/pages/InquiriesPage.svelte";
import type { InquiryUI } from "../src/lib/types";

let { client, inquiries = [] }: { client: ConvexClient; inquiries?: InquiryUI[] } = $props();
setConvexClientContext(untrack(() => client));
</script>

<InquiriesPage data={{ inquiries }} />
