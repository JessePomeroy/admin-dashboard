<script lang="ts">
import { onMount } from "svelte";
import { useAdminClient } from "../../adminClient";
import type { TenantAdminLayoutData } from "../../adminSession";
import { getAdminCapabilitiesForLayout } from "../../capabilities";
import { getAdminConfig } from "../../config";

let { data }: { data: Pick<TenantAdminLayoutData, "adminSession"> } = $props();
const config = getAdminConfig();
const { api } = config;
const client = useAdminClient();
const capabilities = $derived(getAdminCapabilitiesForLayout(data));
const authorized = $derived(data.adminSession?.status === "authorized");
const followUpsEnabled = $derived(authorized && capabilities.tier === "full" && capabilities.hasFeature("inquiries") && capabilities.hasFeature("crm"));
const invoicesEnabled = $derived(authorized && capabilities.hasFeature("invoicing"));
const fulfillmentEnabled = $derived(authorized && capabilities.hasFeature("orders"));
const followUpsAvailable = Boolean(api.inquiries?.listPaginated && api.inquiries.getWorkflow && api.inquiries.clientOptions && api.inquiries.linkClient && api.inquiries.updateFollowUp);
const recordsAvailable = Boolean(api.businessRecords?.list && api.businessRecords.get);

interface PreviewRow {
	id: string;
	label: string;
	detail: string;
	status: string;
	date?: string;
	createdAt: number;
}
interface Snapshot {
	phase: "loading" | "ready" | "error";
	rows: PreviewRow[];
	complete: boolean;
	split: boolean;
	count: number;
}
const loading = (): Snapshot => ({ phase: "loading", rows: [], complete: false, split: false, count: 0 });
const failed = (): Snapshot => ({ ...loading(), phase: "error" });
let followUps = $state.raw<Snapshot>(loading());
let overdue = $state.raw<Snapshot>(loading());
let partial = $state.raw<Snapshot>(loading());
let sent = $state.raw<Snapshot>(loading());
let fulfillment = $state.raw<Snapshot>(loading());
let followUpRefresh = $state(0);
let invoiceRefresh = $state(0);
let fulfillmentRefresh = $state(0);

function localDay(date = new Date()) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
let day = $state(localDay());
onMount(() => {
	let timer: ReturnType<typeof setTimeout>;
	const refreshDay = () => {
		day = localDay();
		clearTimeout(timer);
		const now = new Date();
		const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
		timer = setTimeout(refreshDay, midnight.getTime() - now.getTime());
	};
	refreshDay();
	document.addEventListener("visibilitychange", refreshDay);
	return () => {
		clearTimeout(timer);
		document.removeEventListener("visibilitychange", refreshDay);
	};
});

function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid preview");
	return value as Record<string, unknown>;
}
function textField(row: Record<string, unknown>, name: string) {
	const value = row[name];
	return typeof value === "string" ? value : "";
}
function previewRow(value: unknown, kind: "follow-up" | "invoice" | "order"): PreviewRow {
	const row = record(value);
	const id = textField(row, "_id");
	if (!id) throw new Error("Invalid preview record");
	return {
		id,
		label: textField(row, kind === "follow-up" ? "name" : kind === "invoice" ? "invoiceNumber" : "orderNumber") || "unnamed record",
		detail: kind === "follow-up" ? textField(row, "subject") : kind === "invoice" ? textField(row, "clientName") : textField(row, "customerName") || textField(row, "customerEmail"),
		status: kind === "follow-up" ? "follow-up due" : textField(row, "status").replaceAll("_", " "),
		date: textField(row, kind === "follow-up" ? "followUpDate" : "dueDate") || undefined,
		createdAt: typeof row._creationTime === "number" ? row._creationTime : 0,
	};
}
function paginatedSnapshot(value: unknown, kind: "follow-up" | "invoice"): Snapshot {
	const result = record(value);
	if (!Array.isArray(result.page) || typeof result.isDone !== "boolean") throw new Error("Invalid preview page");
	// A required native split is not an accepted page, even if it contains rows.
	if (result.pageStatus === "SplitRequired") return { ...loading(), phase: "ready", split: true };
	return {
		phase: "ready",
		rows: result.page.slice(0, 5).map((row: unknown) => previewRow(row, kind)),
		complete: result.isDone && result.pageStatus !== "SplitRecommended",
		split: false,
		count: result.page.length,
	};
}

