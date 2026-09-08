import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostDraft, PostEditorState } from "../src/lib/blogEditor";
import Harness from "./BlogCompactHarness.svelte";
import { queryClient } from "./controlledQueryClient";
import { blogFixtureConfig } from "./fixtures/blog-media/config";
import { mediaAsset, mediaPage, postEditorState } from "./fixtures/blog-media/data";

vi.mock("../src/lib/config", async () => import("./fixtures/blog-media/config"));

let component: ReturnType<typeof mount> | undefined;

beforeEach(() => {
	blogFixtureConfig.editor!.blog!.mode = "compact";
	history.replaceState(null, "", "/");
	const rect = new DOMRect(0, 0, 1, 1);
	window.scrollBy = vi.fn();
	Object.defineProperties(Range.prototype, {
		getClientRects: { configurable: true, value: () => [rect] },
		getBoundingClientRect: { configurable: true, value: () => rect },
	});
});

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	delete blogFixtureConfig.editor!.blog!.mode;
	document.body.replaceChildren();
});

async function render(state: PostEditorState = postEditorState(), overview = false) {
	const mutation = vi.fn((name: string, _args: Record<string, unknown>): unknown => {
		if (name === "post:create") return { documentId: "created" };
		if (name === "post:save") return { revisionId: "saved" };
		if (name === "post:publish") return null;
		throw new Error(`Unexpected mutation: ${name}`);
	});
	const queries = queryClient(mutation);
	component = mount(Harness, { target: document.body, props: { client: queries.client, overview } });
	await tick();
	for (const query of [...queries.subscriptions]) {
		queries.emit(query, query.name === "post:state" ? state : query.name === "media:list" ? mediaPage([])
			: query.name === "media:placed" ? [mediaAsset("attached")] : []);
	}
	await tick();
	if (!overview) {
		queries.emit(queries.latest("media:placed"), [mediaAsset("attached")]);
		await vi.waitFor(() => expect(document.querySelector('[role="textbox"]')).not.toBeNull());
	}
	return { queries, mutation };
}

function button(text: string) {
	const node = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === text);
	if (!node) throw new Error(`Missing button: ${text}`);
	return node;
}

function field(text: string) {
	const label = [...document.querySelectorAll("label")].find(label => label.textContent?.trim() === text);
	if (!label) throw new Error(`Missing field: ${text}`);
	const input = label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector("input,textarea");
	if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) throw new Error(`Missing input: ${text}`);
	return input;
}

async function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
	input.value = value;
	input.dispatchEvent(new Event("input", { bubbles: true }));
	await tick();
}

