import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PortfolioGalleryIdentityHarness from "./PortfolioGalleryIdentityHarness.svelte";

type SaveArgs = {
	galleryId: string;
	expectedDraftRevisionId?: string;
	draft: { title: string; slug: string };
};

const editor = vi.hoisted(() => ({
	actionsEnabled: false,
	goto: vi.fn(),
	mutation: vi.fn<(_query: unknown, args: SaveArgs) => Promise<{ revisionId: string }>>(),
	data: Object.fromEntries(
		[
			["A", "Alpha"],
			["B", "Beta"],
		].map(([galleryId, title]) => [
			galleryId,
			{
				galleryId,
				slug: title.toLowerCase(),
				isPublished: false,
				isVisible: true,
				draft: {
					revisionId: `revision-${galleryId}`,
					title,
					slug: title.toLowerCase(),
					placements: [{ key: "photo", assetId: "asset", altText: "Portrait" }],
				},
			},
		]),
	),
}));

// Keep the public editor and its recovery/autosave logic real. Only external
// transport and unrelated media presentation are replaced.
vi.mock("$app/navigation", () => ({ goto: editor.goto }));
vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({
		siteUrl: "angelsrest.test",
		siteName: "Test portfolio",
		api: { portfolioEditor: {
			getEditorState: "get", saveDraft: "save", listForEditor: "list",
			...(editor.actionsEnabled ? { publish: "publish", remove: "remove" } : {}),
		} },
		editor: { portfolio: {
			mediaBaseUrl: "https://media.example.test",
			...(editor.actionsEnabled ? { previewEndpoint: "/preview" } : {}),
		} },
	}),
}));
vi.mock("../src/lib/adminClient", () => ({
	useAdminClient: () => ({ mutation: editor.mutation }),
}));
vi.mock("convex-svelte", () => ({
	useQuery: (query: unknown, args: () => { galleryId: string }) => ({
		get data() {
			if (query === "list") return Object.values(editor.data).map((gallery) => ({
				...gallery, updatedAt: 1,
			}));
			return editor.data[args().galleryId];
		},
		error: undefined,
	}),
}));
vi.mock("../src/lib/editorMedia.svelte", () => ({
	createEditorMedia: () => ({ byId: new Map(), ready: [], error: undefined }),
}));
vi.mock(
	"../src/lib/pages/editor/PortfolioGalleryImages.svelte",
	() => ({ default: () => undefined }),
);
vi.mock(
	"../src/lib/pages/editor/PortfolioMediaPicker.svelte",
	() => ({ default: () => undefined }),
);
vi.mock(
	"../src/lib/pages/editor/PortfolioPublishReview.svelte",
	() => ({ default: () => undefined }),
);

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function recoveryKey(galleryId: string) {
	return `admin:portfolio-editor:angelsrest.test:${galleryId}`;
}

function storedDraft(galleryId: string) {
	const value = localStorage.getItem(recoveryKey(galleryId));
	return value ? JSON.parse(value) : null;
}

function titleInput() {
	const input = document.querySelector<HTMLInputElement>("#gallery-title");
	if (!input) throw new Error("Expected the real gallery title input");
	return input;
}

async function editTitle(title: string) {
	const input = titleInput();
	input.value = title;
	input.dispatchEvent(new Event("input", { bubbles: true }));
	await tick();
}

