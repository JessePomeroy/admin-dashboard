<script lang="ts">
import { createSingletonDraft } from "../src/lib/singletonDraft.svelte";
let { save } = $props<{
	save: (payload: { text: string }, revisionId: string | undefined) => Promise<{ revisionId: string }>;
}>();
export const draft = createSingletonDraft({
	copy: (payload: { text: string } | undefined) => ({ text: payload?.text ?? "" }),
	serialize: (payload) => JSON.stringify(payload),
	storageKey: "singleton-test",
	conflictMessage: "Review the newer server draft.",
	save: (payload, revisionId) => save(payload, revisionId),
});
</script>
<input aria-label="draft" bind:value={draft.form.text} />
<output>{draft.state}</output>
<p role="alert">{draft.error}</p>
