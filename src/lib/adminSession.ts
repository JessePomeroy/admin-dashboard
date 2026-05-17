import type { AdminAuthSession } from "./config";

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
