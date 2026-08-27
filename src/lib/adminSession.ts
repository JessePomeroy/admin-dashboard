import type { AdminAuthSession } from "./config";
import type { Tier } from "./features";

export type TenantAdminSessionState =
	| { status: "auth-disabled" }
	| { status: "loading" }
	| { status: "unauthenticated" }
	| { status: "unauthorized"; email: string }
	| { status: "authorized"; email: string };

export interface TenantAdminSessionInput {
	hasAuthClient: boolean;
	sessionPending: boolean;
	session: AdminAuthSession | null;
	isCreator: boolean;
	accessCheckPending?: boolean;
	accessAuthorized?: boolean;
}

export function getTenantAdminSessionState(
	input: TenantAdminSessionInput,
): TenantAdminSessionState {
	if (!input.hasAuthClient) {
		return { status: "auth-disabled" };
	}

	if (input.sessionPending || input.accessCheckPending) {
		return { status: "loading" };
	}

	const email = input.session?.user.email;
	if (!email) {
		return { status: "unauthenticated" };
	}

	if (!input.isCreator && input.accessAuthorized !== true) {
		return { status: "unauthorized", email };
	}

	return { status: "authorized", email };
}

export function canRenderTenantAdmin(session: TenantAdminSessionState): boolean {
	return session.status === "auth-disabled" || session.status === "authorized";
}

export type TenantAdminServerSession =
	| { status: "unauthenticated" }
	| { status: "unauthorized"; email: string }
	| { status: "authorized"; email: string | null; tier: Tier; isCreator: boolean };

export function isTenantAdminServerAuthorized(
	session: TenantAdminServerSession | undefined,
): boolean {
	return session?.status === "authorized";
}

export interface AdminServerSessionRecoveryInput {
	hasBrowser: boolean;
	hasAuthClient: boolean;
	sessionPending: boolean;
	sessionEmail: string | null | undefined;
	serverAuthorized: boolean;
	refreshAttempted: boolean;
	refreshInFlight: boolean;
}

function hasSettledClientSession(input: AdminServerSessionRecoveryInput): boolean {
	return input.hasAuthClient && !input.sessionPending && Boolean(input.sessionEmail);
}

export function shouldRefreshAdminServerSession(input: AdminServerSessionRecoveryInput): boolean {
	return (
		input.hasBrowser &&
		hasSettledClientSession(input) &&
		!input.serverAuthorized &&
		!input.refreshAttempted &&
		!input.refreshInFlight
	);
}

export function shouldHoldAdminShellForServerSession(
	input: Pick<
		AdminServerSessionRecoveryInput,
		"hasAuthClient" | "sessionPending" | "sessionEmail" | "serverAuthorized"
	>,
): boolean {
	return (
		input.hasAuthClient &&
		!input.sessionPending &&
		Boolean(input.sessionEmail) &&
		!input.serverAuthorized
	);
}

export interface TenantAdminLayoutData {
	adminSession: TenantAdminServerSession;
}

export function getTenantAdminLayoutData(
	session: TenantAdminServerSession,
): TenantAdminLayoutData {
	return {
		adminSession: session,
	};
}
