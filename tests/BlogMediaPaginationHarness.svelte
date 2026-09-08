<script lang="ts">
import type { ConvexClient } from "convex/browser";
import { setConvexClientContext } from "convex-svelte";
import { untrack } from "svelte";
import BlogPostPage from "../src/lib/pages/editor/BlogPostPage.svelte";

let { client }: { client: ConvexClient } = $props();
setConvexClientContext(untrack(() => client));
</script>

<BlogPostPage documentId="post-1" />
