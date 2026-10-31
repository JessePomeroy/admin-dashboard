<script lang="ts">
import type { ConvexClient } from "convex/browser";
import { setConvexClientContext } from "convex-svelte";
import { untrack } from "svelte";
import Content from "./WorkflowWinsContent.svelte";
let {client}:{client:ConvexClient}=$props();
setConvexClientContext(untrack(()=>client));
</script>
<Content />
