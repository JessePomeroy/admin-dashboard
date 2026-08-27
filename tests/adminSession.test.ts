import { describe, expect, it } from "vitest";
import {
	canRenderTenantAdmin,
	getTenantAdminLayoutData,
	getTenantAdminSessionState,
	isTenantAdminServerAuthorized,
	shouldHoldAdminShellForServerSession,
	shouldRefreshAdminServerSession,
} from "../src/lib/adminSession";

describe("getTenantAdminSessionState", () => {
	it("allows rendering when auth is disabled for a consumer", () => {
		const session = getTenantAdminSessionState({
			hasAuthClient: false,
			sessionPending: false,
			session: null,
			isCreator: false,
		});

		expect(session).toEqual({ status: "auth-disabled" });
		expect(canRenderTenantAdmin(session)).toBe(true);
	});

	it("normalizes pending auth or access checks to loading", () => {
		expect(
			getTenantAdminSessionState({
				hasAuthClient: true,
				sessionPending: true,
				session: null,
				isCreator: false,
			}),
		).toEqual({ status: "loading" });

		expect(
			getTenantAdminSessionState({
				hasAuthClient: true,
				sessionPending: false,
				session: { user: { email: "maggie@example.com" } },
				isCreator: false,
				accessCheckPending: true,
			}),
		).toEqual({ status: "loading" });
	});

	it("returns unauthenticated when there is no signed-in user", () => {
		const session = getTenantAdminSessionState({
			hasAuthClient: true,
			sessionPending: false,
			session: null,
			isCreator: false,
		});

		expect(session).toEqual({ status: "unauthenticated" });
		expect(canRenderTenantAdmin(session)).toBe(false);
	});

	it("denies a non-creator tenant admin when access is not authorized", () => {
		const session = getTenantAdminSessionState({
			hasAuthClient: true,
			sessionPending: false,
			session: { user: { email: "maggie@example.com" } },
			isCreator: false,
			accessAuthorized: false,
		});

		expect(session).toEqual({
			status: "unauthorized",
			email: "maggie@example.com",
		});
		expect(canRenderTenantAdmin(session)).toBe(false);
	});

	it("authorizes creator admins without a tenant access check", () => {
		expect(
			getTenantAdminSessionState({
				hasAuthClient: true,
				sessionPending: false,
				session: { user: { email: "jesse@example.com" } },
				isCreator: true,
			}),
		).toEqual({ status: "authorized", email: "jesse@example.com" });
	});

	it("authorizes non-creator admins after tenant access is confirmed", () => {
		const session = getTenantAdminSessionState({
			hasAuthClient: true,
			sessionPending: false,
			session: { user: { email: "maggie@example.com" } },
			isCreator: false,
			accessAuthorized: true,
		});

		expect(session).toEqual({ status: "authorized", email: "maggie@example.com" });
		expect(canRenderTenantAdmin(session)).toBe(true);
	});
});

describe("getTenantAdminLayoutData", () => {
	it("returns only the canonical admin session for authorized creator admins", () => {
		expect(
			getTenantAdminLayoutData({
				status: "authorized",
				email: "jesse@example.com",
				tier: "full",
				isCreator: true,
			}),
		).toEqual({
			adminSession: {
				status: "authorized",
				email: "jesse@example.com",
				tier: "full",
				isCreator: true,
			},
		});
	});

	it("returns unauthenticated defaults without exposing full-tier data", () => {
		expect(getTenantAdminLayoutData({ status: "unauthenticated" })).toEqual({
			adminSession: { status: "unauthenticated" },
		});
	});

	it("keeps unauthorized sessions normalized", () => {
		expect(
			getTenantAdminLayoutData({
				status: "unauthorized",
				email: "maggie@example.com",
			}),
		).toEqual({
			adminSession: { status: "unauthorized", email: "maggie@example.com" },
		});
	});
});

describe("isTenantAdminServerAuthorized", () => {
	it("treats only authorized server sessions as authenticated for Convex", () => {
		expect(
			isTenantAdminServerAuthorized({
				status: "authorized",
				email: "jesse@example.com",
				tier: "full",
				isCreator: true,
			}),
		).toBe(true);
		expect(isTenantAdminServerAuthorized({ status: "unauthenticated" })).toBe(
			false,
		);
		expect(
			isTenantAdminServerAuthorized({
				status: "unauthorized",
				email: "maggie@example.com",
			}),
		).toBe(false);
		expect(isTenantAdminServerAuthorized(undefined)).toBe(false);
	});
});

describe("admin server session recovery", () => {
	it("refreshes once when OAuth client auth exists before server auth catches up", () => {
		expect(
			shouldRefreshAdminServerSession({
				hasBrowser: true,
				hasAuthClient: true,
				sessionPending: false,
				sessionEmail: "thinkingofview@gmail.com",
				serverAuthorized: false,
				refreshAttempted: false,
				refreshInFlight: false,
			}),
		).toBe(true);
	});

	it("does not loop after a recovery refresh has already been attempted", () => {
		expect(
			shouldRefreshAdminServerSession({
				hasBrowser: true,
				hasAuthClient: true,
				sessionPending: false,
				sessionEmail: "thinkingofview@gmail.com",
				serverAuthorized: false,
				refreshAttempted: true,
				refreshInFlight: false,
			}),
		).toBe(false);
	});

	it("does not refresh before the client session has settled", () => {
		expect(
			shouldRefreshAdminServerSession({
				hasBrowser: true,
				hasAuthClient: true,
				sessionPending: true,
				sessionEmail: undefined,
				serverAuthorized: false,
				refreshAttempted: false,
				refreshInFlight: false,
			}),
		).toBe(false);
	});

	it("holds the admin shell while client auth is ahead of server auth", () => {
		expect(
			shouldHoldAdminShellForServerSession({
				hasAuthClient: true,
				sessionPending: false,
				sessionEmail: "thinkingofview@gmail.com",
				serverAuthorized: false,
			}),
		).toBe(true);
	});

	it("releases the admin shell once server auth is authoritative", () => {
		expect(
			shouldHoldAdminShellForServerSession({
				hasAuthClient: true,
				sessionPending: false,
				sessionEmail: "thinkingofview@gmail.com",
				serverAuthorized: true,
			}),
		).toBe(false);
	});
});
