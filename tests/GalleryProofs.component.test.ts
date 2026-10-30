import { mount, tick, unmount } from "svelte";
import { afterEach, expect, it, vi } from "vitest";
import Harness from "./GalleryProofsHarness.svelte";
import { queryClient } from "./controlledQueryClient";
vi.mock("../src/lib/config", async () => {
	const { getAdminConfig } = await import("./fixtures/connected-workflows/config");
	return { getAdminConfig };
});
let component: ReturnType<typeof mount> | undefined;
afterEach(async () => { if (component) await unmount(component); component = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); });
function button(label: string) { const found = [...document.querySelectorAll("button")].find((entry) => entry.textContent?.trim() === label); if (!found) throw new Error(`Missing ${label}`); return found; }
const proof = { _id: "proof-1", selectedCount: 2, submittedAt: 1, notes: "Final choices" };
const snapshot = { _id: "snapshot-1", filename: "portrait.jpg", editingNotes: "Keep the grain" };
async function render(onMutation?: Parameters<typeof queryClient>[0]) {
	const queries = queryClient(onMutation);
	component = mount(Harness, { target: document.body, props: { client: queries.client } });
	await tick();
	queries.emit(queries.latest("galleries:listProofs"), { page: [proof], isDone: true, continueCursor: "" }); await tick();
	queries.emit(queries.latest("galleries:getProofImages"), { page: [snapshot], isDone: false, continueCursor: "older-files" }); await tick();
	return queries;
}
it("pages retained selection files without showing the preceding page as current", async () => {
	const queries = await render();
	expect(document.body.textContent).toContain("Keep the grain");
	button("next files").click(); await tick();
	expect(queries.latest("galleries:getProofImages").args.paginationOpts?.cursor).toBe("older-files");
	expect(document.body.textContent).not.toContain("Keep the grain");
	queries.emit(queries.latest("galleries:getProofImages"), { page: [{ ...snapshot, _id: "snapshot-2", filename: "second.jpg" }], isDone: true, continueCursor: "" }); await tick();
	expect(button("next files").disabled).toBe(true);
});
it("reopens only after owner confirmation and retains the submitted notes", async () => {
	vi.stubGlobal("confirm", () => true);
	let called = false;
	const queries = await render((name, args) => { called = name === "galleries:reopenProof" && args.galleryId === "gallery-1" && args.submissionId === "proof-1"; });
	button("reopen selection").click(); await vi.waitFor(() => expect(called).toBe(true));
	queries.emit(queries.latest("galleries:listProofs"), { page: [{ ...proof, reopenedAt: 2 }], isDone: true, continueCursor: "" }); await tick();
	expect(document.body.textContent).toContain("previous submission");
	expect(document.body.textContent).toContain("Keep the grain");
	expect([...document.querySelectorAll("button")].some((entry) => entry.textContent === "reopen selection")).toBe(false);
});
