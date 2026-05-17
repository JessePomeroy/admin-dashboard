import { describe, expect, it } from "vitest";
import {
	canRenderTenantAdmin,
	getTenantAdminSessionState,
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
