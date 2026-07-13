import { describe, expect, it } from "vitest";
import {
	adminNavItems,
	hrefToNotificationKey,
	isAdminRouteActive,
} from "../src/lib/components/adminNavigation";

describe("admin navigation", () => {
	it("keeps the dashboard active only at the admin root", () => {
		expect(isAdminRouteActive("/admin", "/admin")).toBe(true);
		expect(isAdminRouteActive("/admin", "/admin/orders")).toBe(false);
	});

	it("matches a section and its descendants without matching lookalike paths", () => {
		expect(isAdminRouteActive("/admin/orders", "/admin/orders")).toBe(true);
		expect(isAdminRouteActive("/admin/orders", "/admin/orders/123")).toBe(true);
		expect(isAdminRouteActive("/admin/orders", "/admin/orders-archive")).toBe(false);
	});

	it("keeps creator-only destinations and notification keys explicit", () => {
		expect(adminNavItems.filter((item) => item.creatorOnly).map((item) => item.href)).toEqual([
			"/admin/messages",
			"/admin/platform",
		]);
		expect(hrefToNotificationKey["/admin/invoicing"]).toBe("invoices");
	});
});
