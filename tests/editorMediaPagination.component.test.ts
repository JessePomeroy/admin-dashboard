import type { ConvexClient } from "convex/browser";
import { getFunctionName, type FunctionReference } from "convex/server";
import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import Harness from "./EditorMediaPaginationHarness.svelte";
import type { PortfolioMediaAsset, PortfolioMediaPage } from "../src/lib/portfolioEditor";

function asset(id: string, status: PortfolioMediaAsset["status"] = "ready"): PortfolioMediaAsset {
	return {
		_id: id, assetId: id, originalFilename: `${id}.jpg`, status, createdAt: 1,
		source: { contentType: "image/jpeg", sizeBytes: 10, width: 10, height: 10 },
		derivatives: { thumb: { key: id, width: 10, height: 10 }, card: { key: id, width: 10, height: 10 } },
	};
}

function page(assets: PortfolioMediaAsset[], continueCursor = ""): PortfolioMediaPage {
	return { page: assets, continueCursor, isDone: !continueCursor };
}

type Subscription = {
	name: string;
	args: { siteUrl: string; paginationOpts?: { numItems: number; maximumRowsRead: number; cursor: string | null; id: number }; ids?: string[] };
	result: (value: unknown) => void;
	error: (value: Error) => void;
	active: boolean;
};

// Keep the installed useQuery implementation real; substitute only its external client.
function queryClient() {
	const cache = new Map<string, unknown>();
	const subscriptions: Subscription[] = [];
	const key = (name: string, args: unknown) => JSON.stringify([name, args]);
	const client = {
		disabled: false, closed: false,
		client: { localQueryResult(name: string, args: unknown) {
			const value = cache.get(key(name, args));
			if (value instanceof Error) throw value;
			return value;
		} },
		onUpdate(ref: FunctionReference<"query">, args: Subscription["args"], result: Subscription["result"], error: Subscription["error"]) {
			const subscription = { name: getFunctionName(ref), args, result, error, active: true };
			subscriptions.push(subscription);
			return () => { subscription.active = false; };
		},
	};
	return {
		client: client as unknown as ConvexClient,
		subscriptions,
		latest(name = "media:list") {
			const subscription = subscriptions.findLast(entry => entry.name === name && entry.active);
			if (!subscription) throw new Error(`Missing active query: ${name}`);
			return subscription;
		},
		emit(subscription: Subscription, value: unknown) {
			cache.set(key(subscription.name, subscription.args), value);
			if (value instanceof Error) subscription.error(value);
			else subscription.result(value);
		},
	};
}

let component: ReturnType<typeof mount<typeof Harness>> | undefined;

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
});

async function render(includeAttachments = false) {
	const queries = queryClient();
	const choose = vi.fn();
	component = mount(Harness, { target: document.body, props: { client: queries.client, includeAttachments, onChoose: choose } });
	await tick();
	return { queries, choose, media: component.media };
}

function button(label: string) {
	const found = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
		.find(entry => entry.textContent?.trim() === label);
	if (!found) throw new Error(`Missing button: ${label}`);
	return found;
}

