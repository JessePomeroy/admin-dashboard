import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Harness from "./BlogMediaPaginationHarness.svelte";
import { queryClient } from "./controlledQueryClient";
import { mediaAsset, mediaPage, postEditorState } from "./fixtures/blog-media/data";
import type { PortfolioMediaPage } from "../src/lib/portfolioEditor";

vi.mock("../src/lib/config", async () => import("./fixtures/blog-media/config"));

let component: ReturnType<typeof mount> | undefined;

beforeEach(() => {
	const rect = new DOMRect(0, 0, 1, 1);
	window.scrollBy = vi.fn();
	Object.defineProperties(Range.prototype, {
		getClientRects: { configurable: true, value: () => [rect] },
		getBoundingClientRect: { configurable: true, value: () => rect },
	});
	history.replaceState(null, "", "/");
});

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
});

async function render(firstPage: PortfolioMediaPage | Error) {
	const mutation = vi.fn((name: string, _args: Record<string, unknown>) => {
		if (name !== "post:save") throw new Error(`Unexpected mutation: ${name}`);
		return { revisionId: "saved-revision" };
	});
	const queries = queryClient(mutation);
	component = mount(Harness, { target: document.body, props: { client: queries.client } });
	await tick();
	for (const subscription of [...queries.subscriptions]) {
		queries.emit(subscription, subscription.name === "post:state" ? postEditorState()
			: subscription.name === "media:list" ? firstPage
			: subscription.name === "media:placed" ? [mediaAsset("attached")]
			: []);
	}
	await tick();
	queries.emit(queries.latest("media:placed"), [mediaAsset("attached")]);
	await vi.waitFor(() => expect(document.querySelector('[role="textbox"]')).not.toBeNull());
	return { queries, mutation };
}

function button(label: string, root: ParentNode = document) {
	const found = Array.from(root.querySelectorAll<HTMLButtonElement>("button"))
		.find(entry => entry.textContent?.trim() === label);
	if (!found) throw new Error(`Missing button: ${label}`);
	return found;
}

function picker() {
	const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
	if (!dialog) throw new Error("Expected the media picker");
	return dialog;
}

async function openPicker() {
	button("add image").click();
	await tick();
	return picker();
}

async function editDraft() {
	const title = Array.from(document.querySelectorAll("label"))
		.find(label => label.textContent?.includes("post title"))?.querySelector("input");
	if (!title) throw new Error("Missing post title");
	title.value = "Unsaved title";
	title.dispatchEvent(new Event("input", { bubbles: true }));
	const alt = document.querySelector<HTMLInputElement>('input[aria-label="Image alt text"]');
	if (!alt) throw new Error("Missing linked image alt text");
	alt.value = "Unsaved alt";
	alt.dispatchEvent(new Event("change", { bubbles: true }));
	await tick();
}