$effect(() => {
	const enabled = followUpsEnabled && followUpsAvailable;
	const date = day;
	followUpRefresh;
	if (!enabled) return;
	let active = true;
	followUps = loading();
	void client.query(api.inquiries.listPaginated, {
		siteUrl: config.siteUrl, followUpBefore: date,
		paginationOpts: { numItems: 5, cursor: null },
	}).then((result: unknown) => {
		if (active) followUps = paginatedSnapshot(result, "follow-up");
	}).catch(() => { if (active) followUps = failed(); });
	return () => { active = false; };
});

$effect(() => {
	const enabled = invoicesEnabled && recordsAvailable;
	invoiceRefresh;
	if (!enabled) return;
	let active = true;
	overdue = loading(); partial = loading(); sent = loading();
	for (const status of ["overdue", "partial", "sent"] as const) {
		const accept = (snapshot: Snapshot) => {
			if (!active) return;
			if (status === "overdue") overdue = snapshot;
			else if (status === "partial") partial = snapshot;
			else sent = snapshot;
		};
		void client.query(api.businessRecords?.list, {
			siteUrl: config.siteUrl, kind: "invoices", status,
			paginationOpts: { numItems: 5, cursor: null },
		}).then((result: unknown) => accept(paginatedSnapshot(result, "invoice")))
			.catch(() => accept(failed()));
	}
	return () => { active = false; };
});

$effect(() => {
	const enabled = fulfillmentEnabled && Boolean(api.orders?.list);
	fulfillmentRefresh;
	if (!enabled) return;
	let active = true;
	fulfillment = loading();
	void client.query(api.orders.list, { siteUrl: config.siteUrl, status: "fulfillment_error" })
		.then((result: unknown) => {
			if (!active) return;
			if (!Array.isArray(result)) throw new Error("Invalid order preview");
			const rows = result.map((row: unknown) => previewRow(row, "order")).sort((a, b) => b.createdAt - a.createdAt);
			fulfillment = { phase: "ready", rows: rows.slice(0, 5), count: rows.length, complete: rows.length < 500, split: false };
		}).catch(() => { if (active) fulfillment = failed(); });
	return () => { active = false; };
});

const invoiceSources = $derived([overdue, partial, sent]);
const invoiceSnapshot = $derived.by((): Snapshot => {
	const rows = invoiceSources.flatMap((source) => source.rows);
	const unique = rows.filter((row, index) => rows.findIndex((other) => other.id === row.id) === index);
	return {
		phase: invoiceSources.some((source) => source.phase === "error") ? "error" : invoiceSources.some((source) => source.phase === "loading") ? "loading" : "ready",
		rows: unique.slice(0, 5),
		complete: invoiceSources.every((source) => source.complete),
		split: invoiceSources.some((source) => source.split),
		count: unique.length,
	};
});
const groups = $derived([
	{ id: "follow-ups", title: "due follow-ups", enabled: followUpsEnabled, available: followUpsAvailable, snapshot: followUps, href: "/admin/inquiries", collection: "inquiries", exact: true, empty: "no follow-ups due today or earlier.", refresh: () => { day = localDay(); followUpRefresh += 1; } },
	{ id: "invoices", title: "unpaid invoices", enabled: invoicesEnabled, available: recordsAvailable, snapshot: invoiceSnapshot, href: "/admin/invoicing", collection: "invoices", exact: true, empty: "no overdue, partially paid, or sent invoices.", refresh: () => { invoiceRefresh += 1; } },
	{ id: "fulfillment", title: "fulfillment errors", enabled: fulfillmentEnabled, available: Boolean(api.orders?.list), snapshot: fulfillment, href: "/admin/orders", collection: "orders", exact: recordsAvailable, empty: "no fulfillment errors found in this snapshot.", refresh: () => { fulfillmentRefresh += 1; } },
].filter((group) => group.enabled));
</script>

