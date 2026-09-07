import { mount, tick, unmount } from "svelte";
import { getFunctionName } from "convex/server";
import { expect, it, vi } from "vitest";
import Harness from "./EditorMediaHarness.svelte";
import type { PortfolioMediaAsset } from "../src/lib/portfolioEditor";

const mocks = vi.hoisted(() => ({
	queries: [] as Array<{ name: string; args: unknown }>,
	placed: [] as PortfolioMediaAsset[],
}));
vi.mock("convex-svelte", () => ({ useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
	const name = getFunctionName(ref);
	mocks.queries.push({ name, args });
	return { get data() { return name === "media:list" ? { page: [asset("library")], isDone: false } : mocks.placed; } };
} }));
function asset(id: string, status: PortfolioMediaAsset["status"] = "ready"): PortfolioMediaAsset {
	return { _id: id, assetId: id, originalFilename: id + ".jpg", status, createdAt: 1,
		source: { contentType: "image/jpeg", sizeBytes: 10, width: 10, height: 10 },
		derivatives: { thumb: { key: id, width: 10, height: 10 }, card: { key: id, width: 10, height: 10 } } };
}

it("preserves picker scope, merge precedence and per-editor upload lifetime", async () => {
	mocks.placed = [asset("placed"), asset("library", "deleting")];
	const page = mount(Harness, { target: document.body });
	try {
		await tick();
		page.library.addUpload(asset("upload"));
		page.attached.addUpload(asset("upload"));
		page.attached.addUpload({ ...asset("upload"), originalFilename: "replacement.jpg" });
		await tick();
		expect(page.library.ready.map(a => a._id)).toEqual(["library"]);
		expect(page.attached.ready.map(a => a._id)).toEqual(["upload", "placed"]);
		expect(page.attached.byId.get("upload")?.originalFilename).toBe("replacement.jpg");
		expect(page.attached.byId.get("library")?.status).toBe("deleting");
		expect(page.library.hasMore).toBe(true);
		page.attached.resetUploads(); await tick();
		expect(page.attached.byId.has("upload")).toBe(false);
		expect(page.library.byId.has("upload")).toBe(true);
		const placedArgs = mocks.queries.filter(q => q.name === "media:placed").map(q => q.args as () => unknown);
		for (const args of placedArgs) expect(args()).toEqual({ siteUrl: "example.test", ids: ["placed"] });
		page.setReferences(["new", "new"]); await tick();
		for (const args of placedArgs) expect(args()).toEqual({ siteUrl: "example.test", ids: ["new"] });
	} finally { await unmount(page); document.body.innerHTML = ""; }
});
