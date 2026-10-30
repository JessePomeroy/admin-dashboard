<script lang="ts">
import type { PaginationResult } from "convex/server";
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";
import type { Client, Inquiry } from "../../types";

let { id, onchange }: { id: string; onchange: (inquiry: Inquiry) => void } = $props();
const config = getAdminConfig();
const api = config.api.inquiries;
const client = useAdminClient();
let version = $state(0);
let workflow = $state<{ inquiry: Inquiry; client: Client | null } | null>(null);
let error = $state("");
let busy = $state(false);
let date = $state("");
let notes = $state("");
let category = $state<"photography" | "web">("photography");
let chosenClient = $state("");
let cursors = $state<(string | null)[]>([null]);
let options = $state<PaginationResult<Pick<Client, "_id" | "name" | "email">> | null>(null);
let optionsError = $state(false);

$effect(() => {
	const inquiryId = id;
	version;
	let active = true;
	workflow = null;
	error = "";
	void client.query(api.getWorkflow!, { id: inquiryId }).then((result) => {
		if (!active) return;
		if (result.inquiry.siteUrl !== config.siteUrl) throw new Error("Inquiry is not in this site");
		workflow = result;
		date = result.inquiry.followUpDate ?? "";
		notes = result.inquiry.internalNotes ?? "";
		onchange(result.inquiry);
	}).catch(() => { if (active) error = "could not load the inquiry workflow. retry to continue."; });
	return () => { active = false; };
});

$effect(() => {
	const args = { id, paginationOpts: { cursor: cursors[cursors.length - 1], numItems: 25 } };
	let active = true;
	options = null;
	optionsError = false;
	void client.query(api.clientOptions!, args).then((result) => {
		if (active) options = result;
	}).catch(() => { if (active) optionsError = true; });
	return () => { active = false; };
});

async function link(create: boolean) {
	if (busy || !workflow || (!create && !chosenClient)) return;
	busy = true;
	error = "";
	try {
		await client.mutation(api.linkClient!, { id, category, ...(create ? {} : { clientId: chosenClient }) });
		version += 1;
	} catch { error = "could not link the client. retry the same action."; }
	finally { busy = false; }
}

async function unlink() {
 if (!api.unlinkClient || !workflow?.inquiry.clientId || busy || !globalThis.confirm("Unlink this client? The original inquiry and CRM activity remain available.")) return;
 busy = true;
 error = "";
 try { await client.mutation(api.unlinkClient, { id, expectedClientId: workflow.inquiry.clientId }); version += 1; }
 catch { error = "could not unlink the client. reload before trying again."; }
 finally { busy = false; }
}

async function save(completed = false) {
	if (busy || !workflow) return;
	busy = true;
	error = "";
	try {
		await client.mutation(api.updateFollowUp!, { id, date: date || null, notes, completed });
		version += 1;
	} catch { error = "could not save the follow-up. your changes are still here."; }
	finally { busy = false; }
}
</script>

<section class="workflow" aria-label="Inquiry booking workflow">
	{#if error}<p role="alert">{error} <button onclick={() => version += 1} disabled={busy}>reload</button></p>{/if}
	{#if !workflow && !error}<p role="status">loading client and follow-up…</p>{/if}
	{#if workflow}
		<h3>client</h3>
		{#if workflow.client}
			<a href={`/admin/crm?client=${encodeURIComponent(workflow.client._id)}`}>open {workflow.client.name} in crm</a>
		{:else if workflow.inquiry.clientId}
			<p>the linked client has been removed. the original inquiry is retained.</p>
		{:else}
			<div class="fields">
				<label>existing client
					<select bind:value={chosenClient} disabled={busy || !options}>
						<option value="">choose a client</option>
						{#each options?.page ?? [] as option (option._id)}<option value={option._id}>{option.name}{option.email ? ` — ${option.email}` : ""}</option>{/each}
					</select>
				</label>
				<button disabled={busy || !chosenClient} onclick={() => void link(false)}>link client</button>
			</div>
			{#if optionsError}<p role="alert">could not load clients. <button onclick={() => cursors = [null]}>retry</button></p>{/if}
			{#if options && (cursors.length > 1 || !options.isDone)}
				<nav aria-label="Client choices">
					<button disabled={busy || cursors.length === 1} onclick={() => { chosenClient = ""; cursors = cursors.slice(0, -1); }}>previous clients</button>
					<button disabled={busy || options.isDone} onclick={() => { chosenClient = ""; cursors = [...cursors, options!.continueCursor]; }}>next clients</button>
				</nav>
			{/if}
			<div class="fields">
				<label>new lead category <select bind:value={category} disabled={busy}><option value="photography">photography</option>{#if config.isCreator}<option value="web">web</option>{/if}</select></label>
				<button disabled={busy} onclick={() => void link(true)}>create lead from inquiry</button>
			</div>
		{/if}
		{#if workflow.inquiry.clientId && api.unlinkClient}<button disabled={busy} onclick={() => void unlink()}>unlink client</button>{/if}
		<form onsubmit={(event) => { event.preventDefault(); void save(); }}>
			<h3>follow-up</h3>
			<label>date <input type="date" bind:value={date} disabled={busy} /></label>
			<label>private notes <textarea rows="3" maxlength="5000" bind:value={notes} disabled={busy}></textarea></label>
			<div class="fields">
				<button type="submit" disabled={busy}>{busy ? "saving…" : "save follow-up"}</button>
				{#if workflow.inquiry.followUpDate}<button type="button" disabled={busy} onclick={() => void save(true)}>mark follow-up complete</button>{/if}
			</div>
			{#if workflow.inquiry.followUpCompletedAt}<p>follow-up completed {new Date(workflow.inquiry.followUpCompletedAt).toLocaleDateString()}</p>{/if}
		</form>
	{/if}
</section>

<style>
	.workflow { border-top: 1px solid var(--admin-border); margin-top: 24px; padding-top: 20px; display: grid; gap: 12px; }
	h3, p { margin: 0; font-size: .82rem; font-weight: 400; }
	h3 { color: var(--admin-text-subtle); }
	form, label { display: grid; gap: 8px; }
	label { font-size: .78rem; color: var(--admin-text-muted); }
	.fields, nav { display: flex; align-items: end; flex-wrap: wrap; gap: 10px; }
	select, input, textarea, button { font: inherit; color: var(--admin-text); border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 8px 10px; background: var(--admin-bg); }
	select, textarea { max-width: 100%; }
	button { cursor: pointer; font-size: .8rem; }
	button:disabled { opacity: .5; cursor: default; }
	a { color: var(--admin-accent-hover); }
</style>