{#if groups.length}
	<section class="attention" aria-labelledby="attention-heading">
		<div class="attention-heading">
			<h2 id="attention-heading">needs attention</h2>
			<p>up to five items per queue. refresh to check for changes.</p>
		</div>
		{#each groups as group (group.id)}
			<div class="attention-group" data-attention={group.id}>
				<div class="group-heading">
					<h3>{group.title}</h3>
					<div class="group-actions">
						{#if group.available}
							<button type="button" onclick={group.refresh} aria-label={`refresh ${group.title}`}>refresh</button>
						{/if}
						<a href={group.href}>view {group.collection}</a>
					</div>
				</div>
				{#if !group.available}
					<p class="queue-note">preview unavailable for this host. open {group.collection} to review this queue.</p>
				{:else}
					<div aria-live="polite" aria-atomic="false">
						{#if group.snapshot.phase === "loading"}
							<p class="queue-note">loading {group.title}…</p>
						{/if}
						{#if group.snapshot.rows.length}
							<ul>
								{#each group.snapshot.rows as row (row.id)}
									<li>
										<a class="attention-row" href={group.exact ? `${group.href}?open=${encodeURIComponent(row.id)}` : group.href}>
											<span class="record-label"><strong>{row.label}</strong>{#if row.detail}<span>{row.detail}</span>{/if}</span>
											<span class="record-state"><span>{row.status}</span>{#if row.date}<time datetime={row.date}>{row.date}</time>{/if}</span>
										</a>
									</li>
								{/each}
							</ul>
						{/if}
						{#if group.snapshot.phase === "error" || group.snapshot.split}
							<div class="queue-recovery" role="status">
								<p>{group.snapshot.split ? "preview incomplete. this page needs to be reloaded." : "preview incomplete. some records could not load."}</p>
								<button type="button" onclick={group.refresh}>retry {group.title}</button>
							</div>
						{:else if group.snapshot.phase === "ready" && !group.snapshot.complete}
							<div class="queue-recovery">
								<p>{group.id === "fulfillment" ? "500-record limit reached. more fulfillment errors may exist." : "preview incomplete. more records may be available."} open {group.collection} to review more.</p>
							</div>
						{:else if group.snapshot.phase === "ready" && !group.snapshot.rows.length}
							<p class="queue-note">{group.empty}</p>
						{:else if group.snapshot.phase === "ready" && group.snapshot.count > 5}
							<p class="queue-note">showing five items from this snapshot. open {group.collection} to review more.</p>
						{/if}
					</div>
					{#if group.id === "fulfillment"}
						<p class="queue-limit">checks up to 500 fulfillment errors; newest items first.{!group.exact ? " open orders to find a record." : ""}</p>
					{/if}
				{/if}
			</div>
		{/each}
	</section>
{/if}

<style>
	.attention { margin-block: 0 40px; min-width: 0; }
	.attention-heading { margin-bottom: 12px; }
	h2, h3, p { margin: 0; }
	h2 { color: var(--admin-heading); font-size: 1.15rem; font-weight: 500; }
	.attention-heading p, .queue-note, .queue-recovery, .queue-limit { color: var(--admin-text-muted); font-size: 0.875rem; line-height: 1.6; }
	.attention-heading p { margin-top: 6px; }
	.attention-group { padding-block: 12px 16px; border-bottom: 1px solid var(--admin-border); min-width: 0; }
	.group-heading, .group-actions { display: flex; align-items: center; gap: 8px 20px; flex-wrap: wrap; }
	.group-heading { justify-content: space-between; }
	h3 { color: var(--admin-heading); font-size: 0.95rem; font-weight: 500; }
	a, button { color: var(--admin-text-muted); font: inherit; font-size: 0.875rem; text-underline-offset: 4px; }
	.group-actions a, button { display: inline-flex; align-items: center; min-height: 44px; }
	button { background: transparent; border: 0; padding: 8px 4px; cursor: pointer; text-decoration: underline; }
	a:hover, button:hover { color: var(--admin-accent-hover); }
	a:focus-visible, button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 3px; }
	ul { list-style: none; margin: 0; padding: 0; }
	li + li { border-top: 1px solid var(--admin-border); }
	.attention-row { display: flex; align-items: center; justify-content: space-between; gap: 12px 24px; padding-block: 12px; min-height: 44px; text-decoration: none; }
	.attention-row:hover { background: var(--admin-active); }
	.record-label, .record-state { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
	.record-label { gap: 4px; }
	.record-label strong { color: var(--admin-heading); font-weight: 500; }
	.record-state { text-align: end; flex-shrink: 0; max-width: 45%; }
	time { font-variant-numeric: tabular-nums; }
	.queue-note { padding-block: 8px; overflow-wrap: anywhere; }
	.queue-recovery { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 20px; padding-block: 4px; }
	.queue-recovery p { flex: 1 1 30ch; }
	.queue-limit { margin-top: 4px; }
	@media (max-width: 480px) {
		.group-heading { align-items: flex-start; gap: 0; }
		.group-heading h3 { flex-basis: 100%; margin-top: 8px; }
		.attention-row { align-items: flex-start; gap: 12px; }
		.record-label { font-size: 1rem; }
	}
</style>
