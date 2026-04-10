<script lang="ts">
/**
 * Admin Orders Dashboard
 *
 * A comprehensive order management system with filtering, sorting, and export capabilities.
 * Demonstrates Svelte 5 runes ($state, $derived) for reactive UI.
 */

import { useQuery, useConvexClient } from "@mmailaender/convex-svelte";
import { getAdminConfig } from "../config";
import { addToast } from "../toast";
import { formatCents, getStatusColor, ORDER_STATUS_COLORS, toId } from "../utils";
import LoadingState from "../components/LoadingState.svelte";
import OrderDetailModal from "./orders/OrderDetailModal.svelte";
import OrderTable from "./orders/OrderTable.svelte";

let { data } = $props();

const config = getAdminConfig();
const { api } = config;
const convexClient = useConvexClient();
const ordersQuery = useQuery(api.orders.list, { siteUrl: config.siteUrl });

// Map Convex format to match what the orders page expects
let orders = $derived(
	(ordersQuery.data ?? []).map((order: any) => ({
		_id: order._id,
		orderNumber: order.orderNumber,
		createdAt: new Date(order._creationTime).toISOString(),
		customerEmail: order.customerEmail,
		customerName: order.customerName || "",
		total: order.total,
		stripeFees: order.stripeFees || 0,
		status: order.status,
		currency: "usd",
		items: order.items,
		shippingAddress: order.shippingAddress || null,
		notes: order.notes || "",
	})),
);

// Filter state - these control what's shown in the table
let statusFilter = $state("all");
let searchQuery = $state("");
let yearFilter = $state("all");
let periodFilter = $state("all"); // all, today, week, month

// Modal state - for the order details popup
let selectedOrder = $state<any>(null);
let notesValue = $state("");
let notesSaving = $state(false);

// Get unique statuses for filter dropdown
const statuses = [
	"all",
	"new",
	"printing",
	"ready",
	"shipped",
	"delivered",
	"refunded",
];

let availableYears = $derived(
	(
		[
			...new Set(
				orders.map((o: any) => new Date(o.createdAt).getFullYear()),
			),
		] as number[]
	).sort((a, b) => b - a),
);

function getDateRange(period: string): { start: Date; end: Date } | null {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	switch (period) {
		case "today":
			return {
				start: today,
				end: new Date(today.getTime() + 24 * 60 * 60 * 1000),
			};
		case "week": {
			const weekStart = new Date(today);
			weekStart.setDate(today.getDate() - today.getDay());
			return {
				start: weekStart,
				end: new Date(today.getTime() + 24 * 60 * 60 * 1000),
			};
		}
		case "month": {
			const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
			return {
				start: monthStart,
				end: new Date(today.getTime() + 24 * 60 * 60 * 1000),
			};
		}
		default:
			return null;
	}
}

// Filter orders
let filteredOrders = $derived(
	orders.filter((order: any) => {
		const orderDate = new Date(order.createdAt);

		// Period filter (today/week/month)
		if (periodFilter !== "all") {
			const range = getDateRange(periodFilter);
			if (range && (orderDate < range.start || orderDate >= range.end)) {
				return false;
			}
		}

		// Year filter
		if (
			yearFilter !== "all" &&
			orderDate.getFullYear() !== parseInt(yearFilter)
		) {
			return false;
		}
		// Status filter
		if (statusFilter !== "all" && order.status !== statusFilter) {
			return false;
		}
		// Search filter
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			const matchEmail = order.customerEmail?.toLowerCase().includes(query);
			const matchNumber = order.orderNumber?.toLowerCase().includes(query);
			const matchName = order.customerName?.toLowerCase().includes(query);
			if (!matchEmail && !matchNumber && !matchName) {
				return false;
			}
		}
		return true;
	}),
);

let totalRevenue = $derived(
	filteredOrders.reduce(
		(sum: number, order: any) => sum + (order.total || 0),
		0,
	),
);

let allTimeRevenue = $derived(
	orders.reduce((sum: number, order: any) => sum + (order.total || 0), 0),
);

async function updateStatus(orderId: string, newStatus: string) {
	try {
		await convexClient.mutation(api.orders.updateStatus, {
			orderId: toId(orderId),
			status: newStatus as any,
		});
		if (selectedOrder?._id === orderId) {
			selectedOrder = { ...selectedOrder, status: newStatus };
		}
	} catch (err) {
		console.error("Failed to update status:", err);
		addToast("Failed to update order status.");
	}
}

function openOrderDetails(order: any) {
	selectedOrder = order;
	notesValue = order.notes || "";
}

function closeModal() {
	selectedOrder = null;
}

async function saveNotes(orderId: string, notes: string) {
	notesSaving = true;
	try {
		await convexClient.mutation(api.orders.updateStatus, {
			orderId: toId(orderId),
			notes,
		});
		if (selectedOrder?._id === orderId) {
			selectedOrder = { ...selectedOrder, notes };
		}
	} catch (err) {
		console.error("Failed to save notes:", err);
		addToast("Failed to save notes.");
	} finally {
		notesSaving = false;
	}
}

