import type { Feature } from "../features";

export type AdminNavIcon =
	| "grid"
	| "editor"
	| "mail"
	| "package"
	| "image"
	| "clients"
	| "board"
	| "quotes"
	| "contracts"
	| "invoicing"
	| "emails"
	| "messages"
	| "platform";

export type AdminNavItem = {
	href: string;
	label: string;
	icon: AdminNavIcon;
	feature?: Feature;
	separator?: boolean;
	creatorOnly?: boolean;
};

const baseAdminNavItems: AdminNavItem[] = [
	{ href: "/admin", label: "dashboard", icon: "grid", feature: "dashboard" },
	{ href: "/admin/inquiries", label: "inquiries", icon: "mail", feature: "inquiries" },
	{ href: "/admin/orders", label: "orders", icon: "package", feature: "orders" },
	{ href: "/admin/galleries", label: "client galleries", icon: "image", feature: "galleries" },
	{ href: "/admin/crm", label: "clients", icon: "clients", feature: "crm", separator: true },
	{ href: "/admin/board", label: "board", icon: "board", feature: "board" },
	{ href: "/admin/quotes", label: "quotes", icon: "quotes", feature: "quotes" },
	{ href: "/admin/contracts", label: "contracts", icon: "contracts", feature: "contracts" },
	{ href: "/admin/invoicing", label: "invoicing", icon: "invoicing", feature: "invoicing" },
	{ href: "/admin/emails", label: "emails", icon: "emails", feature: "emails", separator: true },
	{
		href: "/admin/messages",
		label: "messages",
		icon: "messages",
		feature: "messages",
		creatorOnly: true,
	},
	{
		href: "/admin/platform",
		label: "platform",
		icon: "platform",
		separator: true,
		creatorOnly: true,
	},
];

export function getAdminNavItems({ editorEnabled = false } = {}): AdminNavItem[] {
	if (!editorEnabled) return baseAdminNavItems;
	return [
		baseAdminNavItems[0],
		{ href: "/admin/editor", label: "editor", icon: "editor", feature: "editor" },
		...baseAdminNavItems.slice(1),
	];
}

/** Backward-compatible default for tests and consumers without Editor config. */
export const adminNavItems = getAdminNavItems();

export const hrefToNotificationKey: Record<string, string> = {
	"/admin/orders": "orders",
	"/admin/inquiries": "inquiries",
	"/admin/messages": "messages",
	"/admin/crm": "crm",
	"/admin/quotes": "quotes",
	"/admin/invoicing": "invoices",
	"/admin/contracts": "contracts",
};

export function isAdminRouteActive(href: string, pathname: string): boolean {
	return href === "/admin" ? pathname === "/admin" : pathname.startsWith(`${href}/`) || pathname === href;
}
