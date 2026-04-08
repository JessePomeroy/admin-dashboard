<script lang="ts">
import { useQuery } from "convex-svelte";
import { getAdminConfig } from "../config";
import LoadingState from "../components/LoadingState.svelte";
import {
	formatCurrency,
	formatDate,
	formatStatus,
	getStatusColor,
} from "../page-utils";

const config = getAdminConfig();
const { api } = config;

let { data } = $props();

// Convex subscriptions
const orderStatsQuery = useQuery(api.orders.getStats, { siteUrl: config.siteUrl });
const crmStatsQuery = useQuery(api.crm.getStats, { siteUrl: config.siteUrl });
const invoicesQuery = useQuery(api.invoices.list, { siteUrl: config.siteUrl });
const quotesQuery = useQuery(api.quotes.list, { siteUrl: config.siteUrl });

let isLoading = $derived(
	orderStatsQuery.isLoading || crmStatsQuery.isLoading || invoicesQuery.isLoading || quotesQuery.isLoading,
);

// Order stats
const orderStatsData = $derived(orderStatsQuery.data);
const stats = $derived(orderStatsData?.stats ?? { todayRevenue: 0, weekRevenue: 0, monthRevenue: 0, allTimeRevenue: 0, totalOrders: 0 });
const dailyRevenue = $derived(orderStatsData?.dailyRevenue ?? []);
const recentOrders = $derived(orderStatsData?.recentOrders ?? []);

// CRM stats
const crmStats = $derived(crmStatsQuery.data ?? { total: 0, leads: 0, booked: 0, inProgress: 0, completed: 0, photography: 0, web: 0 });

// Invoice stats
const invoices = $derived(invoicesQuery.data ?? []);
const invoiceStats = $derived({
	draft: invoices.filter((i) => i.status === "draft").length,
	sent: invoices.filter((i) => i.status === "sent").length,
	paid: invoices.filter((i) => i.status === "paid").length,
	overdue: invoices.filter((i) => i.status === "overdue").length,
});
const pendingInvoiceAmount = $derived(
	invoices
		.filter((i) => i.status === "draft" || i.status === "sent")
		.reduce((sum, inv) => {
			const invoiceTotal = inv.items.reduce(
				(t: number, item: { quantity: number; unitPrice: number }) => t + item.quantity * item.unitPrice,
				0,
			);
			return sum + invoiceTotal;
		}, 0),
);

// Quote stats
const quotes = $derived(quotesQuery.data ?? []);
const quoteStats = $derived({
	draft: quotes.filter((q) => q.status === "draft").length,
	sent: quotes.filter((q) => q.status === "sent").length,
	accepted: quotes.filter((q) => q.status === "accepted").length,
	declined: quotes.filter((q) => q.status === "declined").length,
});

// Sanity data (still from server)
const newInquiryCount = $derived(data.newInquiryCount);

// Activity feed: combine recent orders, invoices, quotes
const activityFeed = $derived(() => {
	const recentInvoices = invoices.slice(0, 5).map((inv) => ({
		type: "invoice" as const,
		description: `${inv.invoiceNumber} — ${inv.clientName}`,
		createdAt: new Date(inv._creationTime).toISOString(),
		status: inv.status,
	}));

	const recentQuoteItems = quotes.slice(0, 5).map((q) => ({
		type: "quote" as const,
		description: `${q.quoteNumber} — ${q.clientName}`,
		createdAt: new Date(q._creationTime).toISOString(),
		status: q.status,
	}));

	const recentOrderItems = recentOrders.slice(0, 5).map((o) => ({
		type: "order" as const,
		description: `${o.orderNumber} — ${o.customerName || o.customerEmail}`,
		createdAt: o.createdAt,
		status: o.status,
	}));

	return [
		...recentOrderItems,
		...recentInvoices,
		...recentQuoteItems,
	]
		.sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		)
		.slice(0, 5);
});

// Sparkline chart calculations
const chartHeight = 60;
const chartWidth = 600;
let hoveredIndex = $state<number | null>(null);
let maxRevenue = $derived(
	Math.max(...dailyRevenue.map((d: { amount: number }) => d.amount), 1),
);

let sparklinePath = $derived(() => {
	const points = dailyRevenue.map((d: { amount: number }, i: number) => {
		const x = (i / (dailyRevenue.length - 1)) * chartWidth;
		const y = chartHeight - (d.amount / maxRevenue) * (chartHeight - 8);
		return `${x},${y}`;
	});
	return `M${points.join(" L")}`;
});