function exportCSV() {
	const headers = [
		"Order Number",
		"Date",
		"Customer Name",
		"Customer Email",
		"Items",
		"Gross Revenue",
		"Stripe Fees",
		"Net Revenue",
		"Status",
		"Notes",
	];

	const rows = filteredOrders.map((order: any) => {
		const gross = (order.total || 0) / 100;
		const fees = (order.stripeFees || 0) / 100;
		const net = gross - fees;

		return [
			order.orderNumber || "",
			new Date(order.createdAt).toLocaleDateString("en-US"),
			order.customerName || "",
			order.customerEmail || "",
			(order.items || [])
				.map((i: any) => `${i.productName} x${i.quantity}`)
				.join("; "),
			gross.toFixed(2),
			fees.toFixed(2),
			net.toFixed(2),
			order.status || "",
			order.notes || "",
		];
	});

	const csvContent = [
		headers.join(","),
		...rows.map((row: any[]) =>
			row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
		),
	].join("\n");

	const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `orders-${yearFilter === "all" ? "all" : yearFilter}.csv`;
	link.click();
	URL.revokeObjectURL(url);
}
</script>

{#if ordersQuery.isLoading}
	<LoadingState />
{:else}
<div class="orders-page">
	<header class="page-header">
		<h1>orders</h1>
	</header>

	<!-- Revenue as inline text -->
	<div class="stats-line">
		<span class="stat-item">
			<span class="stat-label">filtered</span>
			<span class="stat-value">{formatCents(totalRevenue)}</span>
			<span class="stat-sub">{filteredOrders.length} orders</span>
		</span>
		<span class="stat-sep">&middot;</span>
		<span class="stat-item">
			<span class="stat-label">all time</span>
			<span class="stat-value">{formatCents(allTimeRevenue)}</span>
			<span class="stat-sub">{orders.length} orders</span>
		</span>
		<span class="stat-sep">&middot;</span>
		<span class="stat-item">
			<span class="stat-label">avg</span>
			<span class="stat-value">{formatCents(orders.length > 0 ? allTimeRevenue / orders.length : 0)}</span>
		</span>
	</div>

	<!-- Filters -->
	<div class="filter-bar">
		<input
			type="text"
			bind:value={searchQuery}
			placeholder="search by email, order #, or name..."
			aria-label="Search orders"
			class="filter-search"
		/>
		<select bind:value={periodFilter} class="filter-select" aria-label="Filter by time period">
			<option value="all">all time</option>
			<option value="today">today</option>
			<option value="week">this week</option>
			<option value="month">this month</option>
		</select>
		<select bind:value={yearFilter} class="filter-select" aria-label="Filter by year">
			<option value="all">all years</option>
			{#each availableYears as year}
				<option value={year}>{year}</option>
			{/each}
		</select>
		<select bind:value={statusFilter} class="filter-select" aria-label="Filter by status">
			{#each statuses as status}
				<option value={status}>
					{status === 'all' ? 'all statuses' : status}
				</option>
			{/each}
		</select>
		<button class="btn-export" onclick={exportCSV}>
			export csv
		</button>
	</div>

	<!-- Orders table -->
	<OrderTable
		orders={filteredOrders}
		onorderclick={openOrderDetails}
		onupdatestatus={updateStatus}
	/>
</div>

{#if selectedOrder}
	<OrderDetailModal
		order={selectedOrder}
		onclose={closeModal}
		onupdatestatus={updateStatus}
		onsavenotes={saveNotes}
	/>
{/if}
{/if}

<style>
	.orders-page {
		padding: 48px 40px;
		max-width: 1200px;
	}

	.page-header {
		margin-bottom: 32px;
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
		margin-bottom: 32px;
		padding-bottom: 24px;
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
	}

	/* Filters */
	.filter-bar {
		display: flex;
		gap: 10px;
		margin-bottom: 24px;
		flex-wrap: wrap;
	}

	.filter-search {
		flex: 1;
		min-width: 200px;
		padding: 7px 12px;
		background: transparent;
		border: 1px solid var(--admin-border-strong);
		border-radius: 6px;
		color: var(--admin-text);
		font-size: 0.83rem;
		font-family: "Synonym", system-ui, sans-serif;
		outline: none;
		transition: border-color 0.15s;
	}

	.filter-search:focus {
		border-color: var(--admin-accent);
	}

	.filter-search::placeholder {
		color: var(--admin-text-subtle);
	}

	.filter-select {
		padding: 7px 12px;
		background: transparent;
		border: 1px solid var(--admin-border-strong);
		border-radius: 6px;
		color: var(--admin-text);
		font-size: 0.83rem;
		font-family: "Synonym", system-ui, sans-serif;
		outline: none;
	}

	.btn-export {
		padding: 7px 14px;
		background: transparent;
		border: 1px solid var(--admin-border-strong);
		border-radius: 6px;
		color: var(--admin-text);
		font-size: 0.82rem;
		font-family: "Synonym", system-ui, sans-serif;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
		white-space: nowrap;
	}

	.btn-export:hover {
		color: var(--admin-heading);
		border-color: var(--admin-text-muted);
	}

	@media (max-width: 768px) {
		.orders-page {
			padding: 20px 16px;
		}

		.filter-bar {
			flex-direction: column;
		}

		.filter-search {
			min-width: unset;
		}

		.stats-line {
			gap: 8px;
		}

		.stat-sep {
			display: none;
		}

		.stat-item {
			flex-basis: 100%;
			gap: 6px;
			margin-bottom: 4px;
		}
	}
</style>
