<script lang="ts">
import PortfolioGalleryEditor from "./PortfolioGalleryEditor.svelte";
import PortfolioWorkbench from "./PortfolioWorkbench.svelte";

let { galleryId }: { galleryId: string } = $props();
</script>

<PortfolioWorkbench selectedGalleryId={galleryId}>
	{#key galleryId}
		<PortfolioGalleryEditor {galleryId} />
	{/key}
</PortfolioWorkbench>
