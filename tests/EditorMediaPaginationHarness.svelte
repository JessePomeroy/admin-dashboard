<script lang="ts">
import type { ConvexClient } from "convex/browser";
import { untrack } from "svelte";
import { makeFunctionReference } from "convex/server";
import { setConvexClientContext } from "convex-svelte";
import { createEditorMedia } from "../src/lib/editorMedia.svelte";
import type { PortfolioMediaAsset } from "../src/lib/portfolioEditor";
import PortfolioMediaPicker from "../src/lib/pages/editor/PortfolioMediaPicker.svelte";

let { client, includeAttachments = false, onChoose }: {
	client: ConvexClient;
	includeAttachments?: boolean;
	onChoose: (asset: PortfolioMediaAsset) => void;
} = $props();
setConvexClientContext(untrack(() => client));
let references = $state(["attached", "attached"]);
let open = $state(true);
export const media = createEditorMedia({
	siteUrl: "example.test",
	list: makeFunctionReference<"query">("media:list"),
	placed: makeFunctionReference<"query">("media:placed"),
	references: () => references,
	pickerIncludesAttachments: untrack(() => includeAttachments),
});
const selectedAssetIds = $derived(new Set(references));
export function setReferences(ids: string[]) { references = ids; }
</script>

{#if open}
	<PortfolioMediaPicker
		assets={media.ready}
		{selectedAssetIds}
		mediaBaseUrl="https://media.example.test"
		pagination={media.pagination}
		onChoose={(asset) => { onChoose(asset); references = [...references, asset._id]; }}
		onClose={() => { open = false; }}
	/>
{/if}
