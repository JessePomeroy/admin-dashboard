import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import InquiryWorkflow from "../src/lib/pages/inquiries/InquiryWorkflow.svelte";

const mocks = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }));
vi.mock("../src/lib/adminClient", () => ({ useAdminClient: () => mocks }));
vi.mock("../src/lib/config", () => ({ getAdminConfig: () => ({ siteUrl: "tenant.test", isCreator: false, api: { inquiries: { getWorkflow: "workflow", clientOptions: "options", linkClient: "link", updateFollowUp: "followUp" } } }) }));
let component: ReturnType<typeof mount> | undefined;
const inquiry = { _id: "inquiry-1", _creationTime: 1, siteUrl: "tenant.test", name: "Visitor", email: "visitor@test.example", message: "Portraits", status: "new", internalNotes: "Remember the location" };
beforeEach(() => {
	vi.resetAllMocks();
	mocks.query.mockImplementation(async (ref) => ref === "workflow" ? { inquiry, client: null } : { page: [{ _id: "client-1", name: "Returning client", email: "returning@test.example" }], isDone: false, continueCursor: "older" });
	mocks.mutation.mockResolvedValue("client-1");
});
afterEach(async () => { if (component) await unmount(component); component = undefined; document.body.replaceChildren(); });
async function render() { component = mount(InquiryWorkflow, { target: document.body, props: { id: "inquiry-1", onchange: vi.fn() } }); await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull()); }
function button(label: string) { const found = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === label); if (!found) throw new Error(`Missing ${label}`); return found; }
it("links a chosen existing client and can reach older client choices", async () => {
	await render();
	const select = document.querySelector("select")!;
	select.value = "client-1"; select.dispatchEvent(new Event("change", { bubbles: true })); await tick();
	button("link client").click();
	await vi.waitFor(() => expect(mocks.mutation).toHaveBeenCalledWith("link", { id: "inquiry-1", category: "photography", clientId: "client-1" }));
	await vi.waitFor(() => expect(button("next clients").disabled).toBe(false));
	button("next clients").click();
	await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledWith("options", { id: "inquiry-1", paginationOpts: { cursor: "older", numItems: 25 } }));
});
it("keeps private notes after a failed save and retries the same follow-up", async () => {
	await render();
	const notes = document.querySelector("textarea")!;
	notes.value = "Send the estimate"; notes.dispatchEvent(new Event("input", { bubbles: true }));
	const date = document.querySelector<HTMLInputElement>('input[type="date"]')!;
	date.value = "2026-11-03"; date.dispatchEvent(new Event("input", { bubbles: true })); await tick();
	mocks.mutation.mockRejectedValueOnce(new Error("offline"));
	button("save follow-up").click();
	await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain("your changes are still here"));
	expect(notes.value).toBe("Send the estimate");
	button("save follow-up").click();
	await vi.waitFor(() => expect(mocks.mutation).toHaveBeenLastCalledWith("followUp", { id: "inquiry-1", date: "2026-11-03", notes: "Send the estimate", completed: false }));
});
it("creates a photography lead explicitly and displays the returned client link", async () => {
	await render();
	mocks.query.mockImplementation(async (ref) => ref === "workflow" ? { inquiry: { ...inquiry, clientId: "client-1" }, client: { _id: "client-1", name: "Visitor" } } : { page: [], isDone: true, continueCursor: "" });
	button("create lead from inquiry").click();
	await vi.waitFor(() => expect(document.querySelector("a")?.getAttribute("href")).toBe("/admin/crm?client=client-1"));
	expect(mocks.mutation).toHaveBeenCalledWith("link", { id: "inquiry-1", category: "photography" });
});
