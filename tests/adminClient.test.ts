import { makeFunctionReference } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	endpoint: undefined as string | undefined,
	transport: undefined as string | undefined,
	client: { mutation: vi.fn(), query: vi.fn(async () => "query-result") },
}));
vi.mock("convex-svelte", () => ({ useConvexClient: () => mocks.client }));
vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({ mutationEndpoint: mocks.endpoint, mutationTransport: mocks.transport }),
}));

const { useAdminClient } = await import("../src/lib/adminClient");
const mutationRef = makeFunctionReference<"mutation">("inquiries:updateStatus");
const queryRef = makeFunctionReference<"query">("inquiries:listPaginated");

afterEach(() => {
	mocks.endpoint = undefined;
	mocks.transport = undefined;
	mocks.client.mutation.mockClear();
	mocks.client.query.mockClear();
	vi.unstubAllGlobals();
});

describe("useAdminClient", () => {
	it("always sends mutations through the default HTTP proxy", async () => {
		const request = vi.fn(async () => Response.json({ result: "ok" }));
		vi.stubGlobal("fetch", request);
		await expect(useAdminClient().mutation(mutationRef, { id: "a" })).resolves.toBe("ok");
		expect(request).toHaveBeenCalledExactlyOnceWith("/api/admin/mutation", expect.objectContaining({
			method: "POST",
			body: JSON.stringify({ name: "inquiries:updateStatus", args: { id: "a" } }),
		}));
		expect(mocks.client.mutation).not.toHaveBeenCalled();
	});

	it("ignores a legacy transport value and honors the configured endpoint", async () => {
		mocks.transport = "websocket";
		mocks.endpoint = "/api/custom/mutation";
		const request = vi.fn(async () => Response.json({ result: null }));
		vi.stubGlobal("fetch", request);
		await useAdminClient().mutation(mutationRef, {});
		expect(request).toHaveBeenCalledWith("/api/custom/mutation", expect.anything());
		expect(mocks.client.mutation).not.toHaveBeenCalled();
	});

	it("passes queries through to the browser Convex client", async () => {
		const request = vi.fn();
		vi.stubGlobal("fetch", request);
		await expect(useAdminClient().query(queryRef, { siteUrl: "example.test" })).resolves.toBe("query-result");
		expect(mocks.client.query).toHaveBeenCalledExactlyOnceWith(queryRef, { siteUrl: "example.test" });
		expect(request).not.toHaveBeenCalled();
	});
});
