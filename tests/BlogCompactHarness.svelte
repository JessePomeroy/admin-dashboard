<script lang="ts">
import type { ConvexClient } from "convex/browser";
import { setConvexClientContext } from "convex-svelte";
import { untrack } from "svelte";
import BlogPage from "../src/lib/pages/editor/BlogPage.svelte";
import BlogPostPage from "../src/lib/pages/editor/BlogPostPage.svelte";

let { client, overview = false }: { client: ConvexClient; overview?: boolean } = $props();
setConvexClientContext(untrack(() => client));
</script>

{#if overview}
	<BlogPage />
{:else}
	<BlogPostPage documentId="post-1" />
{/if}