function getActivityStatusColor(type: string, status: string): string {
	if (type === "order") return getStatusColor(status);
	const colors: Record<string, string> = {
		draft: "var(--status-slate)",
		sent: "var(--status-lavender)",
		paid: "var(--status-sage)",
		overdue: "var(--status-rose)",
		partial: "var(--status-amber)",
		canceled: "var(--status-rose)",
		accepted: "var(--status-sage)",
		declined: "var(--status-rose)",
		expired: "var(--status-slate)",
	};
	return colors[status] || "var(--status-slate)";
}

let chartPoints = $derived(
	dailyRevenue.map((d: { amount: number; date: string }, i: number) => {
		const x = dailyRevenue.length > 1 ? (i / (dailyRevenue.length - 1)) * chartWidth : chartWidth / 2;
		const y = chartHeight - (d.amount / maxRevenue) * (chartHeight - 8);
		return { x, y, amount: d.amount, date: d.date };
	}),
);

let sparklineArea = $derived(() => {
	const points = dailyRevenue.map((d: { amount: number }, i: number) => {
		const x = (i / (dailyRevenue.length - 1)) * chartWidth;
		const y = chartHeight - (d.amount / maxRevenue) * (chartHeight - 8);
		return `${x},${y}`;
	});
	return `M0,${chartHeight} L${points.join(" L")} L${chartWidth},${chartHeight} Z`;
});
</script>

