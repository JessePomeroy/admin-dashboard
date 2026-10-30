import { afterEach, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import Harness from "./GalleryDeliveryHarness.svelte";
import { queryClient } from "./controlledQueryClient";

const fixture = vi.hoisted(() => ({ legacy: false }));
vi.mock("../src/lib/config", async () => {
	const { galleryDeliveryFixtureConfig: config } = await import("./fixtures/gallery-delivery/config");
	return { getAdminConfig: () => ({ ...config, api: { galleryDelivery: { ...config.api.galleryDelivery,
		listBySitePaginated: fixture.legacy ? undefined : config.api.galleryDelivery.listBySitePaginated,
	} } }) };
});

const queryName = "galleries:listBySitePaginated";
function gallery(name: string, status = "published") {
	return { _id: name, _creationTime: 1, siteUrl: "example.test", clientId: "client-1", clientName: "Fictional client",
		name, slug: name, status, imageCount: 0, totalSizeBytes: 0, downloadEnabled: true, favoritesEnabled: false };
}
function page(rows: ReturnType<typeof gallery>[], continueCursor = "") { return { page: rows, continueCursor, isDone: !continueCursor }; }
function button(name: string) {
	const found = [...document.querySelectorAll("button")].find((entry) => entry.textContent?.trim() === name);
	if (!found) throw new Error(`Button not found: ${name}`);
	return found;
}
let component: ReturnType<typeof mount> | undefined;
async function render() {
	const queries = queryClient();
	component = mount(Harness, { target: document.body, props: { client: queries.client } });
	await tick();
	return queries;
}
afterEach(async () => { if (component) await unmount(component); component = undefined; fixture.legacy = false; document.body.replaceChildren(); });

it("navigates cursor pages and resets the cursor for server status filtering", async () => {
	const queries = await render();
	const first = queries.latest(queryName);
	expect(first.args).toEqual({ siteUrl: "example.test", paginationOpts: { numItems: 25, cursor: null, id: 0 } });
	queries.emit(first, page([gallery("newest")], "older")); await tick();
	button("next").click(); button("next").click(); await tick();
	const second = queries.latest(queryName);
	expect(second.args.paginationOpts?.cursor).toBe("older");
	expect(first.active).toBe(false);
	first.result(page([gallery("late-old-page")])); await tick();
	expect(document.body.textContent).not.toContain("late-old-page");
	queries.emit(second, page([gallery("oldest")])); await tick();
	expect(document.body.textContent).toContain("oldest");
	expect(button("next").disabled).toBe(true);
	button("previous").click(); await tick();
	expect(queries.latest(queryName).args.paginationOpts?.cursor).toBeNull();
	button("archived").click(); await tick();
	expect(queries.latest(queryName).args).toEqual({ siteUrl: "example.test", status: "archived", paginationOpts: { numItems: 25, cursor: null, id: 0 } });
	expect(button("previous").disabled).toBe(true);
	expect(document.body.textContent).not.toContain("oldest");
});

it("separates failures and split pages from empty results and retries the same cursor", async () => {
	const queries = await render();
	queries.emit(queries.latest(queryName), page([gallery("newest")], "older")); await tick();
	button("next").click(); await tick();
	queries.emit(queries.latest(queryName), new Error("temporary read failure")); await tick();
	expect(document.querySelector('[role="alert"]')?.textContent).toContain("could not load this gallery page");
	expect(document.body.textContent).not.toContain("no client galleries yet");
	button("retry").click(); await tick();
	expect(queries.latest(queryName).args.paginationOpts).toEqual({ numItems: 25, cursor: "older", id: 1 });
	queries.emit(queries.latest(queryName), { ...page([]), pageStatus: "SplitRequired" }); await tick();
	expect(document.querySelector('[role="alert"]')).not.toBeNull();
	button("retry").click(); await tick();
	queries.emit(queries.latest(queryName), page([])); await tick();
	expect(document.querySelector('[role="alert"]')).toBeNull();
	expect(document.body.textContent).toContain("no client galleries yet");
});

it("keeps the existing host contract usable without the pagination capability", async () => {
	fixture.legacy = true;
	const queries = await render();
	queries.emit(queries.latest("galleries:listBySite"), [gallery("published-example"), gallery("archived-example", "archived")]); await tick();
	expect(document.querySelector('[aria-label="gallery pages"]')).toBeNull();
	button("archived").click(); await tick();
	expect(document.body.textContent).toContain("archived-example");
	expect(document.body.textContent).not.toContain("published-example");
});