describe("editor media page navigation", () => {
	it("requests one page at a time, ignores a late old-page result, and chooses an older asset", async () => {
		const { queries, choose, media } = await render();
		const first = queries.latest();
		expect(first.args).toEqual({ siteUrl: "example.test", paginationOpts: { numItems: 100, maximumRowsRead: 100, cursor: null, id: 0 } });
		expect(document.body.textContent).toContain("Loading media");
		expect(button("next").disabled).toBe(true);
		queries.emit(first, page([asset("newest")], "older-cursor"));
		queries.emit(queries.latest("media:placed"), [asset("attached")]);
		await tick();
		expect(button("previous").disabled).toBe(true);
		media.pagination!.next(); media.pagination!.next();
		expect(media.pagination!.pageNumber).toBe(2);
		await tick();
		const second = queries.latest();
		expect(second.args.paginationOpts).toEqual({ numItems: 100, maximumRowsRead: 100, cursor: "older-cursor", id: 0 });
		expect(first.active).toBe(false);
		expect(queries.subscriptions.filter(entry => entry.name === "media:list" && entry.active)).toHaveLength(1);
		expect(media.ready).toEqual([]);
		first.result(page([asset("late-newest")], "wrong-cursor")); await tick();
		expect(media.ready).toEqual([]);
		expect(document.body.textContent).not.toContain("late-newest.jpg");
		queries.emit(second, page([asset("older")])); await tick();
		expect(button("next").disabled).toBe(true);
		expect(button("previous").disabled).toBe(false);
		button("add").click(); await tick();
		expect(choose).toHaveBeenCalledExactlyOnceWith(asset("older"));
		expect(button("added").disabled).toBe(true);
		expect(queries.latest("media:placed").args.ids).toEqual(["attached", "older"]);
		button("previous").click(); await tick();
		expect(queries.latest().args.paginationOpts?.cursor).toBeNull();
		expect(media.pagination!.pageNumber).toBe(1);
		expect(media.ready.map(entry => entry._id)).toEqual(["newest"]);
		expect(queries.subscriptions.filter(entry => entry.name === "media:list" && entry.active)).toHaveLength(1);
	});

	it("keeps next-page navigation available when a whole page is deleting", async () => {
		const { queries } = await render();
		queries.emit(queries.latest(), page([asset("deleting", "deleting")], "next-ready")); await tick();
		expect(document.body.textContent).toContain("No ready media on this page");
		expect(document.querySelectorAll("li")).toHaveLength(0);
		expect(button("next").disabled).toBe(false);
		button("next").click(); await tick();
		queries.emit(queries.latest(), page([asset("ready")])); await tick();
		expect(document.body.textContent).toContain("ready.jpg");
		expect(button("add").disabled).toBe(false);
	});

	it("retries a failed page without losing its cursor and can return to the previous page", async () => {
		const { queries, media } = await render();
		queries.emit(queries.latest(), page([asset("first")], "second")); await tick();
		button("next").click(); await tick();
		const failed = queries.latest();
		queries.emit(failed, new Error("unavailable")); await tick();
		expect(document.querySelector('[role="alert"]')?.textContent).toContain("Unable to load this media page");
		expect(document.body.textContent).not.toContain("No ready media");
		expect(button("previous").disabled).toBe(false);
		button("retry").click(); await tick();
		const retry = queries.latest();
		expect(retry.args.paginationOpts).toEqual({ numItems: 100, maximumRowsRead: 100, cursor: "second", id: 1 });
		expect(media.pagination!.pageNumber).toBe(2);
		queries.emit(retry, page([asset("recovered")])); await tick();
		failed.error(new Error("late error")); await tick();
		expect(document.querySelector('[role="alert"]')).toBeNull();
		expect(document.body.textContent).toContain("recovered.jpg");
		button("previous").click(); await tick();
		expect(queries.latest().args.paginationOpts).toEqual({ numItems: 100, maximumRowsRead: 100, cursor: null, id: 1 });
	});

	it("does not adopt incomplete split pages or automatically retry; explicit retry starts at the same cursor", async () => {
		const { queries, media } = await render();
		queries.emit(queries.latest(), page([asset("first")], "second")); await tick();
		button("next").click(); await tick();
		const split = { ...page([asset("incomplete")], "skips-unread-assets"), pageStatus: "SplitRequired" };
		queries.emit(queries.latest(), split); await tick();
		expect(media.ready).toEqual([]);
		expect(button("next").disabled).toBe(true);
		expect(button("previous").disabled).toBe(false);
		expect(document.querySelector('[role="alert"]')).not.toBeNull();
		const requestCount = queries.subscriptions.length;
		await tick(); await tick();
		expect(queries.subscriptions).toHaveLength(requestCount);
		button("retry").click(); await tick();
		expect(queries.latest().args.paginationOpts).toEqual({ numItems: 100, maximumRowsRead: 100, cursor: "second", id: 1 });
		queries.emit(queries.latest(), split); await tick();
		expect(queries.subscriptions).toHaveLength(requestCount + 1);
		expect(button("next").disabled).toBe(true);
		button("retry").click(); await tick();
		expect(queries.latest().args.paginationOpts?.id).toBe(2);
		queries.emit(queries.latest(), page([asset("safe-page")], "safe-next")); await tick();
		expect(media.ready.map(entry => entry._id)).toEqual(["safe-page"]);
		button("next").click(); await tick();
		expect(queries.latest().args.paginationOpts?.cursor).toBe("safe-next");
	});

	it("preserves attachment precedence and local uploads across pages and status updates", async () => {
		const { queries, media } = await render(true);
		queries.emit(queries.latest(), page([asset("duplicate"), asset("first")], "second"));
		queries.emit(queries.latest("media:placed"), [asset("attached"), asset("duplicate", "deleting")]);
		media.addUpload(asset("duplicate"));
		media.addUpload(asset("upload")); await tick();
		expect(media.ready.map(entry => entry._id)).toEqual(["upload", "first", "attached"]);
		expect(media.byId.get("duplicate")?.status).toBe("deleting");
		button("next").click(); await tick();
		queries.emit(queries.latest(), page([asset("older")])); await tick();
		expect(media.ready.map(entry => entry._id)).toEqual(["upload", "older", "attached"]);
		expect(media.byId.has("first")).toBe(false);
		expect(media.byId.get("duplicate")?.status).toBe("deleting");
		queries.emit(queries.latest(), page([asset("older", "deleting")])); await tick();
		expect(media.ready.map(entry => entry._id)).toEqual(["upload", "attached"]);
		media.resetUploads(); await tick();
		expect(media.byId.has("upload")).toBe(false);
		expect(media.byId.has("attached")).toBe(true);
		component!.setReferences(["replacement", "replacement"]); await tick();
		expect(queries.latest("media:placed").args.ids).toEqual(["replacement"]);
	});

	it("keeps keyboard focus inside the picker when paging disables the focused control", async () => {
		const opener = document.createElement("button");
		document.body.append(opener); opener.focus();
		const { queries } = await render();
		queries.emit(queries.latest(), page([asset("first")], "second")); await tick();
		const close = button("close");
		const next = button("next");
		expect(document.activeElement).toBe(close);
		close.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
		expect(document.activeElement).toBe(next);
		next.click(); await tick();
		expect(next.disabled).toBe(true);
		next.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
		expect(document.activeElement).toBe(close);
		close.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await tick();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(opener);
		await unmount(component!); component = undefined;
		expect(queries.subscriptions.every(entry => !entry.active)).toBe(true);
	});
});
