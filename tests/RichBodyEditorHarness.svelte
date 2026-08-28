<script lang="ts">
import type { BlogRichTextDocument } from "../src/lib/blogRichTextModel";
import RichBodyEditor from "../src/lib/pages/editor/RichBodyEditor.svelte";
import type { PortfolioMediaAsset } from "../src/lib/portfolioEditor";

let {
	document = $bindable(),
	mediaAssets = [],
	addableMediaAssets = [],
	mediaBaseUrl,
	onDocumentChange,
}: {
	document: BlogRichTextDocument;
	mediaAssets?: PortfolioMediaAsset[];
	addableMediaAssets?: PortfolioMediaAsset[];
	mediaBaseUrl?: string;
	onDocumentChange: (document: BlogRichTextDocument) => void;
} = $props();

let disabled = $state(false);

function replaceImageAlt() {
	document = {
		...document,
		blocks: document.blocks.map((block) => block.type === "image"
			? { ...block, altText: "Externally revised alt" }
			: block),
	};
}

function acceptDocument(nextDocument: BlogRichTextDocument) {
	document = nextDocument;
	onDocumentChange(nextDocument);
}
</script>

<button type="button" aria-label="Replace image alt externally" onclick={replaceImageAlt}>external alt</button>
<button type="button" aria-label="Toggle disabled" onclick={() => (disabled = !disabled)}>toggle disabled</button>

<RichBodyEditor
	{document}
	{disabled}
	labelledBy="harness-body-heading"
	{mediaAssets}
	{addableMediaAssets}
	{mediaBaseUrl}
	onDocumentChange={acceptDocument}
/>
