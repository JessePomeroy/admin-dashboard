import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BlogPage from "../src/lib/pages/editor/BlogPage.svelte";
import BlogPostPage from "../src/lib/pages/editor/BlogPostPage.svelte";
import BlogSupportingPage from "../src/lib/pages/editor/BlogSupportingPage.svelte";
import { emptyPostDraft } from "../src/lib/blogEditor";

const mocks = vi.hoisted(() => ({
	mutation: vi.fn(async () => ({ documentId: "created" })),
	mediaEnabled: false,
	states: new Map<string, { data?: unknown; isLoading?: boolean; error?: Error }>(),
	refs: {
		blogList: { name: "blog:listForEditor" },
		blogState: { name: "blog:getEditorState" },
		blogCreate: { name: "blog:createDraft" },
		postList: { name: "post:listForEditor" },
		postState: { name: "post:getEditorState" },
		postCreate: { name: "post:createDraft" },
		mediaGetMany: { name: "media:getManyForEditor" },
	},
}));

function stateKey(ref: { name?: string }, args?: unknown) {
	if (ref.name === "blog:listForEditor") {
		return `blog:listForEditor:${(args as { kind?: string } | undefined)?.kind}`;
	}
	return ref.name ?? "unknown";
}

vi.mock("$app/navigation", () => ({ goto: vi.fn(async () => {}) }));
vi.mock("convex-svelte", () => ({
	useQuery: (ref: { name?: string }, args?: unknown) => {
		const resolvedArgs = typeof args === "function" ? (args as () => unknown)() : args;
		const state = mocks.states.get(stateKey(ref, resolvedArgs)) ?? { data: [], isLoading: false };
		return {
			get data() {
				return state.data;
			},
			get isLoading() {
				return Boolean(state.isLoading);
			},
			get error() {
				return state.error;
			},
		};
	},
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
		api: {
			blogContent: {
				listForEditor: mocks.refs.blogList,
				getEditorState: mocks.refs.blogState,
				createDraft: mocks.refs.blogCreate,
			},
			postContent: {
				listForEditor: mocks.refs.postList,
				getEditorState: mocks.refs.postState,
				createDraft: mocks.refs.postCreate,
			},
			...(mocks.mediaEnabled
				? { mediaAssets: { getManyForEditor: mocks.refs.mediaGetMany } }
				: {}),
		},
		editor: {
			blog: {
				baseHref: "/admin/editor/blog",
				...(mocks.mediaEnabled ? { mediaBaseUrl: "https://media.example" } : {}),
			},
		},
	}),
}));

const components: ReturnType<typeof mount>[] = [];

function postEditorState() {
	return {
		documentId: "post-1",
		documentKey: "post-1",
		kind: "post",
		slug: "post-1",
		rank: 0,
		draft: {
			revisionId: "revision-1",
			schemaVersion: 1,
			draft: {
				...emptyPostDraft(),
				title: "Post one",
				slug: "post-1",
			},
			source: "admin",
			createdAt: 1,
		},
		published: null,
		updatedAt: 1,
		publishedAt: null,
		archivedAt: null,
	};
}

function button(label: string) {
	return Array.from(document.querySelectorAll("button"))
		.find((candidate) => candidate.textContent?.trim() === label);
}

function postTitleInput() {
	return Array.from(document.querySelectorAll("label"))
		.find((label) => label.textContent?.includes("post title"))
		?.querySelector<HTMLInputElement>("input");
}

