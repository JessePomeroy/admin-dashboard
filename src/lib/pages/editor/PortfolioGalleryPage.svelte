<script lang="ts">
import PortfolioGalleryEditor from "./PortfolioGalleryEditor.svelte";

let { galleryId }: { galleryId: string } = $props();
</script>

{#key galleryId}
	<PortfolioGalleryEditor {galleryId} />
{/key}
