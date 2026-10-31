<script lang="ts">
import { onDestroy } from "svelte";
import { useQuery } from "convex-svelte";
import type { PaginationResult } from "convex/server";
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";
import { createGalleryStoragePort } from "./galleryStoragePort";
let { galleryId, activeKeys = [] }: { galleryId: string; activeKeys?: string[] } = $props();
const config = getAdminConfig();
const api = config.api.deliveryUploads!;
const client = useAdminClient();
const storage = createGalleryStoragePort({ fetch, galleryWorkerUrl: config.galleryWorkerUrl });
let active = true;
const cancellation = new AbortController();
onDestroy(() => {
	active = false;
	cancellation.abort();
});
let cursors = $state<(string | null)[]>([null]);
const query = useQuery(
	api.list,
	() => ({
		siteUrl: config.siteUrl,
		galleryId,
		paginationOpts: { numItems: 25, cursor: cursors.at(-1) },
	}),
	{ keepPreviousData: false },
);
type Checkpoint = {
	_id: string;
	r2Key: string;
	filename: string;
	sizeBytes: number;
	width: number;
	height: number;
	state: string;
};
const page = $derived(query.data as PaginationResult<Checkpoint> | undefined);
const recoverable = $derived((page?.page ?? []).filter((row) => !activeKeys.includes(row.r2Key)));
let busy = $state("");
let error = $state("");
let message = $state("");
async function recover(row: Checkpoint) {
	if (busy) return;
	const scope = galleryId;
	const current = () => active && galleryId === scope;
	busy = row._id;
	error = "";
	message = "";
	try {
		const session = await storage.startUploadSession({
			siteUrl: config.siteUrl,
			galleryId: scope,
			signal: cancellation.signal,
		});
		if (!current()) return;
		await storage.process({
			r2Key: row.r2Key,
			uploadSessionToken: session.token,
			expectedSizeBytes: row.sizeBytes,
			signal: cancellation.signal,
		});
		if (!current()) return;
		await client.mutation(config.api.galleryDelivery!.addImage, {
			siteUrl: config.siteUrl,
			galleryId: scope,
			r2Key: row.r2Key,
			filename: row.filename,
			sizeBytes: row.sizeBytes,
			width: row.width,
			height: row.height,
		});
		if (current()) message = `Recovered ${row.filename}.`;
	} catch {
		if (current())
			error = `Could not recover ${row.filename}. If its original transfer did not finish, remove this checkpoint and select the file again. You can retry recovery after a temporary processing failure.`;
	} finally {
		if (current()) busy = "";
	}
}
async function remove(row: Checkpoint) {
	if (busy || !confirm(`Remove the interrupted upload for ${row.filename} and its stored files?`))
		return;
	const scope = galleryId;
	const current = () => active && galleryId === scope;
	busy = row._id;
	error = "";
	message = "";
	try {
		const imageId = await client.mutation(api.markDeleting, {
			siteUrl: config.siteUrl,
			id: row._id,
		});
		if (!current()) return;
		const session = await storage.startUploadSession({
			siteUrl: config.siteUrl,
			galleryId: scope,
			signal: cancellation.signal,
		});
		if (!current()) return;
		await storage.delete({
			r2Key: row.r2Key,
			uploadSessionToken: session.token,
			signal: cancellation.signal,
		});
		if (!current()) return;
		if (imageId)
			await client.mutation(config.api.galleryDelivery!.removeImage, {
				siteUrl: config.siteUrl,
				id: imageId,
			});
		if (!current()) return;
		await client.mutation(api.finishDelete, { siteUrl: config.siteUrl, id: row._id });
		if (current()) message = `Removed ${row.filename}.`;
	} catch {
		if (current()) error = "Cleanup is unfinished. Retry remove to finish safely.";
	} finally {
		if (current()) busy = "";
	}
}
</script>
{#if query.error || recoverable.length || page && (!page.isDone || cursors.length>1) || message || error}
<section class="recovery" aria-label="Interrupted delivery uploads">
 <h3>interrupted uploads</h3>
 <p>Recover stored originals without selecting them again. Transfers stop when you close this page.</p>
 {#if query.error}<p role="alert">Recovery checkpoints could not load. Reopen this gallery to try again.</p>{/if}
 {#each recoverable as row (row._id)}
  <div class="file"><span>{row.filename}</span><div>
   {#if row.state !== "deleting"}<button disabled={Boolean(busy)} onclick={()=>recover(row)}>{busy===row._id ? "working…" : "recover stored file"}</button>{/if}
   <button disabled={Boolean(busy)} onclick={()=>remove(row)}>remove{row.state==="deleting" ? " · finish cleanup" : ""}</button>
  </div></div>
 {/each}
 {#if cursors.length>1}<button disabled={Boolean(busy)||query.isLoading} onclick={()=>cursors=cursors.slice(0,-1)}>previous</button>{/if}
 {#if page && !page.isDone}<button disabled={Boolean(busy)||query.isLoading} onclick={()=>cursors=[...cursors,page!.continueCursor]}>next checkpoints</button>{/if}
 {#if error}<p role="alert">{error}</p>{/if}
 {#if message}<p role="status">{message}</p>{/if}
</section>
{/if}
<style>
	.recovery {
		padding: 16px;
		margin-bottom: 20px;
		border: 1px solid var(--admin-border);
	}
	h3 {
		font-size: 0.85rem;
		font-weight: 400;
		margin: 0 0 8px;
	}
	p {
		font-size: 0.8rem;
		color: var(--admin-text-muted);
		line-height: 1.5;
	}
	.file {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		border-top: 1px solid var(--admin-border);
		padding-block: 8px;
	}
	.file > span {
		overflow-wrap: anywhere;
		min-width: 0;
		flex: 1 1 12rem;
		font-size: 0.85rem;
	}
	button {
		min-height: 44px;
		padding: 8px 12px;
		margin: 4px 6px 0 0;
		background: transparent;
		color: var(--admin-text);
		font: inherit;
		border: 1px solid var(--admin-border-strong);
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.6;
		cursor: default;
	}
</style>
