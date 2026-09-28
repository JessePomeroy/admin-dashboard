import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mount, unmount, tick, flushSync } from "svelte";
import ContentExport from "../src/lib/pages/dashboard/ContentExport.svelte";
let component: ReturnType<typeof mount>;
const fetcher = vi.fn();
async function settle() {
	await tick();
	await new Promise((resolve) => setTimeout(resolve, 0));
	flushSync();
}
beforeEach(() => {
	vi.stubGlobal("fetch", fetcher);
	URL.createObjectURL = vi.fn(() => "blob:verified-export");
	URL.revokeObjectURL = vi.fn();
	component = mount(ContentExport, {
		target: document.body,
		props: { endpoint: "/api/admin/content-export" },
	});
});
afterEach(async () => {
	await unmount(component);
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});
it("offers a deliberate download only after preparation succeeds", async () => {
	fetcher.mockResolvedValueOnce(
		new Response("zip", { headers: { "Content-Type": "application/zip" } }),
	);
	document.querySelector("button")!.click();
	await settle();
	expect(fetcher).toHaveBeenCalledWith(
		"/api/admin/content-export",
		expect.objectContaining({ method: "POST", credentials: "same-origin" }),
	);
	expect(document.querySelector("a")?.getAttribute("href")).toBe("blob:verified-export");
	expect(document.body.textContent).toContain("Your export is ready");
});
it("explains larger exports and does not create a download after failure", async () => {
	fetcher.mockResolvedValueOnce(new Response(null, { status: 413 }));
	document.querySelector("button")!.click();
	await settle();
	expect(document.querySelector("a")).toBeNull();
	expect(document.body.textContent).toContain("Contact your hosting provider");
});
it("cancels preparation without presenting an error or download", async () => {
	fetcher.mockImplementationOnce(
		(_url, options) =>
			new Promise((_resolve, reject) =>
				options.signal.addEventListener("abort", () => reject(new Error("aborted"))),
			),
	);
	document.querySelector("button")!.click();
	await settle();
	[...document.querySelectorAll("button")]
		.find((button) => button.textContent === "cancel")!
		.click();
	await settle();
	expect(document.querySelector("a")).toBeNull();
	expect(document.body.textContent).not.toContain("aborted");
	expect(document.querySelector("button")?.disabled).toBe(false);
});
