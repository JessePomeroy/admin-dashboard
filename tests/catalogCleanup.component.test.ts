import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, tick, unmount } from "svelte";
const fixture = vi.hoisted(() => ({ query: vi.fn(), config: {
	siteUrl: "tenant.example", api: { mediaAssets: { listForEditor: "web.list" }, catalogPrivateAssets: { listForCleanup: "private.list", listExpiredUploadsForCleanup: "expired.list", requestDeletion: "private.delete" } },
	editor: { products: { privateAssetDeleteEndpoint: "/api/admin/catalog-private-assets/delete", mediaDeleteEndpoint: "/api/admin/media/delete" } },
} }));
vi.mock("../src/lib/config", () => ({ getAdminConfig: () => fixture.config }));
vi.mock("../src/lib/adminClient", () => ({ useAdminClient: () => ({ query: fixture.query }) }));
import Cleanup from "../src/lib/pages/editor/CatalogPrivateCleanup.svelte";
let component: ReturnType<typeof mount>;
const pageOf = (page: object[]) => ({ page, isDone: true, continueCursor: "" });
async function settle() { await tick(); await new Promise((resolve) => setTimeout(resolve, 0)); flushSync(); }
beforeEach(() => {
	vi.clearAllMocks();
	fixture.query.mockImplementation(async (ref: string) => ref === "web.list"
		? pageOf([{ _id: "web1", originalFilename: "sample.webp", source: { sizeBytes: 100 }, status: "ready" }])
		: pageOf([{ id: "private1", kind: "print_source", filename: "master.jpg", sizeBytes: 200, status: "verified" }]));
	vi.stubGlobal("confirm", vi.fn(() => true));
	component = mount(Cleanup, { target: document.body });
});
afterEach(async () => { await unmount(component); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
describe("upload cleanup controls", () => {
	it("loads the selected file type and expired-upload query rather than the previous selection", async () => {
		await settle(); expect(document.body.textContent).toContain("sample.webp");
		const select = document.querySelector("select")!;
		select.value = "paid_digital_file"; select.dispatchEvent(new Event("change", { bubbles: true })); await settle();
		expect(fixture.query).toHaveBeenLastCalledWith("private.list", expect.objectContaining({ kind: "paid_digital_file" }));
		const expired = document.querySelector<HTMLInputElement>("input[type=checkbox]")!;
		expired.checked = true; expired.dispatchEvent(new Event("change", { bubbles: true })); await settle();
		expect(fixture.query).toHaveBeenLastCalledWith("expired.list", expect.objectContaining({ kind: "paid_digital_file" }));
	});
	it("does nothing when confirmation is canceled, and preserves the row after failure for retry", async () => {
		await settle(); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
		vi.mocked(confirm).mockReturnValueOnce(false);
		const remove = [...document.querySelectorAll("button")].find((button) => button.textContent === "delete file")!;
		remove.click(); await settle(); expect(fetchMock).not.toHaveBeenCalled();
		fetchMock.mockResolvedValueOnce(Response.json({ message: "still referenced" }, { status: 409 }));
		remove.click(); await settle(); expect(document.body.textContent).toContain("still referenced"); expect(document.body.textContent).toContain("sample.webp");
		fetchMock.mockResolvedValueOnce(Response.json({ deleted: true, id: "web1" }));
		remove.click(); await settle(); expect(document.body.textContent).not.toContain("sample.webp");
		expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/media/delete");
		expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
	});
	it("locks controls until deletion settles", async () => {
		await settle(); let finish!: (response: Response) => void;
		vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
		[...document.querySelectorAll("button")].find((button) => button.textContent === "delete file")!.click(); await settle();
		expect(document.querySelector("select")?.disabled).toBe(true);
		finish(Response.json({ deleted: true, id: "web1" })); await settle();
		expect(document.querySelector("select")?.disabled).toBe(false);
	});
});
