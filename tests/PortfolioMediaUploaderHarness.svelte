<script lang="ts">
import type { PortfolioMediaAsset } from "../src/lib/portfolioEditor";
import PortfolioMediaUploader from "../src/lib/pages/editor/PortfolioMediaUploader.svelte";

let { onReady }: { onReady: (asset: PortfolioMediaAsset) => boolean | void } = $props();
let disabled = $state(false);

export function setDisabled(nextDisabled: boolean) {
	disabled = nextDisabled;
}
</script>

<PortfolioMediaUploader
	endpoint="/api/admin/media"
	{onReady}
	contextLabel="product"
	maxFiles={1}
	{disabled}
/>