describe("Blog query states", () => {
	beforeEach(() => {
		mocks.states.clear();
		mocks.mediaEnabled = false;
		mocks.mutation.mockReset().mockResolvedValue({ documentId: "created" });
		mocks.states.set("post:listForEditor", { data: [], isLoading: false });
		history.replaceState(null, "", "/");
	});

	afterEach(() => {
		for (const component of components.splice(0)) unmount(component);
		document.body.innerHTML = "";
	});

	it("distinguishes supporting collection loading and failure from empty results", async () => {
		mocks.states.set("blog:listForEditor:author", { isLoading: true });
		mocks.states.set("blog:listForEditor:category", { error: new Error("private provider detail") });
		components.push(mount(BlogPage, { target: document.body }));
		await tick();

		expect(document.querySelector('[role="status"]')?.textContent).toBe("loading authors…");
		expect(document.querySelector('[role="alert"]')?.textContent).toBe("Could not load categories.");
		expect(document.body.textContent).not.toContain("private provider detail");
		expect(document.body.textContent).not.toContain("No authors yet.");
		expect(document.body.textContent).not.toContain("No categories yet.");
	});

	it("terminates a failed post detail load with a bounded error state", async () => {
		mocks.states.set("post:getEditorState", { error: new Error("private post detail") });
		components.push(mount(BlogPostPage, {
			target: document.body,
			props: { documentId: "post-1" },
		}));
		await tick();

		expect(document.querySelector('[role="alert"]')?.textContent).toBe("Could not load this post.");
		expect(document.body.textContent).not.toContain("private post detail");
		expect(document.body.textContent).not.toContain("loading post…");
	});

	it("terminates a failed supporting detail load with a bounded error state", async () => {
		mocks.states.set("blog:getEditorState", { error: new Error("private author detail") });
		components.push(mount(BlogSupportingPage, {
			target: document.body,
			props: { documentId: "author-1", kind: "author" },
		}));
		await tick();

		expect(document.querySelector('[role="alert"]')?.textContent).toBe("Could not load this author.");
		expect(document.body.textContent).not.toContain("private author detail");
		expect(document.body.textContent).not.toContain("loading author…");
	});

	it("holds reference and image controls while post dependencies are loading", async () => {
		mocks.mediaEnabled = true;
		mocks.states.set("post:getEditorState", {
			data: {
				documentId: "post-1",
				documentKey: "post-1",
				kind: "post",
				slug: "post-1",
				rank: 0,
				draft: {
					revisionId: "revision-1",
					schemaVersion: 1,
					draft: {
						...emptyPostDraft(),
						title: "Post one",
						slug: "post-1",
						mainImage: { key: "main", assetId: "asset-1", altText: "A field." },
					},
					source: "admin",
					createdAt: 1,
				},
				published: null,
				updatedAt: 1,
				publishedAt: null,
				archivedAt: null,
			},
		});
		mocks.states.set("blog:listForEditor:author", { isLoading: true });
		mocks.states.set("blog:listForEditor:category", { data: [] });
		mocks.states.set("media:getManyForEditor", { isLoading: true });
		components.push(mount(BlogPostPage, {
			target: document.body,
			props: { documentId: "post-1" },
		}));
		await tick();
		await tick();

		expect(document.body.textContent).toContain("loading author and category options…");
		expect(document.querySelector('#references-heading')?.parentElement?.parentElement?.querySelector("select")).toBeNull();
		expect(document.body.textContent).not.toContain("No published or currently linked categories.");
		expect(document.body.textContent).toContain("loading linked image details…");
		expect(document.body.textContent).not.toContain("preview unavailable");
	});

	it("holds author portrait review while linked media is loading", async () => {
		mocks.mediaEnabled = true;
		mocks.states.set("blog:getEditorState", {
			data: {
				documentId: "author-1",
				documentKey: "author-1",
				kind: "author",
				slug: "author-one",
				rank: 0,
				draft: {
					revisionId: "author-revision",
					schemaVersion: 1,
					draft: {
						kind: "author",
						name: "Author one",
						slug: "author-one",
						portrait: { key: "portrait", assetId: "asset-1", altText: "Author portrait." },
					},
					source: "admin",
					createdAt: 1,
				},
				published: null,
				updatedAt: 1,
				publishedAt: null,
				archivedAt: null,
			},
		});
		mocks.states.set("media:getManyForEditor", { isLoading: true });
		components.push(mount(BlogSupportingPage, {
			target: document.body,
			props: { documentId: "author-1", kind: "author" },
		}));
		await tick();
		await tick();

		expect(document.body.textContent).toContain("loading linked portrait…");
		expect(document.body.textContent).not.toContain("preview unavailable");
	});

	it("keeps the saving state visible until the save mutation settles", async () => {
		mocks.states.set("post:getEditorState", { data: postEditorState() });
		let finishSave: ((value: { revisionId: string }) => void) | undefined;
		mocks.mutation.mockImplementation(() => new Promise((resolve) => {
			finishSave = resolve;
		}));
		components.push(mount(BlogPostPage, {
			target: document.body,
			props: { documentId: "post-1" },
		}));
		await tick();
		await tick();

		const title = postTitleInput();
		expect(title).toBeDefined();
		title!.value = "Post one revised";
		title!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(document.querySelector(".save-status")?.textContent).toBe("dirty");

		button("save draft")?.click();
		await tick();
		expect(document.querySelector(".save-status")?.textContent).toBe("saving");

		finishSave?.({ revisionId: "revision-2" });
		await tick();
		await tick();
		expect(document.querySelector(".save-status")?.textContent).toBe("saved");
	});

	it("keeps a failed save distinguishable and retryable", async () => {
		mocks.states.set("post:getEditorState", { data: postEditorState() });
		mocks.mutation.mockRejectedValue(new Error("deterministic save failure"));
		components.push(mount(BlogPostPage, {
			target: document.body,
			props: { documentId: "post-1" },
		}));
		await tick();
		await tick();

		const title = postTitleInput();
		expect(title).toBeDefined();
		title!.value = "Post one revised";
		title!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		button("save draft")?.click();
		await tick();
		await tick();

		expect(document.querySelector(".save-status")?.textContent).toBe("error");
		expect(document.querySelector('[role="alert"]')?.textContent).toContain("deterministic save failure");
		expect(button("save draft")?.disabled).toBe(false);
	});
});
