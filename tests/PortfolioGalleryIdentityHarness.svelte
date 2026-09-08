<script lang="ts">
import PortfolioGalleryPage from "../src/lib/pages/editor/PortfolioGalleryPage.svelte";

let galleryId = $state("A");
export function navigate(nextGalleryId: string) {
	galleryId = nextGalleryId;
}
</script>

<PortfolioGalleryPage {galleryId} />
