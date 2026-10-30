<script lang="ts">
import { useQuery } from "convex-svelte";
import type { PaginationResult } from "convex/server";
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";

interface Proof { _id: string; selectedCount: number; submittedAt: number; notes: string; reopenedAt?: number }
interface ProofImage { _id: string; filename: string; editingNotes: string }
let { galleryId, currentSubmissionId }: { galleryId: string; currentSubmissionId?: string } = $props();
const api = getAdminConfig().api.galleryDelivery!;
const client = useAdminClient();
let cursors = $state<(string | null)[]>([null]);
let imageCursors = $state<(string | null)[]>([null]);
let selectedId = $state("");
let busy = $state(false);
let error = $state("");
const proofsQuery = useQuery(api.listProofs!, () => ({ galleryId, paginationOpts: { numItems: 25, cursor: cursors[cursors.length - 1] } }), { keepPreviousData: false });
const proofs = $derived(proofsQuery.data as PaginationResult<Proof> | undefined);
const proofId = $derived(selectedId || proofs?.page[0]?._id);
const proof = $derived(proofs?.page.find((item) => item._id === proofId));
const imagesQuery = useQuery(api.getProofImages!, () => proofId ? { submissionId: proofId, paginationOpts: { numItems: 50, cursor: imageCursors[imageCursors.length - 1] } } : "skip", { keepPreviousData: false });
const images = $derived(imagesQuery.data as PaginationResult<ProofImage> | undefined);
async function reopen() {
	if (!proofId || busy || !globalThis.confirm("Reopen this selection for changes? The submitted selection and notes remain in history.")) return;
	busy = true;
	error = "";
	try { await client.mutation(api.reopenProof!, { galleryId, submissionId: proofId }); }
	catch { error = "could not reopen the selection. refresh before trying again."; }
	finally { busy = false; }
}
</script>

<section aria-label="Submitted gallery selections">
	{#if proofsQuery.error}<p role="alert">could not load submitted selections. close and reopen to retry.</p>
	{:else if !proofs}<p role="status">loading selections…</p>
	{:else if proofs.page.length === 0}<p>no selection submitted yet.</p>
	{:else}
		<label>submission <select value={proofId} onchange={(event) => { selectedId = event.currentTarget.value; imageCursors = [null]; }}>
			{#each proofs.page as item (item._id)}<option value={item._id}>{new Date(item.submittedAt).toLocaleString()} · {item.selectedCount} selected{item.reopenedAt ? " · reopened" : ""}</option>{/each}
		</select></label>
		{#if proof}
			<p>{proof.selectedCount} files selected · {proof._id === currentSubmissionId && !proof.reopenedAt ? "final selection" : "previous submission"}</p>
			{#if proof.notes}<p class="notes">{proof.notes}</p>{/if}
			{#if proof._id === currentSubmissionId && !proof.reopenedAt}<button disabled={busy} onclick={() => void reopen()}>{busy ? "reopening…" : "reopen selection"}</button>{/if}
		{/if}
		{#if error}<p role="alert">{error}</p>{/if}
		{#if imagesQuery.error}<p role="alert">could not load selection files. choose the submission again to retry.</p>
		{:else if !images}<p role="status">loading selected files…</p>
		{:else}
			<ol>{#each images.page as image (image._id)}<li><strong>{image.filename}</strong>{#if image.editingNotes}<p class="notes">{image.editingNotes}</p>{/if}</li>{/each}</ol>
			<nav aria-label="Selected files pages"><button disabled={imageCursors.length === 1} onclick={() => imageCursors = imageCursors.slice(0, -1)}>previous files</button><span>page {imageCursors.length}</span><button disabled={images.isDone} onclick={() => imageCursors = [...imageCursors, images!.continueCursor]}>next files</button></nav>
		{/if}
		{#if !proofs.isDone || cursors.length > 1}<nav aria-label="Submission history"><button disabled={cursors.length === 1} onclick={() => { selectedId = ""; imageCursors = [null]; cursors = cursors.slice(0, -1); }}>newer submissions</button><button disabled={proofs.isDone} onclick={() => { selectedId = ""; imageCursors = [null]; cursors = [...cursors, proofs!.continueCursor]; }}>older submissions</button></nav>{/if}
	{/if}
</section>

<style>
	section { display: grid; gap: 16px; padding: 20px 0; color: var(--admin-text); font-size: .85rem; }
	label { display: grid; gap: 8px; }
	select, button { font: inherit; background: var(--admin-bg); color: var(--admin-text); border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 8px 12px; max-width: 100%; }
	button { cursor: pointer; justify-self: start; }
	button:disabled { opacity: .5; cursor: default; }
	p { margin: 0; }
	.notes { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
	ol { padding-left: 24px; display: grid; gap: 16px; }
	li { overflow-wrap: anywhere; }
	nav { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
</style>
