<script lang="ts">
import { makeFunctionReference } from "convex/server";
import { createEditorMedia } from "../src/lib/editorMedia.svelte";
let references = $state(["placed", "placed"]);
const options = {
	siteUrl: "example.test",
	list: makeFunctionReference<"query">("media:list"),
	placed: makeFunctionReference<"query">("media:placed"),
	references: () => references,
};
export const library = createEditorMedia(options);
export const attached = createEditorMedia({ ...options, pickerIncludesAttachments: true });
export function setReferences(ids: string[]) { references = ids; }
</script>
<output>{library.ready.length}:{attached.ready.length}:{library.byId.size}:{attached.byId.size}</output>
