import type { GenericId } from "convex/values";
import type { AdminAPI } from "./config";

/**
 * Cast a string to a Convex GenericId. Convex IDs are strings at runtime,
 * but the TypeScript types require GenericId<"tableName">. Since the admin
 * package doesn't import Convex's generated types (it receives `api: any`),
 * we use this helper to centralize the cast and document the intent.
 *
 * Usage: `toId<"invoices">(id)` returns `GenericId<"invoices">`.
 * When the table name isn't known statically, omit the type parameter —
 * it defaults to `string` which is compatible with any Convex ID position.
 */
export function toId<T extends string = string>(id: string): GenericId<T> {
	return id as GenericId<T>;
}

// Currency formatting
export function formatCents(amount: number, currency = "USD"): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amount / 100);
}

export function dollarsToCents(dollars: number): number {
	return Math.round(dollars * 100);
}

// Invoice math — amounts are stored in cents
export function calcSubtotal(
	items: readonly { quantity: number; unitPrice: number }[],
): number {
	return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

export function calcTax(subtotal: number, taxPercent: number): number {
	return Math.round(subtotal * (taxPercent / 100));
}

export function formatDollars(amount: number): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(amount);
}

// Date formatting
export function formatDate(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function formatDateTime(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

export function formatTimestamp(ts: number): string {
	return formatDateTime(new Date(ts).toISOString());
}

export function formatTimestampDate(ts: number): string {
	return formatDate(new Date(ts).toISOString());
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	const value = bytes / 1024 ** i;
	return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatStatus(status: string): string {
	return status.replace(/_/g, " ").replace(/-/g, " ");
}

export function relativeTime(ts: number): string {
	const diff = Date.now() - ts;
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	return formatDate(new Date(ts).toISOString());
}

// Status colors
export type StatusColorMap = Record<string, string>;

export function getStatusColor(
	map: StatusColorMap,
	status: string,
	fallback = "var(--status-slate)",
): string {
	return map[status] || fallback;
}

export const CLIENT_STATUS_COLORS: StatusColorMap = {
	lead: "var(--status-slate)",
	booked: "var(--status-amber)",
	"in-progress": "var(--status-lavender)",
	completed: "var(--status-sage)",
	archived: "var(--admin-text-subtle)",
};

export const INVOICE_STATUS_COLORS: StatusColorMap = {
	draft: "var(--status-slate)",
	sent: "var(--status-amber)",
	paid: "var(--status-sage)",
	partial: "var(--status-lavender)",
	overdue: "var(--status-rose)",
	canceled: "var(--admin-text-subtle)",
};

export const QUOTE_STATUS_COLORS: StatusColorMap = {
	draft: "var(--status-slate)",
	sent: "var(--status-amber)",
	accepted: "var(--status-sage)",
	declined: "var(--status-rose)",
	expired: "var(--admin-text-subtle)",
};

export const CONTRACT_STATUS_COLORS: StatusColorMap = {
	draft: "var(--status-slate)",
	sent: "var(--status-amber)",
	signed: "var(--status-sage)",
	expired: "var(--admin-text-subtle)",
};

export const ORDER_STATUS_COLORS: StatusColorMap = {
	new: "var(--status-slate)",
	printing: "var(--status-amber)",
	ready: "var(--status-lavender)",
	shipped: "var(--status-peach)",
	delivered: "var(--status-sage)",
	refunded: "var(--status-rose)",
};

export const INQUIRY_STATUS_COLORS: StatusColorMap = {
	new: "var(--status-amber)",
	read: "var(--status-lavender)",
	replied: "var(--status-sage)",
};

export const CATEGORY_COLORS: StatusColorMap = {
	photography: "var(--status-peach)",
	web: "var(--status-lavender)",
};

export const SUBSCRIPTION_STATUS_COLORS: StatusColorMap = {
	active: "var(--status-sage)",
	canceled: "var(--status-rose)",
	past_due: "var(--status-amber)",
	none: "var(--status-slate)",
};

export function getCategoryColor(category: string): string {
	return getStatusColor(CATEGORY_COLORS, category);
}

export async function copyPortalLink(
	// biome-ignore lint/suspicious/noExplicitAny: ref type is Convex's FunctionReference; loose here to interop with any ConvexClient.
	client: { mutation: (ref: any, args: unknown) => Promise<unknown> },
	api: AdminAPI,
	siteUrl: string,
	type: "invoice" | "quote" | "contract" | "gallery",
	documentId: string,
	clientId: string,
): Promise<string> {
	const token = await client.mutation(api.portal.createToken, {
		siteUrl,
		type,
		documentId,
		clientId: toId(clientId),
	});
	const baseUrl = /^https?:\/\//i.test(siteUrl)
		? siteUrl.replace(/\/$/, "")
		: `https://${siteUrl.replace(/\/$/, "")}`;
	const url = `${baseUrl}/portal/${token}`;
	await navigator.clipboard.writeText(url);
	return url;
}

export function getActivityStatusColor(type: string, status: string): string {
	if (type === "order") return getStatusColor(ORDER_STATUS_COLORS, status);
	const combined: StatusColorMap = {
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
	return getStatusColor(combined, status);
}
