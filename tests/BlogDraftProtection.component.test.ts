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
	sessionStorage.clear();
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
	component = mount(Harness, {
		target: document.body,
		props: { client: queries.client, overview },
	});
	await tick();
	for (const query of [...queries.subscriptions]) {
		queries.emit(
			query,
			query.name === "post:state"
				? state
				: query.name === "media:list"
					? mediaPage([])
					: query.name === "media:placed"
						? [mediaAsset("attached")]
						: [],
		);
	}
	await tick();
	if (!overview) {
		queries.emit(queries.latest("media:placed"), [mediaAsset("attached")]);
		await vi.waitFor(() => expect(document.querySelector('[role="textbox"]')).not.toBeNull());
	}
	return { queries, mutation };
}

function button(text: string) {
	const node = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
		(button) => button.textContent?.trim() === text,
	);
	if (!node) throw new Error(`Missing button: ${text}`);
	return node;
}

function field(text: string) {
	const label = [...document.querySelectorAll("label")].find(
		(label) => label.textContent?.trim() === text,
	);
	if (!label) throw new Error(`Missing field: ${text}`);
	const input = label.htmlFor
		? document.getElementById(label.htmlFor)
		: label.querySelector("input,textarea");
	if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement))
		throw new Error(`Missing input: ${text}`);
	return input;
}

async function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
	input.value = value;
	input.dispatchEvent(new Event("input", { bubbles: true }));
	await tick();
}

it("preserves local edits and blocks publication when a remote revision arrives", async () => {
	const { queries, mutation } = await render();
	await type(field("post title"), "Local work that has not been saved");
	expect(field("post title").value).toBe("Local work that has not been saved");
	expect(button("save draft").disabled).toBe(false);
	expect(mutation).not.toHaveBeenCalled();
	const remote = postEditorState();
	remote.draft!.revisionId = "other-tab-revision";
	remote.draft!.draft.title = "Title saved by another tab";
	queries.emit(queries.latest("post:state"), remote);
	await tick();
	await tick();
	expect(field("post title").value).toBe("Local work that has not been saved");
	expect(document.body.textContent).toContain("This draft changed elsewhere");
	expect(button("publish").disabled).toBe(true);
	expect(mutation).not.toHaveBeenCalled();
});

it("recovers unsaved text in the same tab after remount without publishing it", async () => {
	await render();
	await type(field("post title"), "Recovered local title");
	await unmount(component!);
	component = undefined;
	document.body.replaceChildren();
	const { mutation } = await render();
	expect(field("post title").value).toBe("Recovered local title");
	expect(document.body.textContent).toContain("Recovered unsaved work");
	expect(mutation).not.toHaveBeenCalled();
});
it("requires an explicit choice before replacing a local conflict with server work", async () => {
	const { queries } = await render();
	await type(field("post title"), "Keep my version");
	const remote = postEditorState();
	remote.draft!.revisionId = "remote";
	remote.draft!.draft.title = "Server version";
	queries.emit(queries.latest("post:state"), remote);
	await tick();
	const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(false);
	button("use server draft").click();
	await tick();
	expect(field("post title").value).toBe("Keep my version");
	confirm.mockReturnValue(true);
	button("use server draft").click();
	await tick();
	expect(field("post title").value).toBe("Server version");
	expect(document.body.textContent).not.toContain("This draft changed elsewhere");
	confirm.mockRestore();
});

it("keeps an unreadable recovery copy until the user explicitly chooses the server draft", async () => {
	const key = "admin:blog-draft:example.test:post:post-1";
	sessionStorage.setItem(key, "{incomplete recovery JSON");
	await render();
	expect(sessionStorage.getItem(key)).toBe("{incomplete recovery JSON");
	expect(document.body.textContent).toContain("saved recovery copy could not be read");
	expect(button("publish").disabled).toBe(true);
	const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
	button("use server draft").click();
	await tick();
	expect(sessionStorage.getItem(key)).toBeNull();
	confirm.mockRestore();
});


it("keeps the editor usable and reports recovery limits when storage access is denied", async () => {
 const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
 Object.defineProperty(globalThis, "sessionStorage", {configurable:true, get() {throw new DOMException("Storage denied", "SecurityError");}});
 try {
  const {mutation} = await render();
  await type(field("post title"), "Draft with unavailable recovery storage");
  expect(field("post title").value).toBe("Draft with unavailable recovery storage");
  expect(button("save draft").disabled).toBe(false);
  expect(button("download my draft").disabled).toBe(false);
  expect(document.body.textContent).toContain("Keep the editor open or download your draft");
  expect(mutation).not.toHaveBeenCalled();
  await unmount(component!);
  component = undefined;
 } finally {
  if (descriptor) Object.defineProperty(globalThis, "sessionStorage", descriptor);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
 }
});
