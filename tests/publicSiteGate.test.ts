import { describe, expect, it, vi } from "vitest";
import type { Handle } from "@sveltejs/kit";
import { createPublicSiteGate } from "../src/lib/server/publicSiteGate";
function input(path: string, accept = "text/html", method = "GET", data = false) {
	const request = new Request(`https://tenant.example${path}`, { method, headers: { accept } });
	return {
		event: { url: new URL(request.url), request, isDataRequest: data },
		resolve: vi.fn(
			async () =>
				new Response("secret public content", {
					headers: { "Cache-Control": "public, max-age=3600" },
				}),
		),
	} as unknown as Parameters<Handle>[0];
}
describe("public-site offboarding gate", () => {
	it.each([
		"/",
		"/portfolio/old-slug",
		"/shop",
		"/sitemap.xml",
		"/api/contact",
		"/api/checkout",
		"/administrator",
		"/api/admin-other",
	])("blocks %s without invoking the site", async (path) => {
		const args = input(path);
		const response = await createPublicSiteGate({ isActive: async () => false })(args);
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain("secret public content");
		expect(args.resolve).not.toHaveBeenCalled();
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
	});
	it("does not reuse a successful availability result after offboarding", async () => {
		const isActive = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
		const gate = createPublicSiteGate({ isActive });
		const first = await gate(input("/"));
		expect(first.status).toBe(200);
		expect(first.headers.get("Cache-Control")).toBe("private, no-store");
		expect((await gate(input("/"))).status).toBe(503);
		expect(isActive).toHaveBeenCalledTimes(2);
	});
	it("fails closed during backend failures and uses JSON for data/API requests", async () => {
		const gate = createPublicSiteGate({
			isActive: async () => {
				throw new Error("private connection details");
			},
		});
		const response = await gate(input("/portfolio/__data.json", "text/html", "GET", true));
		expect(await response.json()).toEqual({
			error: "site_unavailable",
			message: "This website is unavailable.",
		});
		expect(await (await gate(input("/", "text/html", "HEAD"))).text()).toBe("");
	});
	it.each([
		"/admin",
		"/admin/editor/products",
		"/api/admin/mutation",
		"/api/auth/sign-in",
		"/_app/immutable/file.js",
		"/delivery/token",
		"/portal/token",
	])("preserves the explicit operational route %s", async (path) => {
		const isActive = vi.fn(async () => false);
		const response = await createPublicSiteGate({
			isActive,
			preservePaths: ["/delivery", "/portal"],
		})(input(path));
		expect(response.status).toBe(200);
		expect(isActive).not.toHaveBeenCalled();
	});
});
