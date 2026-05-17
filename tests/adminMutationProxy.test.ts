import { describe, expect, it, vi } from "vitest";
import {
	createAdminMutationHandler,
	resolveConvexFunction,
} from "../src/lib/server/adminMutationProxy";

function makeRequest(body: string) {
	return new Request("https://example.com/api/admin/mutation", {
		method: "POST",
		body,
		headers: { "Content-Type": "application/json" },
	});
}

function makeCookies() {
	return {} as Parameters<ReturnType<typeof createAdminMutationHandler>>[0]["cookies"];
}

async function readJson(response: Response) {
	return {
		status: response.status,
		body: await response.json(),
	};
}

describe("resolveConvexFunction", () => {
	it("resolves module:function names", () => {
		const fn = {};
		expect(resolveConvexFunction({ kanban: { moveCard: fn } }, "kanban:moveCard"))
			.toBe(fn);
	});

	it("resolves nested path:function names", () => {
		const fn = {};
		expect(
			resolveConvexFunction(
				{ admin: { users: { update: fn } } },
				"admin/users:update",
			),
		).toBe(fn);
	});

	it("returns undefined for unknown functions", () => {
		expect(resolveConvexFunction({ kanban: {} }, "kanban:missing")).toBe(
			undefined,
		);
	});
});

describe("createAdminMutationHandler", () => {
	it("returns 400 for invalid JSON", async () => {
		const handler = createAdminMutationHandler({
			api: {},
			getConvexUrl: () => "https://convex.example",
			requireAuth: vi.fn(async () => "token"),
		});

		const response = await handler({
			request: makeRequest("{"),
			cookies: makeCookies(),
		} as Parameters<typeof handler>[0]);

		await expect(readJson(response as Response)).resolves.toEqual({
			status: 400,
			body: { error: "Invalid JSON body" },
		});
	});

	it("returns 400 for missing function name", async () => {
		const handler = createAdminMutationHandler({
			api: {},
			getConvexUrl: () => "https://convex.example",
			requireAuth: vi.fn(async () => "token"),
		});

		const response = await handler({
			request: makeRequest(JSON.stringify({ args: {} })),
			cookies: makeCookies(),
		} as Parameters<typeof handler>[0]);

		await expect(readJson(response as Response)).resolves.toEqual({
			status: 400,
			body: {
				error: "`name` must be a Convex function name like 'module:function'",
			},
		});
	});

	it("returns 400 for unknown mutation names", async () => {
		const handler = createAdminMutationHandler({
			api: { kanban: {} },
			getConvexUrl: () => "https://convex.example",
			requireAuth: vi.fn(async () => "token"),
		});

		const response = await handler({
			request: makeRequest(JSON.stringify({ name: "kanban:missing", args: {} })),
			cookies: makeCookies(),
		} as Parameters<typeof handler>[0]);

		await expect(readJson(response as Response)).resolves.toEqual({
			status: 400,
			body: { error: "Unknown mutation: kanban:missing" },
		});
	});

	it("lets auth failures propagate as a 401 response", async () => {
		const handler = createAdminMutationHandler({
			api: {},
			getConvexUrl: () => "https://convex.example",
			requireAuth: vi.fn(async () => {
				throw Object.assign(new Error("Unauthorized"), { status: 401 });
			}),
		});

		const response = await handler({
			request: makeRequest(JSON.stringify({ name: "kanban:moveCard", args: {} })),
			cookies: makeCookies(),
		} as Parameters<typeof handler>[0]);

		await expect(readJson(response as Response)).resolves.toEqual({
			status: 401,
			body: { error: "Unauthorized" },
		});
	});

	it("creates a fresh authenticated Convex client for each valid request", async () => {
		const fnRef = {};
		const mutation = vi.fn(async () => ({ ok: true }));
		const setAuth = vi.fn();
		const createClient = vi.fn(() => ({ setAuth, mutation }));
		const handler = createAdminMutationHandler({
			api: { kanban: { moveCard: fnRef } },
			getConvexUrl: () => "https://convex.example",
			requireAuth: vi.fn(async () => "token"),
			createClient,
		});

		const request = () =>
			handler({
				request: makeRequest(
					JSON.stringify({ name: "kanban:moveCard", args: { id: "123" } }),
				),
				cookies: makeCookies(),
			} as Parameters<typeof handler>[0]);

		const first = await request();
		const second = await request();

		expect(createClient).toHaveBeenCalledTimes(2);
		expect(createClient).toHaveBeenCalledWith("https://convex.example");
		expect(setAuth).toHaveBeenCalledTimes(2);
		expect(setAuth).toHaveBeenCalledWith("token");
		expect(mutation).toHaveBeenCalledTimes(2);
		expect(mutation).toHaveBeenCalledWith(fnRef, { id: "123" });
		expect(await readJson(first as Response)).toEqual({
			status: 200,
			body: { result: { ok: true } },
		});
		expect(await readJson(second as Response)).toEqual({
			status: 200,
			body: { result: { ok: true } },
		});
	});

	it("preserves Convex mutation error messages", async () => {
		const handler = createAdminMutationHandler({
			api: { kanban: { moveCard: {} } },
			getConvexUrl: () => "https://convex.example",
			requireAuth: vi.fn(async () => "token"),
			createClient: vi.fn(() => ({
				setAuth: vi.fn(),
				mutation: vi.fn(async () => {
					throw new Error("No site admin");
				}),
			})),
		});

		const response = await handler({
			request: makeRequest(JSON.stringify({ name: "kanban:moveCard", args: {} })),
			cookies: makeCookies(),
		} as Parameters<typeof handler>[0]);

		await expect(readJson(response as Response)).resolves.toEqual({
			status: 500,
			body: { error: "No site admin" },
		});
	});
});