describe("compact blog authoring", () => {
	it.each([false, true])("refreshes automatic excerpts after failed publication, including reload=%s", async (reload) => {
		let { queries, mutation } = await render();
		mutation.mockImplementation((name) => {
			if (name === "post:save") return { revisionId: "saved" };
			throw new Error("Publish Site Settings before publishing");
		});
		button("publish").click();
		await tick();
		await tick();
		await vi.waitFor(() => expect(document.body.textContent).toContain("Publish Site Settings before publishing"));
		const saved = mutation.mock.calls.find(([name]) => name === "post:save")![1].draft as PostDraft;
		expect(saved.summary).toBe("Keep this draft.");
		const state = postEditorState();
		state.draft = { ...state.draft!, revisionId: "saved", draft: saved };
		if (reload) {
			await unmount(component!);
			component = undefined;
			document.body.replaceChildren();
			({ queries, mutation } = await render(state));
		} else {
			queries.emit(queries.latest("post:state"), state);
			await tick();
			mutation.mockImplementation(name => name === "post:save" ? { revisionId: "saved" } : null);
		}
		const editor = document.querySelector<HTMLElement>('[role="textbox"]')!;
		editor.focus();
		const paste = new Event("paste", { bubbles: true, cancelable: true });
		Object.defineProperty(paste, "clipboardData", { value: { getData: () => "New opening after failure. " } });
		editor.dispatchEvent(paste);
		await tick();
		button("publish").click();
		await tick();
		await tick();
		const retryDraft = mutation.mock.calls.filter(([name]) => name === "post:save").at(-1)![1].draft as PostDraft;
		expect(retryDraft.summary).toContain("New opening after failure.");
		expect(retryDraft).toMatchObject({ summarySource: "body" });
		expect(mutation.mock.calls.at(-1)?.[0]).toBe("post:publish");
	});

	it("turns an explicit full-mode summary edit into preserved custom metadata", async () => {
		delete blogFixtureConfig.editor!.blog!.mode;
		const state = postEditorState();
		Object.assign(state.draft!.draft, { authorSource: "siteSettings", summarySource: "body", summary: "Generated excerpt" });
		const { mutation } = await render(state);
		const summary = document.querySelector('#identity-heading')!.closest("section")!.querySelector("textarea")!;
		await type(summary, "A deliberate custom excerpt");
		button("publish").click();
		await tick();
		await tick();
		expect(mutation.mock.calls[0][1].draft).toMatchObject({ summary: "A deliberate custom excerpt" });
		expect(mutation.mock.calls[0][1].draft).not.toHaveProperty("summarySource");
	});

	it("hides metadata and supporting controls but keeps SEO and explicit slug generation", async () => {
		const { queries, mutation } = await render();
		expect(document.querySelector('#structure-heading')).toBeNull();
		expect(document.querySelector('#references-heading')).toBeNull();
		expect(document.querySelector('input[type="date"]')).toBeNull();
		expect([...document.querySelectorAll("label")].some(label => label.textContent?.trim().startsWith("summary"))).toBe(false);
		expect(document.querySelector('#seo-heading')).not.toBeNull();
		expect(document.querySelectorAll('[aria-label="Blog collections"] a')).toHaveLength(1);
		expect(queries.subscriptions.some(query => query.name === "blog:list")).toBe(false);
		await type(field("URL name"), "my-custom-url");
		await type(field("post title"), "A Different Title");
		field("post title").dispatchEvent(new Event("blur"));
		await tick();
		expect(field("URL name").value).toBe("my-custom-url");
		button("generate url").click();
		await tick();
		expect(field("URL name").value).toBe("a-different-title");
		await type(field("post title"), "  ");
		expect(button("generate url").disabled).toBe(true);
		expect(mutation).not.toHaveBeenCalled();
	});

	it("fills only missing owner metadata and generates the excerpt from the latest body at publish", async () => {
		const { queries, mutation } = await render();
		await type(field("post title"), "Updated draft");
		button("save draft").click();
		await tick();
		const first = mutation.mock.calls[0][1].draft as PostDraft;
		expect(first).toMatchObject({ authorSource: "siteSettings", summary: "", format: "essay", presentation: "standard" });
		expect(first.authorDocumentId).toBeUndefined();
		const savedState = postEditorState();
		savedState.draft!.revisionId = "saved";
		savedState.draft!.draft = first;
		queries.emit(queries.latest("post:state"), savedState);
		await tick();
		const editor = document.querySelector<HTMLElement>('[role="textbox"]')!;
		editor.focus();
		const paste = new Event("paste", { bubbles: true, cancelable: true });
		Object.defineProperty(paste, "clipboardData", { value: { getData: () => "New opening. " } });
		editor.dispatchEvent(paste);
		await tick();
		button("publish").click();
		await tick();
		await tick();
		const saved = mutation.mock.calls.filter(([name]) => name === "post:save").at(-1)?.[1].draft as PostDraft;
		expect(saved.summary).toContain("New opening.");
		expect(saved.summary).toContain("Keep this draft.");
		expect(mutation).toHaveBeenCalledWith("post:publish", { documentId: "post-1", draftRevisionId: "saved" });
	});

	it("preserves existing hidden metadata and SEO in save and publish payloads", async () => {
		const state = postEditorState();
		Object.assign(state.draft!.draft, { summary: "Custom excerpt", displayPublishedAt: 12, format: "technicalNote", presentation: "technical", authorDocumentId: "legacy-author", categories: [{ key: "category", documentId: "legacy-category" }], equipment: [{ key: "camera", label: "Camera" }], seoTitle: "Custom search title", seoDescription: "Custom search description" });
		const { mutation } = await render(state);
		await type(field("post title"), "Updated title");
		button("publish").click();
		await tick();
		await tick();
		expect(mutation.mock.calls[0][1].draft).toMatchObject({ ...state.draft!.draft, title: "Updated title" });
		expect(mutation.mock.calls[0][1].draft).not.toHaveProperty("authorSource");
		expect(mutation.mock.calls.map(([name]) => name)).toEqual(["post:save", "post:publish"]);
	});

	it("retains public URL confirmation and disables generation for archived posts", async () => {
		const state = postEditorState();
		state.published = { ...state.draft!, revisionId: "published", draft: { ...state.draft!.draft, summary: "Existing summary", authorDocumentId: "author" } };
		state.draft!.draft = { ...state.published.draft };
		const { queries, mutation } = await render(state);
		await type(field("post title"), "New public title");
		button("generate url").click();
		await tick();
		button("publish").click();
		await tick();
		expect(document.body.textContent).toContain("Confirm the public URL change");
		expect(mutation).not.toHaveBeenCalled();
		queries.emit(queries.latest("post:state"), { ...state, archivedAt: 1 });
		await tick();
		expect(button("generate url").disabled).toBe(true);
		expect(button("publish").disabled).toBe(true);
	});

	it("creates owner-authored posts without exposing author/category management or honoring old hashes", async () => {
		history.replaceState(null, "", "/admin/editor/blog#authors");
		const { queries, mutation } = await render(undefined, true);
		expect(document.querySelector('#supporting-content')).toBeNull();
		expect(document.querySelector('.supporting-view')).toBeNull();
		expect(queries.subscriptions.some(query => query.name === "blog:list")).toBe(false);
		button("new post").click();
		await tick();
		expect(mutation).toHaveBeenCalledWith("post:create", expect.objectContaining({ draft: expect.objectContaining({ authorSource: "siteSettings", format: "essay", presentation: "standard" }) }));
	});

	it("leaves full-mode metadata controls available by default", async () => {
		delete blogFixtureConfig.editor!.blog!.mode;
		await render();
		expect(document.querySelector('#structure-heading')).not.toBeNull();
		expect(document.querySelector('#references-heading')).not.toBeNull();
		expect(document.querySelector('input[type="date"]')).not.toBeNull();
		expect(button("generate url")).toBeDefined();
	});

	it("can replace a retained Site Settings author with an explicit author in full mode", async () => {
		delete blogFixtureConfig.editor!.blog!.mode;
		const state = postEditorState();
		Object.assign(state.draft!.draft, { authorSource: "siteSettings", summary: "Owner summary" });
		const { queries, mutation } = await render(state);
		const authorQuery = queries.subscriptions.find(query => query.name === "blog:list" && query.args.kind === "author")!;
		queries.emit(authorQuery, [{ documentId: "explicit-author", kind: "author", label: "Explicit Author", publishedRevisionId: "author-published" }]);
		await tick();
		const select = document.querySelector<HTMLSelectElement>('#references-heading')?.closest("section")?.querySelector("select")!;
		select.value = "explicit-author";
		select.dispatchEvent(new Event("change", { bubbles: true }));
		await tick();
		button("publish").click();
		await tick();
		await tick();
		expect(mutation.mock.calls.map(([name]) => name)).toEqual(["post:save", "post:publish"]);
		expect(mutation.mock.calls[0][1].draft).toMatchObject({ authorDocumentId: "explicit-author" });
		expect(mutation.mock.calls[0][1].draft).not.toHaveProperty("authorSource");
	});
});
