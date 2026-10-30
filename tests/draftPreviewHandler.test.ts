import { beforeEach, expect, it, vi } from "vitest";
import type { Cookies } from "@sveltejs/kit";
import { createDraftPreviewHandler, readDraftPreview } from "../src/lib/server/draftPreview";
const requireSiteAdmin = vi.fn();
const resolve = vi.fn();
const handler = createDraftPreviewHandler({ siteUrl: "tenant.test", requireSiteAdmin, resolve });
const cookies: Cookies = { get: () => undefined, getAll: () => [], set() {}, delete() {}, serialize: () => "" };
function event(body: string, origin = "https://tenant.test") {
	const url = new URL("https://tenant.test/api/admin/preview/about");
	return { url, cookies, params: { kind: "about" }, request: new Request(url, { method: "POST", headers: { origin }, body }) };
}
beforeEach(() => {
	vi.resetAllMocks();
	requireSiteAdmin.mockResolvedValue("synthetic-session");
	resolve.mockResolvedValue({ kind: "about", revisionId: "revision-1", path: "/about" });
});
it("authorizes current membership before resolving a revision and issuing an uncached preview", async () => {
	const response = await handler(event('{"draftRevisionId":"revision-1"}'));
	expect(response.status).toBe(200);
	expect(requireSiteAdmin).toHaveBeenCalledWith(cookies);
	expect(resolve).toHaveBeenCalledWith("about", { draftRevisionId: "revision-1" }, "synthetic-session");
	expect(response.headers.get("cache-control")).toBe("private, no-store");
	const result = await response.json();
	expect(await readDraftPreview(new URL(result.previewUrl, "https://tenant.test"), "tenant.test", "synthetic-session")).toMatchObject({ kind: "about", revisionId: "revision-1" });
});
it("rejects cross-origin requests and failed membership before reading drafts", async () => {
	expect((await handler(event('{"draftRevisionId":"revision-1"}', "https://foreign.test"))).status).toBe(403);
	expect(requireSiteAdmin).not.toHaveBeenCalled();
	requireSiteAdmin.mockRejectedValue(new Error("Not authorized"));
	await expect(handler(event('{"draftRevisionId":"revision-1"}'))).rejects.toThrow("Not authorized");
	expect(resolve).not.toHaveBeenCalled();
});
it("rejects tenant injection, oversized bodies and a stale resolved revision", async () => {
	for (const body of ['{"draftRevisionId":"revision-1","siteUrl":"foreign.test"}', "x".repeat(4097)]) {
		expect((await handler(event(body))).status).toBe(409);
	}
	expect(resolve).not.toHaveBeenCalled();
	resolve.mockResolvedValue({ kind: "about", revisionId: "revision-2", path: "/about" });
	expect((await handler(event('{"draftRevisionId":"revision-1"}'))).status).toBe(409);
});
