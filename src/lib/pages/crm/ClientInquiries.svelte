<script lang="ts">
import { useQuery } from "convex-svelte";
import type { PaginationResult } from "convex/server";
import { getAdminConfig } from "../../config";
import type { Inquiry } from "../../types";
let { clientId }: { clientId: string } = $props();
const ref = getAdminConfig().api.inquiries.listForClient!;
let cursors = $state<(string | null)[]>([null]);
const query = useQuery(ref, () => ({ clientId, paginationOpts: { numItems: 25, cursor: cursors[cursors.length - 1] } }), { keepPreviousData: false });
const result = $derived(query.data as PaginationResult<Inquiry> | undefined);
</script>

<section aria-label="Linked inquiries">
	<h3>inquiries</h3>
	{#if query.error}<p role="alert">could not load linked inquiries. close and reopen this client to retry.</p>
	{:else if !result}<p role="status">loading inquiries…</p>
	{:else if result.page.length === 0}<p>no inquiries linked to this client</p>
	{:else}
		{#each result.page as inquiry (inquiry._id)}
			<details>
				<summary>{inquiry.subject || "no subject"} · {new Date(inquiry._creationTime).toLocaleDateString()}</summary>
				<p>{inquiry.message}</p>
				{#if inquiry.followUpDate}<p>follow-up: {inquiry.followUpDate}</p>{/if}
				<a href={`/admin/inquiries?open=${encodeURIComponent(inquiry._id)}`}>open inquiry</a>
			</details>
		{/each}
		{#if !result.isDone || cursors.length > 1}<nav aria-label="Linked inquiry pages"><button disabled={cursors.length === 1} onclick={() => cursors = cursors.slice(0, -1)}>newer inquiries</button><button disabled={result.isDone} onclick={() => cursors = [...cursors, result!.continueCursor]}>older inquiries</button></nav>{/if}
	{/if}
</section>

<style>
	section { display: grid; gap: 12px; padding-top: 16px; margin-bottom: 20px; border-top: 1px solid var(--admin-border); font-size: .82rem; color: var(--admin-text); }
	h3, p { margin: 0; font-weight: 400; }
	h3 { color: var(--admin-text-subtle); font-size: .78rem; }
	summary { cursor: pointer; }
	details p { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; margin: 10px 0; }
	a { color: var(--admin-accent-hover); }
	nav { display: flex; gap: 10px; flex-wrap: wrap; }
	button { font: inherit; padding: 8px 12px; border: 1px solid var(--admin-border-strong); color: var(--admin-text); background: var(--admin-bg); border-radius: 6px; cursor: pointer; }
	button:disabled { opacity: .5; cursor: default; }
</style>