{#if isLoading}
	<LoadingState />
{:else}
<div class="dashboard">
	<header class="page-header">
		<h1>dashboard</h1>
	</header>

	<!-- Stats as inline text -->
	<div class="stats-line">
		<span class="stat-item">
			<span class="stat-label">today</span>
			<span class="stat-value">{formatCurrency(stats.todayRevenue)}</span>
		</span>
		<span class="stat-sep">&middot;</span>
		<span class="stat-item">
			<span class="stat-label">this week</span>
			<span class="stat-value">{formatCurrency(stats.weekRevenue)}</span>
		</span>
		<span class="stat-sep">&middot;</span>
		<span class="stat-item">
			<span class="stat-label">this month</span>
			<span class="stat-value">{formatCurrency(stats.monthRevenue)}</span>
		</span>
		<span class="stat-sep">&middot;</span>
		<span class="stat-item">
			<span class="stat-label">all time</span>
			<span class="stat-value">{formatCurrency(stats.allTimeRevenue)}</span>
			<span class="stat-sub">{stats.totalOrders} orders</span>
		</span>
	</div>

	<!-- Sparkline chart -->
	<div class="chart-section">
		<h2 class="section-label">revenue — last 30 days</h2>
		<div class="chart-container" role="img" aria-label="Revenue sparkline chart">
			<svg viewBox="0 0 {chartWidth} {chartHeight}" preserveAspectRatio="none" class="chart-svg" onmouseleave={() => { hoveredIndex = null; }}>
				<path d={sparklineArea()} fill="var(--admin-active)" />
				<path d={sparklinePath()} fill="none" stroke="var(--admin-accent)" stroke-width="1.5" stroke-opacity="0.5" />
				{#each chartPoints as point, i}
					<!-- invisible wide hit area -->
					<rect
						x={point.x - chartWidth / dailyRevenue.length / 2}
						y="0"
						width={chartWidth / dailyRevenue.length}
						height={chartHeight}
						fill="transparent"
						onmouseenter={() => { hoveredIndex = i; }}
					/>
					<!-- visible dot on hover -->
					{#if hoveredIndex === i}
						<circle cx={point.x} cy={point.y} r="3" fill="var(--admin-accent)" />
						<line x1={point.x} y1={point.y} x2={point.x} y2={chartHeight} stroke="var(--admin-accent)" stroke-width="0.5" stroke-opacity="0.3" />
					{/if}
				{/each}
			</svg>
			{#if hoveredIndex !== null && chartPoints[hoveredIndex]}
				{@const point = chartPoints[hoveredIndex]}
				<div class="chart-tooltip" style="left: {(point.x / chartWidth) * 100}%">
					<span class="tooltip-amount">{formatCurrency(point.amount)}</span>
					<span class="tooltip-date">{formatDate(point.date)}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Activity summary -->
	<div class="activity-summary">
		<h2 class="section-label">activity</h2>
		<p class="summary-line">
			<span class="summary-value">{crmStats.total}</span> clients
			<span class="summary-sep">&middot;</span>
			<span class="summary-value">{crmStats.leads}</span> leads
			<span class="summary-sep">&middot;</span>
			<span class="summary-value">{crmStats.booked}</span> booked
			<span class="summary-sep">&middot;</span>
			<span class="summary-value">{crmStats.inProgress}</span> in progress
		</p>
		<p class="summary-line">
			<span class="summary-value">{invoiceStats.draft + invoiceStats.sent}</span> invoices outstanding
			<span class="summary-sep">&middot;</span>
			<span class="summary-value">{formatCurrency(pendingInvoiceAmount)}</span> pending
		</p>
		<p class="summary-line">
			<span class="summary-value">{quoteStats.sent}</span> quotes awaiting response
		</p>
		{#if newInquiryCount > 0}
			<p class="summary-line inquiry-highlight">
				<span class="summary-value">{newInquiryCount}</span> new {newInquiryCount === 1 ? 'inquiry' : 'inquiries'}
			</p>
		{/if}
	</div>

	<!-- Recent activity feed -->
	<div class="feed-section">
		<h2 class="section-label">recent activity</h2>
		{#if activityFeed().length === 0}
			<p class="empty-state">no recent activity</p>
		{:else}
			<ul class="activity-feed">
				{#each activityFeed() as item}
					<li class="feed-item">
						<span class="feed-type-badge feed-type-{item.type}">{item.type}</span>
						<span class="feed-description">{item.description}</span>
						<span class="feed-meta">
							<span class="feed-date">{formatDate(item.createdAt)}</span>
							<span class="status-indicator">
								<span class="status-dot" style="background: {getActivityStatusColor(item.type, item.status)}"></span>
								{formatStatus(item.status)}
							</span>
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<!-- Recent orders -->
	<div class="orders-section">
		<h2 class="section-label">recent orders</h2>
		{#if recentOrders.length === 0}
			<p class="empty-state">no orders yet</p>
		{:else}
			<div class="table-wrap">
				<table class="orders-table">
					<thead>
						<tr>
							<th>order</th>
							<th>date</th>
							<th>customer</th>
							<th>total</th>
							<th>status</th>
						</tr>
					</thead>
					<tbody>
						{#each recentOrders as order (order._id)}
							<tr>
								<td class="mono">{order.orderNumber}</td>
								<td>{formatDate(order.createdAt)}</td>
								<td>
									<div class="customer-cell">
										<span>{order.customerName || "\u2014"}</span>
										<span class="email">{order.customerEmail || ""}</span>
									</div>
								</td>
								<td class="bold">{formatCurrency(order.total)}</td>
								<td>
									<span class="status-indicator">
										<span class="status-dot" style="background: {getStatusColor(order.status)}"></span>
										{formatStatus(order.status)}
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="view-all">
				<a href="/admin/orders">view all orders &rarr;</a>
			</div>
		{/if}
	</div>
</div>
{/if}

<style>
	.dashboard {
		padding: 48px 40px;
		max-width: 1000px;
	}

	.page-header {
		margin-bottom: 40px;
	}

	.page-header h1 {
		font-family: "Chillax", sans-serif;
		font-size: 1.8rem;
		font-weight: 500;
		color: var(--admin-heading);
		margin: 0;
		letter-spacing: -0.01em;
	}

	/* Stats line */
	.stats-line {
		display: flex;
		align-items: baseline;
		gap: 12px;
		flex-wrap: wrap;
		margin-bottom: 48px;
		padding-bottom: 32px;
		border-bottom: 1px solid var(--admin-border);
	}

	.stat-item {
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
	}

	.stat-label {
		font-size: 0.82rem;
		color: var(--admin-text-muted);
	}

	.stat-value {
		font-size: 1.1rem;
		font-weight: 500;
		color: var(--admin-heading);
	}

	.stat-sub {
		font-size: 0.78rem;
		color: var(--admin-text-subtle);
	}

	.stat-sep {
		color: var(--admin-text-subtle);
		font-size: 0.9rem;
	}

	/* Chart */
	.chart-section {
		margin-bottom: 48px;
	}

	.section-label {
		font-family: "Synonym", system-ui, sans-serif;
		font-size: 0.78rem;
		font-weight: 400;
		color: var(--admin-text-muted);
		letter-spacing: 0.04em;
		margin: 0 0 16px;
	}

	.chart-container {
		width: 100%;
		height: 60px;
		position: relative;
	}

	.chart-svg {
		width: 100%;
		height: 100%;
	}

	.chart-tooltip {
		position: absolute;
		top: -36px;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		pointer-events: none;
	}

	.tooltip-amount {
		font-size: 0.82rem;
		font-weight: 500;
		color: var(--admin-heading);
		font-variant-numeric: tabular-nums;
	}

	.tooltip-date {
		font-size: 0.68rem;
		color: var(--admin-text-muted);
	}

	/* Orders */
	.orders-section {
		margin-bottom: 32px;
	}

	.table-wrap {
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	.orders-table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
		font-size: 0.86rem;
	}

	.orders-table th {
		color: var(--admin-text-subtle);
		font-weight: 400;
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		padding: 0 16px 12px 0;
		border-bottom: 1px solid var(--admin-border);
	}

	.orders-table td {
		padding: 14px 16px 14px 0;
		border-bottom: 1px solid var(--admin-border);
		color: var(--admin-text);
	}

	.orders-table tbody tr:hover {
		background: var(--admin-active);
	}

	.mono {
		font-family: monospace;
		font-size: 0.8rem;
		color: var(--admin-text-muted);
	}

	.bold {
		font-weight: 500;
		color: var(--admin-heading);
	}

	.customer-cell {
		display: flex;
		flex-direction: column;
	}

	.email {
		font-size: 0.76rem;
		color: var(--admin-text-subtle);
	}

	.status-indicator {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.8rem;
		color: var(--admin-text-muted);
	}

	.status-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.view-all {
		padding-top: 20px;
	}

	.view-all a {
		color: var(--admin-text-muted);
		text-decoration: none;
		font-size: 0.82rem;
		transition: color 0.15s;
	}

	.view-all a:hover {
		color: var(--admin-accent-hover);
	}

	.empty-state {
		padding: 40px 0;
		color: var(--admin-text-subtle);
		font-size: 0.88rem;
	}

	/* Activity summary */
	.activity-summary {
		margin-bottom: 48px;
	}

	.summary-line {
		font-size: 0.86rem;
		color: var(--admin-text-muted);
		margin: 0 0 6px;
		line-height: 1.6;
	}

	.summary-value {
		font-weight: 500;
		color: var(--admin-heading);
	}

	.summary-sep {
		color: var(--admin-text-subtle);
		margin: 0 4px;
	}

	.inquiry-highlight {
		color: var(--admin-accent);
	}

	.inquiry-highlight .summary-value {
		color: var(--admin-accent);
	}

	/* Activity feed */
	.feed-section {
		margin-bottom: 48px;
	}

	.activity-feed {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.feed-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 0;
		border-bottom: 1px solid var(--admin-border);
		font-size: 0.86rem;
	}

	.feed-item:first-child {
		border-top: 1px solid var(--admin-border);
	}

	.feed-type-badge {
		font-size: 0.7rem;
		font-weight: 500;
		letter-spacing: 0.03em;
		color: var(--admin-text-subtle);
		min-width: 52px;
		text-align: center;
	}

	.feed-type-order {
		color: var(--status-peach);
	}

	.feed-type-invoice {
		color: var(--status-sage);
	}

	.feed-type-quote {
		color: var(--status-lavender);
	}

	.feed-description {
		flex: 1;
		color: var(--admin-text);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.feed-meta {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-shrink: 0;
	}

	.feed-date {
		font-size: 0.78rem;
		color: var(--admin-text-subtle);
	}

	@media (max-width: 768px) {
		.dashboard {
			padding: 20px 16px;
		}

		.page-header {
			margin-bottom: 28px;
		}

		.stats-line {
			gap: 8px;
			margin-bottom: 32px;
			padding-bottom: 24px;
		}

		.stat-sep {
			display: none;
		}

		.stat-item {
			flex-basis: 45%;
			flex-direction: column;
			gap: 2px;
			margin-bottom: 8px;
		}

		.summary-line {
			line-height: 1.8;
		}

		.summary-sep {
			display: none;
		}

		.summary-line span {
			display: inline;
		}

		.feed-item {
			flex-wrap: wrap;
			gap: 8px;
		}

		.feed-meta {
			width: 100%;
			padding-left: 64px;
		}

		.feed-type-badge {
			min-width: 44px;
			font-size: 0.68rem;
		}
	}
</style>