describe("portfolio gallery document identity", () => {
	let component: ReturnType<typeof PortfolioGalleryIdentityHarness> | undefined;

	beforeEach(async () => {
		vi.useFakeTimers();
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
		editor.data.A.isPublished = false;
		editor.data.A.isVisible = true;
		editor.actionsEnabled = false;
		editor.goto.mockReset();
		editor.mutation.mockReset().mockResolvedValue({ revisionId: "saved-revision" });
		component = mount(PortfolioGalleryIdentityHarness, { target: document.body });
		await tick();
	});

	afterEach(async () => {
		if (component) await unmount(component);
		component = undefined;
		document.body.replaceChildren();
		localStorage.clear();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	async function navigate(galleryId: string) {
		if (!component) throw new Error("Expected a mounted route");
		component.navigate(galleryId);
		await tick();
	}

	async function enableActions() {
		if (component) await unmount(component);
		editor.actionsEnabled = true;
		component = mount(PortfolioGalleryIdentityHarness, { target: document.body });
		await tick();
	}

	async function clickButton(label: string) {
		const button = Array.from(document.querySelectorAll("button"))
			.find((candidate) => candidate.textContent?.trim() === label);
		if (!button || button.disabled) throw new Error(`Expected enabled ${label} button`);
		button.click();
		await vi.advanceTimersByTimeAsync(0);
	}

	it.each(["save draft", "reconnect", "edit"])("keeps a failed autosave stable until %s retries it", async (retry) => {
		const pending = deferred<{ revisionId: string }>();
		editor.mutation.mockReturnValueOnce(pending.promise);
		await editTitle("Alpha edited");
		await vi.advanceTimersByTimeAsync(901);
		pending.reject(new Error("[request id: test] Server Error"));
		await pending.promise.catch(() => undefined);
		await tick();
		await vi.advanceTimersByTimeAsync(5000);
		expect(editor.mutation).toHaveBeenCalledTimes(1);
		expect(document.querySelector('.gallery-page [role="alert"]')?.textContent).toContain("Server Error");
		expect(storedDraft("A")).toMatchObject({ payload: { title: "Alpha edited" } });
		if (retry === "save draft") await clickButton("save draft");
		else if (retry === "reconnect") {
			window.dispatchEvent(new Event("offline"));
			await tick();
			window.dispatchEvent(new Event("online"));
		} else await editTitle("Alpha corrected");
		await vi.advanceTimersByTimeAsync(901);
		expect(editor.mutation).toHaveBeenCalledTimes(2);
		expect(storedDraft("A")).toBeNull();
		expect(document.querySelector('.gallery-page [role="alert"]')).toBeNull();
	});

	it.each(["Alpha newer edit", "Alpha"])("waits for a slow save before saving %s with the returned revision", async (title) => {
		const pending = deferred<{ revisionId: string }>();
		editor.mutation.mockReturnValueOnce(pending.promise);
		await editTitle("Alpha first edit");
		await vi.advanceTimersByTimeAsync(901);
		await editTitle(title);
		window.dispatchEvent(new Event("offline"));
		await tick();
		window.dispatchEvent(new Event("online"));
		await tick();
		await vi.advanceTimersByTimeAsync(5000);
		expect(editor.mutation).toHaveBeenCalledTimes(1);
		expect(document.querySelector<HTMLButtonElement>(".editor-header-actions .secondary")?.disabled).toBe(true);
		expect(storedDraft("A")).toMatchObject({ payload: { title } });
		pending.resolve({ revisionId: "revision-A-first-save" });
		await pending.promise;
		await tick();
		await vi.advanceTimersByTimeAsync(901);
		expect(editor.mutation).toHaveBeenCalledTimes(2);
		expect(editor.mutation).toHaveBeenLastCalledWith("save", expect.objectContaining({
			expectedDraftRevisionId: "revision-A-first-save",
			draft: expect.objectContaining({ title }),
		}));
		expect(storedDraft("A")).toBeNull();
	});

	it.each([true, false])("locks the URL after publication, including visible=%s galleries, and recovers other edits", async (isVisible) => {
		await navigate("B");
		editor.data.A.isPublished = true;
		editor.data.A.isVisible = isVisible;
		localStorage.setItem(recoveryKey("A"), JSON.stringify({
			schemaVersion: 1,
			baseRevisionId: "revision-A",
			payload: {
				title: "New title", description: "New description", slug: "new-title",
				placements: [{ key: "photo", assetId: "asset", altText: "New alt text", caption: "New caption" }],
			},
		}));
		await navigate("A");
		const slug = document.querySelector<HTMLInputElement>("#gallery-slug");
		expect(slug?.disabled).toBe(true);
		expect(slug?.value).toBe("alpha");
		expect(document.querySelector(".gallery-page .generate-url")).toBeNull();
		expect(titleInput().value).toBe("New title");
		await vi.advanceTimersByTimeAsync(901);
		expect(editor.mutation).toHaveBeenCalledExactlyOnceWith("save", expect.objectContaining({
			draft: {
				title: "New title", description: "New description", slug: "alpha",
				placements: [expect.objectContaining({ altText: "New alt text", caption: "New caption" })],
			},
		}));
	});

	it.each(["save", "publish"])("keeps the first published URL when edits arrive during %s", async (phase) => {
		await enableActions();
		await editTitle("Ready to publish");
		const pending = deferred<{ revisionId: string }>();
		if (phase === "publish") editor.mutation.mockResolvedValueOnce({ revisionId: "before-publish" });
		editor.mutation.mockReturnValueOnce(pending.promise);
		await clickButton("publish");
		await editTitle("Title typed during publication");
		const slug = document.querySelector<HTMLInputElement>("#gallery-slug");
		const description = document.querySelector<HTMLTextAreaElement>(".gallery-page textarea");
		if (!slug || !description) throw new Error("Expected gallery fields");
		slug.value = "typed-during-publication";
		slug.dispatchEvent(new Event("input", { bubbles: true }));
		description.value = "Description typed during publication";
		description.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		await vi.advanceTimersByTimeAsync(2000);
		expect(editor.mutation).toHaveBeenCalledTimes(phase === "publish" ? 2 : 1);
		pending.resolve({ revisionId: "before-publish" });
		await pending.promise;
		await vi.advanceTimersByTimeAsync(0);
		expect(slug.disabled).toBe(true);
		expect(slug.value).toBe("alpha");
		expect(titleInput().value).toBe("Title typed during publication");
		expect(description.value).toBe("Description typed during publication");
		await vi.advanceTimersByTimeAsync(901);
		expect(editor.mutation).toHaveBeenLastCalledWith("save", expect.objectContaining({
			expectedDraftRevisionId: "before-publish",
			draft: expect.objectContaining({
				title: "Title typed during publication",
				description: "Description typed during publication",
				slug: "alpha",
			}),
		}));
	});

	it("returns to saved when only the URL changes during first publication", async () => {
		await enableActions();
		const pending = deferred<{ revisionId: string }>();
		editor.mutation.mockReturnValueOnce(pending.promise);
		await clickButton("publish");
		const slug = document.querySelector<HTMLInputElement>("#gallery-slug");
		if (!slug) throw new Error("Expected gallery URL field");
		slug.value = "typed-during-publication";
		slug.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		await vi.advanceTimersByTimeAsync(2000);
		expect(editor.mutation).toHaveBeenCalledTimes(1);
		pending.resolve({ revisionId: "revision-A" });
		await pending.promise;
		await vi.advanceTimersByTimeAsync(1000);
		expect(slug.disabled).toBe(true);
		expect(slug.value).toBe("alpha");
		expect(document.querySelector("[data-save-state]")?.getAttribute("data-save-state")).toBe("saved");
		expect(storedDraft("A")).toBeNull();
		expect(editor.mutation).toHaveBeenCalledTimes(1);
	});

	it("retains newer offline edits when publication completes and the gallery is reopened", async () => {
		await enableActions();
		const pending = deferred<{ revisionId: string }>();
		editor.mutation.mockReturnValueOnce(pending.promise);
		await clickButton("publish");
		await editTitle("Keep this offline title");
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		window.dispatchEvent(new Event("offline"));
		await tick();
		expect(storedDraft("A")).toMatchObject({ payload: { title: "Keep this offline title" } });
		pending.resolve({ revisionId: "revision-A" });
		await pending.promise;
		await vi.advanceTimersByTimeAsync(0);
		expect(storedDraft("A")).toMatchObject({ payload: { title: "Keep this offline title" } });
		await navigate("B");
		await navigate("A");
		expect(titleInput().value).toBe("Keep this offline title");
		await vi.advanceTimersByTimeAsync(2000);
		expect(editor.mutation).toHaveBeenCalledTimes(1);
	});

	it("retains conflicting recovered edits without autosaving after correcting a published URL", async () => {
		await navigate("B");
		editor.data.A.isPublished = true;
		localStorage.setItem(recoveryKey("A"), JSON.stringify({
			schemaVersion: 1, baseRevisionId: "older-revision",
			payload: { title: "Unsynchronized title", description: "Keep this", slug: "invalid-new-path", placements: [] },
		}));
		await navigate("A");
		expect(titleInput().value).toBe("Unsynchronized title");
		expect(document.querySelector<HTMLInputElement>("#gallery-slug")?.value).toBe("alpha");
		expect(document.querySelector('[role="alert"]')?.textContent).toContain("server changed");
		await vi.advanceTimersByTimeAsync(5000);
		expect(editor.mutation).not.toHaveBeenCalled();
		expect(storedDraft("A")).toMatchObject({ baseRevisionId: "older-revision", payload: { title: "Unsynchronized title", description: "Keep this" } });
	});

	it("preserves collection search and filter while switching the selected document", async () => {
		const search = document.querySelector<HTMLInputElement>('input[type="search"]');
		if (!search) throw new Error("Expected the real collection search input");
		search.value = "a";
		search.dispatchEvent(new Event("input", { bubbles: true }));
		await clickButton("draft");
		expect(document.querySelectorAll(".gallery-list a")).toHaveLength(2);
		await navigate("B");
		expect(document.querySelector('input[type="search"]')).toBe(search);
		expect(search.value).toBe("a");
		expect(document.querySelector('.filters [aria-pressed="true"]')?.textContent).toBe("draft");
		expect(document.querySelector('.gallery-list [aria-current="page"]')?.getAttribute("href")).toBe("/admin/editor/portfolio/B");
		expect(titleInput().value).toBe("Beta");
	});

	it.each(["publish", "remove"] as const)("ignores a destroyed editor's %s completion", async (action) => {
		await enableActions();
		const pending = deferred<{ revisionId: string }>();
		editor.mutation.mockReturnValueOnce(pending.promise);
		if (action === "publish") await clickButton("publish");
		else {
			await clickButton("delete gallery");
			await clickButton("delete permanently");
		}
		expect(editor.mutation).toHaveBeenCalledWith(action, expect.objectContaining({ galleryId: "A" }));
		await navigate("B");
		await navigate("A");
		await editTitle("Alpha newer edit");
		const recoveryBefore = localStorage.getItem(recoveryKey("A"));
		pending.resolve({ revisionId: "old-operation" });
		await pending.promise;
		await tick();
		expect(localStorage.getItem(recoveryKey("A"))).toBe(recoveryBefore);
		expect(titleInput().value).toBe("Alpha newer edit");
		expect(editor.goto).not.toHaveBeenCalled();
	});

	it("closes a pending preview on navigation and ignores its late response", async () => {
		await enableActions();
		const popup = { opener: null, location: { href: "about:blank" }, close: vi.fn() };
		vi.stubGlobal("open", vi.fn(() => popup));
		const pending = deferred<Response>();
		const fetch = vi.fn(() => pending.promise);
		vi.stubGlobal("fetch", fetch);
		await clickButton("preview");
		expect(fetch).toHaveBeenCalledWith("/preview", expect.objectContaining({ method: "POST" }));
		await navigate("B");
		expect(popup.close).toHaveBeenCalledTimes(1);
		pending.resolve(Response.json({ previewUrl: "/preview/alpha" }));
		await pending.promise;
		await vi.advanceTimersByTimeAsync(0);
		expect(popup.location.href).toBe("about:blank");
		expect(titleInput().value).toBe("Beta");
	});

	it("keeps a pending A draft out of B and cancels A's debounce on navigation", async () => {
		await editTitle("Alpha edited");
		await navigate("B");
		expect(titleInput().value).toBe("Beta");
		expect(storedDraft("A")).toMatchObject({
			baseRevisionId: "revision-A",
			payload: { title: "Alpha edited" },
		});
		expect(storedDraft("B")).toBeNull();
		await vi.advanceTimersByTimeAsync(901);
		expect(editor.mutation).not.toHaveBeenCalled();
	});

	it("restores offline work only when returning to its own gallery", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		window.dispatchEvent(new Event("offline"));
		await editTitle("Alpha offline");
		await navigate("B");
		expect(titleInput().value).toBe("Beta");
		await editTitle("Beta offline");
		await navigate("A");
		expect(titleInput().value).toBe("Alpha offline");
		expect(storedDraft("B")).toMatchObject({
			baseRevisionId: "revision-B",
			payload: { title: "Beta offline" },
		});
		await vi.advanceTimersByTimeAsync(901);
		expect(editor.mutation).not.toHaveBeenCalled();
	});

	it.each([
		"success",
		"rejection",
	] as const)("does not let A's late %s touch B's recovery draft or revision", async (outcome) => {
		const pending = deferred<{ revisionId: string }>();
		editor.mutation.mockReturnValueOnce(pending.promise);
		await editTitle("Alpha edited");
		await vi.advanceTimersByTimeAsync(901);
		expect(editor.mutation).toHaveBeenNthCalledWith(
			1,
			"save",
			expect.objectContaining({
				galleryId: "A",
				expectedDraftRevisionId: "revision-A",
				draft: expect.objectContaining({ title: "Alpha edited" }),
			}),
		);
		await navigate("B");
		await editTitle("Beta edited");
		const recoveryBefore = localStorage.getItem(recoveryKey("B"));
		expect(storedDraft("B")).toMatchObject({
			baseRevisionId: "revision-B",
			payload: { title: "Beta edited" },
		});
		if (outcome === "success") pending.resolve({ revisionId: "revision-A-saved" });
		else pending.reject(new Error("Save failed for Alpha"));
		await pending.promise.catch(() => undefined);
		await tick();
		expect(localStorage.getItem(recoveryKey("B"))).toBe(recoveryBefore);
		expect(titleInput().value).toBe("Beta edited");
		expect(document.querySelector('[role="alert"]')).toBeNull();
		await vi.advanceTimersByTimeAsync(901);
		expect(editor.mutation).toHaveBeenNthCalledWith(
			2,
			"save",
			expect.objectContaining({
				galleryId: "B",
				expectedDraftRevisionId: "revision-B",
				draft: expect.objectContaining({ title: "Beta edited" }),
			}),
		);
	});

	it("preserves an edit while the gallery ID stays the same and saves normally", async () => {
		await editTitle("Alpha edited");
		const inputBefore = titleInput();
		await navigate("A");
		expect(titleInput()).toBe(inputBefore);
		expect(titleInput().value).toBe("Alpha edited");
		await vi.advanceTimersByTimeAsync(901);
		expect(editor.mutation).toHaveBeenCalledExactlyOnceWith(
			"save",
			expect.objectContaining({
				galleryId: "A",
				expectedDraftRevisionId: "revision-A",
				draft: expect.objectContaining({ title: "Alpha edited" }),
			}),
		);
		expect(storedDraft("A")).toBeNull();
		expect(document.body.textContent).toContain("draft saved");
	});

	it.each([
		"success",
		"rejection",
	] as const)("preserves newly recovered A edits when its earlier instance's save ends in %s", async (outcome) => {
		const pending = deferred<{ revisionId: string }>();
		editor.mutation.mockReturnValueOnce(pending.promise);
		await editTitle("Alpha first edit");
		await vi.advanceTimersByTimeAsync(901);
		expect(editor.mutation).toHaveBeenCalledTimes(1);
		await navigate("B");
		await navigate("A");
		await editTitle("Alpha newer edit");
		const recoveryBefore = localStorage.getItem(recoveryKey("A"));
		expect(storedDraft("A")).toMatchObject({ payload: { title: "Alpha newer edit" } });
		if (outcome === "success") pending.resolve({ revisionId: "revision-A-saved" });
		else pending.reject(new Error("Old Alpha save failed"));
		await pending.promise.catch(() => undefined);
		await tick();
		expect(localStorage.getItem(recoveryKey("A"))).toBe(recoveryBefore);
		expect(titleInput().value).toBe("Alpha newer edit");
		expect(document.querySelector('[role="alert"]')).toBeNull();
	});

	it("retains a conflicting draft for recovery without retrying or affecting B", async () => {
		editor.mutation.mockRejectedValueOnce(new Error("Revision conflict"));
		await editTitle("Alpha conflicted");
		await vi.advanceTimersByTimeAsync(901);
		expect(document.querySelector('[role="alert"]')?.textContent).toBe("Revision conflict");
		expect(storedDraft("A")).toMatchObject({
			baseRevisionId: "revision-A",
			payload: { title: "Alpha conflicted" },
		});
		await vi.advanceTimersByTimeAsync(2000);
		expect(editor.mutation).toHaveBeenCalledTimes(1);
		await navigate("B");
		expect(titleInput().value).toBe("Beta");
		expect(document.querySelector('[role="alert"]')).toBeNull();
		expect(storedDraft("B")).toBeNull();
	});
});
