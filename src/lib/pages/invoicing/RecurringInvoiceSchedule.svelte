<script lang="ts">
import { useQuery } from "convex-svelte";
import { getAdminConfig } from "../../config";
import { useAdminClient } from "../../adminClient";
import type { Invoice } from "../../types";
let { invoice }: { invoice: Invoice } = $props();
const config = getAdminConfig();
const api = config.api.recurringInvoices!;
const client = useAdminClient();
const query = useQuery(api.get, () => ({ siteUrl: config.siteUrl, invoiceId: invoice._id }));
type Schedule = {
	state: "active" | "paused" | "canceled" | "completed";
	nextDueDate: string;
	interval: string;
	reason?: string;
};
const schedule = $derived(query.data as Schedule | null | undefined);
let firstDueDate = $state(new Date().toISOString().slice(0, 10));
let busy = $state(false);
let error = $state("");
async function act(state: "active" | "paused" | "canceled" | "start") {
	if (busy) return;
	if (
		state === "canceled" &&
		!confirm("Cancel this schedule permanently? Existing invoices stay available.")
	)
		return;
	busy = true;
	error = "";
	try {
		const args = { siteUrl: config.siteUrl, invoiceId: invoice._id };
		if (state === "start") await client.mutation(api.activate, { ...args, firstDueDate });
		else await client.mutation(api.changeState, { ...args, state });
	} catch (cause) {
		error = cause instanceof Error ? cause.message : "Could not update the recurring schedule.";
	} finally {
		busy = false;
	}
}
</script>
<section class="schedule" aria-label="Recurring invoice schedule">
 <h3>recurring drafts</h3>
 <p>Creates one draft per cycle. Review and send each invoice yourself. Starting snapshots this invoice’s items, tax, notes, and client.</p>
 {#if query.error}<p role="alert">Could not load the schedule. Reopen this invoice to try again.</p>
 {:else if query.isLoading}<p role="status">loading schedule…</p>
 {:else if schedule}
  <p role="status">{schedule.state}{schedule.state === "active" || schedule.state === "paused" ? ` · next cycle ${schedule.nextDueDate}` : ""}</p>
  {#if schedule.reason}<p>Paused because the template, client, or account is unavailable.</p>{/if}
  {#if schedule.state === "active"}<button disabled={busy} onclick={() => act("paused")}>pause schedule</button>{/if}
  {#if schedule.state === "paused"}<button disabled={busy} onclick={() => act("active")}>resume · skip missed dates</button>{/if}
  {#if schedule.state === "active" || schedule.state === "paused"}<button disabled={busy} onclick={() => act("canceled")}>cancel schedule</button>{/if}
 {:else}
  <p>No schedule is active. Existing recurring settings do not start one automatically.</p>
  <label>first cycle date (UTC)<input type="date" min={new Date().toISOString().slice(0,10)} max="2099-12-31" bind:value={firstDueDate} disabled={busy} /></label>
  <button disabled={busy || !firstDueDate || invoice.status === "canceled"} onclick={() => act("start")}>{busy ? "starting…" : "start draft schedule"}</button>
 {/if}
 <p class="hint">Dates use UTC. Short months use their last day, then return to the original day. February 29 becomes February 28 in other years. The end date is inclusive.</p>
 {#if error}<p role="alert">{error}</p>{/if}
</section>
<style>
	.schedule {
		padding-block: 18px;
		margin-block: 12px;
		border-block: 1px solid var(--admin-border);
	}
	h3 {
		font-size: 0.85rem;
		font-weight: 400;
		margin: 0 0 8px;
	}
	p {
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--admin-text-muted);
	}
	label {
		display: grid;
		gap: 6px;
		font-size: 0.8rem;
		max-width: 18rem;
	}
	input,
	button {
		min-height: 44px;
		border: 1px solid var(--admin-border-strong);
		color: var(--admin-text);
		background: var(--admin-bg);
		font: inherit;
		padding: 8px 12px;
	}
	button {
		margin: 10px 8px 0 0;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.hint {
		font-size: 0.75rem;
	}
</style>
