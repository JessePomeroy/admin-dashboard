<script lang="ts">
import ProductPage from "../src/lib/pages/editor/ProductPage.svelte";

let productId = $state("product-1");

export function navigate(nextProductId: string) {
	productId = nextProductId;
}
</script>

<ProductPage {productId} />
