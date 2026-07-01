import { describe, expect, it, vi } from "vitest";
import {
	createAdminAuthValidator,
	createAdminTokenHandler,
} from "../src/lib/server/adminAuth";
import type { AdminAuthConvexClient } from "../src/lib/server";

function makeCookies() {
	return {} as Parameters<ReturnType<typeof createAdminTokenHandler>>[0]["cookies"];
}

function makeRequest(cookie?: string) {
	return new Request("https://example.com/admin", {
		headers: cookie ? { cookie } : undefined,
	});
}

async function readJson(response: Response) {
	return {
		status: response.status,
		body: await response.json(),
	};
}

function makeClient(identity: unknown = {
	email: "admin@example.com",
	name: "Admin",
	subject: "user-1",
}) {
	const setAuth = vi.fn();
	const query = vi.fn(async () => identity);
	return {
		client: { setAuth, query } as AdminAuthConvexClient,
		setAuth,
		query,
	};
}

describe("createAdminAuthValidator", () => {
	it("throws 401 when no token is present", async () => {
		const auth = createAdminAuthValidator({
			getToken: () => null,
			getConvexUrl: () => "https://convex.example",
			whoami: "adminAuth.whoami",
			createClient: vi.fn(() => makeClient().client),
		});

		await expect(auth.requireAuth(makeCookies())).rejects.toMatchObject({
			status: 401,
		});
	});

	it("throws 500 when the Convex URL is missing", async () => {
		const auth = createAdminAuthValidator({
			getToken: () => "token",
			getConvexUrl: () => undefined,
			whoami: "adminAuth.whoami",
			createClient: vi.fn(() => makeClient().client),
		});

		await expect(auth.requireAuth(makeCookies())).rejects.toMatchObject({
			status: 500,
		});
	});

	it("throws 401 when Convex rejects the token", async () => {
		const auth = createAdminAuthValidator({
			getToken: () => "token",
			getConvexUrl: () => "https://convex.example",
			whoami: "adminAuth.whoami",
			createClient: vi.fn(() => makeClient(null).client),
		});

		await expect(auth.requireAuth(makeCookies())).rejects.toMatchObject({
			status: 401,
		});
	});

	it("fails closed with 401 when the Convex query throws", async () => {
		const client = {
			setAuth: vi.fn(),
			query: vi.fn(async () => {
				throw new Error("network failed");
			}),
		};
		const auth = createAdminAuthValidator({
			getToken: () => "token",
			getConvexUrl: () => "https://convex.example",
			whoami: "adminAuth.whoami",
			createClient: vi.fn(() => client),
		});

		await expect(auth.requireAuth(makeCookies())).rejects.toMatchObject({
			status: 401,
		});
	});

	it("returns the validated token and identity", async () => {
		const identity = {
			email: "admin@example.com",
			name: "Admin",
			subject: "user-1",
		};
		const { client, setAuth, query } = makeClient(identity);
		const createClient = vi.fn(() => client);
		const auth = createAdminAuthValidator({
			getToken: () => "token",
			getConvexUrl: () => "https://convex.example",
			whoami: "adminAuth.whoami",
			createClient,
		});

		await expect(auth.requireAuth(makeCookies())).resolves.toBe("token");
		await expect(auth.requireAuthWithIdentity(makeCookies())).resolves.toEqual({
			token: "token",
			identity,
		});
		expect(createClient).toHaveBeenCalledWith("https://convex.example");
		expect(setAuth).toHaveBeenCalledWith("token");
		expect(query).toHaveBeenCalledWith("adminAuth.whoami", {});
	});

	it("verifies a standard Request using read-only request cookies", async () => {
		const auth = createAdminAuthValidator({
			getToken: (cookies) => cookies.get("session"),
			getConvexUrl: () => "https://convex.example",
			whoami: "adminAuth.whoami",
			createClient: vi.fn(() => makeClient().client),
		});

		await expect(auth.verifyRequest(makeRequest("session=token"))).resolves.toBe(
			true,
		);
	});

	it("reads tokens directly from standard Requests", () => {
		const auth = createAdminAuthValidator({
			getToken: (cookies) => cookies.get("session"),
			getConvexUrl: () => "https://convex.example",
			whoami: "adminAuth.whoami",
			createClient: vi.fn(() => makeClient().client),
		});

		expect(auth.getTokenFromRequest(makeRequest("session=token"))).toBe("token");
		expect(auth.getTokenFromRequest(makeRequest())).toBeNull();
	});
});

describe("createAdminTokenHandler", () => {
	it("returns the token when present", async () => {
		const handler = createAdminTokenHandler({
			getToken: () => "token",
		});

		const response = await handler({
			cookies: makeCookies(),
		} as Parameters<typeof handler>[0]);

		await expect(readJson(response as Response)).resolves.toEqual({
			status: 200,
			body: { token: "token" },
		});
	});

	it("returns 401 when no token is present", async () => {
		const handler = createAdminTokenHandler({
			getToken: () => null,
		});

		const response = await handler({
			cookies: makeCookies(),
		} as Parameters<typeof handler>[0]);

		await expect(readJson(response as Response)).resolves.toEqual({
			status: 401,
			body: { error: "Unauthorized" },
		});
	});
});