describe("blog media-library pagination", () => {
	it.each(["Image alt text", "Image caption"])("preserves focused, uncommitted %s when a pending media page arrives", async (label) => {
		const { queries, mutation } = await render(mediaPage([mediaAsset("first")], "second"));
		await openPicker();
		button("next", picker()).click();
		await tick();
		const pending = queries.latest();
		button("close", picker()).click();
		await tick();
		const selector = `input[aria-label="${label}"]`;
		const input = document.querySelector<HTMLInputElement>(selector)!;
		input.focus();
		input.value = "Pending image text";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.setSelectionRange(7, 12);
		queries.emit(pending, mediaPage([mediaAsset("older")]));
		await tick();
		expect(document.querySelector(selector)).toBe(input);
		expect(document.activeElement).toBe(input);
		expect(input.value).toBe("Pending image text");
		expect([input.selectionStart, input.selectionEnd]).toEqual([7, 12]);
		expect(mutation).not.toHaveBeenCalled();
		input.dispatchEvent(new Event("change", { bubbles: true }));
		await tick();
		button("save draft").click();
		await tick();
		expect(mutation).toHaveBeenCalledWith("post:save", expect.objectContaining({
			draft: expect.objectContaining({ body: expect.objectContaining({ blocks: expect.arrayContaining([
				expect.objectContaining({ assetId: "attached", [label === "Image alt text" ? "altText" : "caption"]: "Pending image text" }),
			]) }) }),
		}));
	});

	it("inserts beyond the first 100 assets without remounting the body, losing undo history or dropping linked images", async () => {
		const firstAssets = Array.from({ length: 100 }, (_, index) => mediaAsset(`asset-${index + 1}`));
		const { queries, mutation } = await render(mediaPage(firstAssets, "older-cursor"));
		await editDraft();
		const editor = document.querySelector('[role="textbox"]');
		await openPicker();
		expect(picker().querySelectorAll("li")).toHaveLength(100);
		button("next", picker()).click();
		await tick();
		const second = queries.latest();
		expect(second.args).toEqual({ siteUrl: "example.test", paginationOpts: { numItems: 100, maximumRowsRead: 100, cursor: "older-cursor", id: 0 } });
		expect(picker().querySelectorAll("li")).toHaveLength(0);
		expect(button("next", picker()).disabled).toBe(true);
		queries.emit(second, mediaPage([mediaAsset("older-101")]));
		await tick();
		button("close", picker()).click();
		await tick();
		expect(document.querySelector('[role="textbox"]')).toBe(editor);
		expect(button("undo").disabled).toBe(false);
		button("undo").click();
		await tick();
		expect(document.querySelector<HTMLInputElement>('input[aria-label="Image alt text"]')?.value).toBe("Original alt");
		button("redo").click();
		await tick();
		await openPicker();
		expect(picker().textContent).toContain("page 2");
		button("add", picker()).click();
		await tick();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(queries.latest("media:placed").args.ids).toEqual(expect.arrayContaining(["attached", "older-101"]));
		queries.emit(queries.latest("media:placed"), [mediaAsset("attached"), mediaAsset("older-101")]);
		await tick();
		await openPicker();
		expect(picker().querySelectorAll("li")).toHaveLength(0);
		button("previous", picker()).click();
		await tick();
		expect(picker().querySelectorAll("li")).toHaveLength(100);
		button("close", picker()).click();
		await tick();
		expect(document.querySelector('[role="textbox"]')).toBe(editor);
		expect(editor?.querySelectorAll("figure")).toHaveLength(2);
		expect([...editor!.querySelectorAll("img")].map(image => image.src)).toEqual(expect.arrayContaining([
			"https://media.example.test/attached/card.jpg", "https://media.example.test/older-101/card.jpg",
		]));
		expect(mutation).not.toHaveBeenCalled();
		button("save draft").click();
		await tick();
		expect(mutation).toHaveBeenCalledExactlyOnceWith("post:save", expect.objectContaining({
			documentId: "post-1", expectedDraftRevisionId: "revision-1",
			draft: expect.objectContaining({
				title: "Unsaved title",
				body: expect.objectContaining({ blocks: expect.arrayContaining([
					expect.objectContaining({ key: "intro", children: [expect.objectContaining({ text: "Keep this draft." })] }),
					expect.objectContaining({ assetId: "attached", altText: "Unsaved alt", caption: "Original caption" }),
					expect.objectContaining({ assetId: "older-101" }),
				]) }),
			}),
		}));
	});

	it.each(["deleting", "already linked"])("can open and leave a first page containing only %s images", async (kind) => {
		const first = kind === "deleting" ? mediaAsset("deleting", "deleting") : mediaAsset("attached");
		const { queries } = await render(mediaPage([first], "older-cursor"));
		await openPicker();
		expect(picker().textContent).toContain("No ready media on this page");
		expect(picker().querySelectorAll("li")).toHaveLength(0);
		expect(button("next", picker()).disabled).toBe(false);
		button("next", picker()).click();
		await tick();
		queries.emit(queries.latest(), mediaPage([mediaAsset("older")]));
		await tick();
		expect(picker().textContent).toContain("older.jpg");
		expect(button("add", picker()).disabled).toBe(false);
	});

	it("opens retry controls after an initial library failure while retaining the editable draft", async () => {
		const { queries, mutation } = await render(new Error("private provider detail"));
		await editDraft();
		await openPicker();
		expect(picker().querySelector('[role="alert"]')?.textContent).toContain("Unable to load this media page");
		expect(document.body.textContent).not.toContain("private provider detail");
		expect(picker().querySelectorAll("li")).toHaveLength(0);
		button("retry", picker()).click();
		await tick();
		expect(queries.latest().args.paginationOpts).toEqual({ numItems: 100, maximumRowsRead: 100, cursor: null, id: 1 });
		queries.emit(queries.latest(), mediaPage([mediaAsset("recovered")]));
		await tick();
		expect(picker().textContent).toContain("recovered.jpg");
		button("close", picker()).click();
		await tick();
		expect(document.querySelector<HTMLInputElement>('input[aria-label="Image alt text"]')?.value).toBe("Unsaved alt");
		expect(button("save draft").disabled).toBe(false);
		expect(mutation).not.toHaveBeenCalled();
	});

	it("keeps a failed or split second page retryable without adopting stale rows or losing the draft", async () => {
		const { queries, mutation } = await render(mediaPage([mediaAsset("first")], "second"));
		await editDraft();
		await openPicker();
		const first = queries.latest();
		button("next", picker()).click();
		await tick();
		first.result(mediaPage([mediaAsset("late-first")], "wrong-cursor"));
		await tick();
		expect(picker().textContent).not.toContain("late-first.jpg");
		const failed = queries.latest();
		queries.emit(failed, new Error("second page unavailable"));
		await tick();
		expect(picker().textContent).toContain("page 2");
		expect(button("previous", picker()).disabled).toBe(false);
		button("retry", picker()).click();
		await tick();
		expect(queries.latest().args.paginationOpts).toMatchObject({ cursor: "second", id: 1 });
		queries.emit(queries.latest(), { ...mediaPage([mediaAsset("incomplete")], "unsafe-continuation"), pageStatus: "SplitRequired" });
		await tick();
		expect(picker().querySelectorAll("li")).toHaveLength(0);
		expect(button("next", picker()).disabled).toBe(true);
		button("retry", picker()).click();
		await tick();
		expect(queries.latest().args.paginationOpts).toMatchObject({ cursor: "second", id: 2 });
		queries.emit(queries.latest(), mediaPage([mediaAsset("recovered")]));
		await tick();
		failed.error(new Error("late failed request"));
		await tick();
		expect(picker().querySelector('[role="alert"]')).toBeNull();
		expect(picker().textContent).toContain("recovered.jpg");
		expect(queries.subscriptions.filter(entry => entry.name === "media:list" && entry.active)).toHaveLength(1);
		button("close", picker()).click();
		await tick();
		expect(document.querySelector<HTMLInputElement>('input[aria-label="Image alt text"]')?.value).toBe("Unsaved alt");
		expect(mutation).not.toHaveBeenCalled();
		await unmount(component!);
		component = undefined;
		expect(queries.subscriptions.every(entry => !entry.active)).toBe(true);
	});
});
