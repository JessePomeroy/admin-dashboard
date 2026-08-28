import { createRawSnippet, mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BlogWorkbench from "../src/lib/pages/editor/BlogWorkbench.svelte";

const mocks = vi.hoisted(() => ({
	goto: vi.fn(async () => {}),
	mutation: vi.fn(async () => ({ documentId: "post-created" })),
	loading: false,
	queryError: undefined as Error | undefined,
	posts: [
		{
			documentId: "post-draft",
			documentKey: "post-draft",
			kind: "post" as const,
			slug: "quiet-morning",
			rank: 0,
			draft: {
				revisionId: "draft-1",
				title: "Quiet Morning",
				format: "essay",
				presentation: "standard",
				displayPublishedAt: null,
			},
			published: null,
			updatedAt: 2,
			archivedAt: null,
		},
		{
			documentId: "post-changed",
			documentKey: "post-changed",
			kind: "post" as const,
			slug: "field-notes",
			rank: 1,
			draft: {
				revisionId: "draft-2",
				title: "Field Notes",
				format: "technicalNote",
				presentation: "technical",
				displayPublishedAt: 2,
			},
			published: {
				revisionId: "published-1",
				title: "Field Notes",
				format: "technicalNote",
				presentation: "technical",
				displayPublishedAt: 1,
			},
			updatedAt: 3,
			archivedAt: null,
		},
	],
	refs: {
		listForEditor: { name: "posts:listForEditor" },
		createDraft: { name: "posts:createDraft" },
	},
}));

vi.mock("$app/navigation", () => ({ goto: mocks.goto }));
vi.mock("convex-svelte", () => ({
	useQuery: () => ({
		get data() {
			return mocks.loading || mocks.queryError ? undefined : mocks.posts;
		},
		get isLoading() {
			return mocks.loading;
		},
		get error() {
			return mocks.queryError;
		},
	}),
}));
vi.mock("../src/lib/adminClient", () => ({
	useAdminClient: () => ({ mutation: mocks.mutation }),
}));
vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({
		siteUrl: "https://site.example",
		siteName: "test site",
		fromEmail: "test@example.com",
		isCreator: true,
		api: { postContent: mocks.refs },
		editor: { blog: { baseHref: "/admin/editor/blog" } },
	}),
}));

const components: ReturnType<typeof mount>[] = [];
const content = createRawSnippet(() => ({
	render: () => '<section data-testid="document-content">document content</section>',
}));

async function mountWorkbench(props: { selectedDocumentId?: string; selectedKind?: "post" | "author" | "category" } = {}) {
	components.push(mount(BlogWorkbench, {
		target: document.body,
		props: { ...props, children: content },
	}));
	await tick();
}

describe("BlogWorkbench", () => {
	beforeEach(() => {
		mocks.goto.mockClear();
		mocks.mutation.mockClear();
		mocks.loading = false;
		mocks.queryError = undefined;
		history.replaceState(null, "", "/");
	});

	afterEach(() => {
		for (const component of components.splice(0)) unmount(component);
		document.body.innerHTML = "";
	});

	it("renders the Paper-derived collection and focused document panes", async () => {
		await mountWorkbench({ selectedDocumentId: "post-changed", selectedKind: "post" });

		expect(document.querySelector(".workbench-grid")).not.toBeNull();
		expect(document.querySelector('aside[aria-label="Blog posts"]')).not.toBeNull();
		expect(document.querySelector('section[aria-label="Blog document"] [data-testid="document-content"]')?.textContent).toBe("document content");
		expect(document.querySelector('.post-list a[aria-current="page"]')?.textContent).toContain("Field Notes");
		expect(document.querySelector('nav[aria-label="Blog collections"] a[aria-current="page"]')?.textContent).toBe("posts");
	});

	it("filters by title or URL and exposes the changed-record view", async () => {
		await mountWorkbench();
		const search = document.querySelector<HTMLInputElement>('input[type="search"]');
		if (!search) throw new Error("search input missing");
		search.value = "quiet-morning";
		search.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(Array.from(document.querySelectorAll(".post-list strong"), (item) => item.textContent)).toEqual(["Quiet Morning"]);

		search.value = "";
		search.dispatchEvent(new Event("input", { bubbles: true }));
		document.querySelector<HTMLButtonElement>('.filters button:nth-child(4)')?.click();
		await tick();
		expect(Array.from(document.querySelectorAll(".post-list strong"), (item) => item.textContent)).toEqual(["Field Notes"]);
		expect(document.querySelector(".post-list small")?.textContent).toBe("draft changes");
	});

	it("keeps supporting collections reachable and creates through the existing post mutation", async () => {
		await mountWorkbench();

		const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Blog collections"] a'));
		expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
			["posts", "/admin/editor/blog"],
			["authors", "/admin/editor/blog#authors"],
			["categories", "/admin/editor/blog#categories"],
		]);
		links[1]?.addEventListener("click", (event) => event.preventDefault());
		links[1]?.click();
		await tick();
		expect(document.querySelector(".blog-workbench")?.classList.contains("supporting-view")).toBe(true);
		links[0]?.addEventListener("click", (event) => event.preventDefault());
		links[0]?.click();
		await tick();
		expect(document.querySelector(".blog-workbench")?.classList.contains("supporting-view")).toBe(false);

		document.querySelector<HTMLButtonElement>("button.new-post")?.click();
		await tick();
		expect(mocks.mutation).toHaveBeenCalledWith(mocks.refs.createDraft, expect.objectContaining({
			siteUrl: "https://site.example",
			draft: expect.objectContaining({ title: "new post", slug: "new-post" }),
		}));
		expect(mocks.goto).toHaveBeenCalledWith("/admin/editor/blog/posts/post-created");
	});

	it("restores supporting collection state from the URL hash", async () => {
		history.replaceState(null, "", "/admin/editor/blog#categories");
		await mountWorkbench();

		expect(document.querySelector(".blog-workbench")?.classList.contains("supporting-view")).toBe(true);
		expect(document.querySelector('nav[aria-label="Blog collections"] a[aria-current="page"]')?.textContent).toBe("categories");

		history.replaceState(null, "", "/admin/editor/blog#authors");
		window.dispatchEvent(new HashChangeEvent("hashchange"));
		await tick();
		expect(document.querySelector('nav[aria-label="Blog collections"] a[aria-current="page"]')?.textContent).toBe("authors");
	});

	it("distinguishes loading and failed post collections from an empty collection", async () => {
		mocks.loading = true;
		await mountWorkbench();
		expect(document.querySelector('[role="status"]')?.textContent).toBe("loading posts…");
		expect(document.body.textContent).not.toContain("No posts yet.");
		unmount(components.pop());
		document.body.innerHTML = "";

		mocks.loading = false;
		mocks.queryError = new Error("provider details stay private");
		await mountWorkbench();
		expect(document.querySelector('[role="alert"]')?.textContent).toBe("Could not load posts.");
		expect(document.body.textContent).not.toContain("provider details stay private");
		expect(document.body.textContent).not.toContain("No posts yet.");
	});
});
