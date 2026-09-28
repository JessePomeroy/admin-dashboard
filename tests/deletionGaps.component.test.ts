import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mount, unmount, tick, flushSync } from "svelte";
const f = vi.hoisted(() => ({
	mutation: vi.fn(),
	query: vi.fn(),
	state: {
		siteUrl: "tenant.example",
		isCreator: false,
		offboarding: { retainUntil: 2000000000000 },
	},
	api: {
		contentCleanup: {
			list: "list",
			listRevisions: "revisions",
			purgeArchived: "purge",
			pruneRevision: "prune",
		},
		platformOffboarding: {
			getState: "state",
			disable: "disable",
			requestErasure: "request",
			restoreAccess: "restore",
			eraseRecords: "erase",
		},
	},
}));
vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({ siteUrl: "tenant.example", api: f.api }),
}));
vi.mock("../src/lib/adminClient", () => ({
	useAdminClient: () => ({ mutation: f.mutation, query: f.query }),
}));
vi.mock("convex-svelte", () => ({ useQuery: () => ({ data: f.state }) }));
import ContentCleanup from "../src/lib/pages/editor/ContentCleanup.svelte";
import ClientOffboarding from "../src/lib/pages/platform/ClientOffboarding.svelte";
let component: ReturnType<typeof mount>;
async function settle() {
	await tick();
	await new Promise((resolve) => setTimeout(resolve, 0));
	flushSync();
}
const button = (text: string) =>
	[...document.querySelectorAll("button")].find((node) => node.textContent?.includes(text))!;
beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal(
		"confirm",
		vi.fn(() => true),
	);
});
afterEach(async () => {
	await unmount(component);
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});
it("content cleanup confirms, protects active revisions, and retains rows on a rejected purge", async () => {
	f.query.mockImplementation(async (ref) =>
		ref === "list"
			? {
					page: [{ documentId: "d", slug: "archived-post", archivedAt: 1, updatedAt: 2 }],
					isDone: true,
				}
			: { page: [{ revisionId: "r", createdAt: 1, active: true }], isDone: true },
	);
	component = mount(ContentCleanup, { target: document.body });
	button("refresh").click();
	await settle();
	button("review revisions").click();
	await settle();
	expect(button("delete revision").disabled).toBe(true);
	vi.mocked(confirm).mockReturnValueOnce(false);
	button("permanently delete").click();
	await settle();
	expect(f.mutation).not.toHaveBeenCalled();
	f.mutation.mockRejectedValueOnce(new Error("Content retained"));
	button("permanently delete").click();
	await settle();
	expect(document.body.textContent).toContain("Content retained");
	expect(button("permanently delete")).toBeDefined();
	f.mutation.mockResolvedValueOnce({ deleted: true });
	button("permanently delete").click();
	await settle();
	expect(f.mutation).toHaveBeenLastCalledWith("purge", { documentId: "d", expectedUpdatedAt: 2 });
	expect(document.body.textContent).not.toContain("archived-post");
});
it("offboarding requires an exact site confirmation and explicit immediate-erasure choice", async () => {
	f.mutation.mockImplementation(async (ref) =>
		ref === "erase" ? { deleted: 1, retained: 1, isDone: true, cursor: "" } : {},
	);
	component = mount(ClientOffboarding, { target: document.body, props: { clientId: "client" } });
	await settle();
	expect(button("erase eligible").disabled).toBe(true);
	const input = document.querySelector<HTMLInputElement>('input:not([type="checkbox"])')!;
	input.value = "tenant.example";
	input.dispatchEvent(new Event("input", { bubbles: true }));
	await settle();
	const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
	expect(checkbox.checked).toBe(false);
	checkbox.checked = true;
	checkbox.dispatchEvent(new Event("change", { bubbles: true }));
	await settle();
	vi.mocked(confirm).mockReturnValueOnce(false);
	button("erase eligible").click();
	await settle();
	expect(f.mutation).not.toHaveBeenCalled();
	button("erase eligible").click();
	await settle();
	expect(f.mutation).toHaveBeenNthCalledWith(1, "request", {
		clientId: "client",
		confirmSiteUrl: "tenant.example",
		eraseImmediately: true,
	});
	expect(document.body.textContent).toContain(
		"7 eligible records deleted; 7 protected records retained",
	);
	expect(document.body.textContent).toContain("separate steps");
});
