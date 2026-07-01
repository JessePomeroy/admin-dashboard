import { error, json, type Cookies, type RequestHandler } from "@sveltejs/kit";
import { ConvexHttpClient } from "convex/browser";
import { cookiesFromRequest } from "./adminHost.js";

export type AdminAuthIdentity = {
	email: string | null;
	name: string | null;
	subject: string;
} & Record<string, unknown>;

export type AdminAuthTokenReader = (cookies: Cookies) => string | null | undefined;

export interface AdminAuthConvexClient {
	setAuth(token: string): void;
	query(ref: unknown, args: unknown): Promise<AdminAuthIdentity | null>;
}

export interface AdminAuthValidatorOptions {
	getToken: AdminAuthTokenReader;
	getConvexUrl: () => string | undefined;
	whoami: unknown;
	createClient?: (convexUrl: string) => AdminAuthConvexClient;
}

export interface AdminAuthValidator {
	requireAuth(cookies: Cookies): Promise<string>;
	requireAuthWithIdentity(cookies: Cookies): Promise<{
		token: string;
		identity: AdminAuthIdentity;
	}>;
	verifyRequest(request: Request): Promise<boolean>;
	getTokenFromRequest(request: Request): string | null;
}

export interface AdminTokenHandlerOptions {
	getToken: AdminAuthTokenReader;
}

export function createAdminAuthValidator(
	options: AdminAuthValidatorOptions,
): AdminAuthValidator {
	const createClient =
		options.createClient ??
		((convexUrl: string) => new ConvexHttpClient(convexUrl) as AdminAuthConvexClient);

	async function requireAuth(cookies: Cookies): Promise<string> {
		const { token } = await requireAuthWithIdentity(cookies);
		return token;
	}

	async function requireAuthWithIdentity(cookies: Cookies): Promise<{
		token: string;
		identity: AdminAuthIdentity;
	}> {
		const token = options.getToken(cookies);
		if (!token) {
			throw error(401, "Unauthorized");
		}

		const convexUrl = options.getConvexUrl();
		if (!convexUrl) {
			throw error(500, "Auth backend not configured");
		}

		const client = createClient(convexUrl);
		client.setAuth(token);

		try {
			const identity = await client.query(options.whoami, {});
			if (!identity) {
				throw error(401, "Unauthorized");
			}
			return { token, identity };
		} catch (err) {
			if (err && typeof err === "object" && "status" in err) throw err;
			throw error(401, "Unauthorized");
		}
	}

	async function verifyRequest(request: Request): Promise<boolean> {
		await requireAuth(cookiesFromRequest(request));
		return true;
	}

	function getTokenFromRequest(request: Request): string | null {
		return options.getToken(cookiesFromRequest(request)) ?? null;
	}

	return {
		requireAuth,
		requireAuthWithIdentity,
		verifyRequest,
		getTokenFromRequest,
	};
}

export function createAdminTokenHandler(
	options: AdminTokenHandlerOptions,
): RequestHandler {
	return async ({ cookies }) => {
		const token = options.getToken(cookies);
		if (!token) {
			return json({ error: "Unauthorized" }, { status: 401 });
		}
		return json({ token });
	};
}
