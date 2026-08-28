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
		postSave: { name: "post:saveDraft" },
		mediaGetMany: { name: "media:getManyForEditor" },
		mediaList: { name: "media:listForEditor" },
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
				saveDraft: mocks.refs.postSave,
			},
			...(mocks.mediaEnabled
				? {
					mediaAssets: {
						getManyForEditor: mocks.refs.mediaGetMany,
						listForEditor: mocks.refs.mediaList,
					},
				}
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

function mediaAsset(id: string) {
	return {
		_id: id,
		assetId: id,
		originalFilename: `${id}.jpg`,
		status: "ready",
		source: { contentType: "image/jpeg", sizeBytes: 100, width: 1200, height: 800 },
		derivatives: {
			thumb: { key: `${id}/thumb.jpg`, width: 160, height: 107 },
			card: { key: `${id}/card.jpg`, width: 800, height: 533 },
		},
		createdAt: 1,
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
		mocks.states.set("media:listForEditor", { isLoading: true });
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
		expect(document.body.textContent).toContain("loading the ready image library…");
		expect(document.body.textContent).not.toContain("preview unavailable");
	});

	it("distinguishes a failed ready-media library from an empty library", async () => {
		mocks.mediaEnabled = true;
		const state = postEditorState();
		state.draft.draft.body = {
			version: 1,
			blocks: [{
				type: "image",
				key: "linked-image",
				assetId: "asset-1",
				altText: "Linked image",
			}],
		};
		mocks.states.set("post:getEditorState", { data: state });
		mocks.states.set("media:getManyForEditor", { data: [mediaAsset("asset-1")] });
		mocks.states.set("media:listForEditor", { error: new Error("private media detail") });
		components.push(mount(BlogPostPage, {
			target: document.body,
			props: { documentId: "post-1" },
		}));
		await tick();
		await tick();

		expect(document.body.textContent).toContain("Could not load the ready image library.");
		expect(document.body.textContent).not.toContain("private media detail");
		expect(Array.from(document.querySelectorAll("button"))
			.some((candidate) => candidate.textContent?.trim() === "add image")).toBe(false);
	});

	it("keeps main-image review and body-image editing at separate authorities", async () => {
		mocks.mediaEnabled = true;
		const state = postEditorState();
		state.draft.draft.mainImage = {
			key: "main-image",
			assetId: "asset-main",
			altText: "Original main alt",
		};
		state.draft.draft.body = {
			version: 1,
			blocks: [{
				type: "image",
				key: "body-image",
				assetId: "asset-1",
				altText: "Original alt",
				caption: "Original caption",
			}],
		};
		mocks.states.set("post:getEditorState", { data: state });
		mocks.states.set("media:getManyForEditor", {
			data: [mediaAsset("asset-main"), mediaAsset("asset-1")],
		});
		mocks.states.set("media:listForEditor", {
			data: { page: [mediaAsset("asset-1")], isDone: true, continueCursor: "" },
		});
		mocks.mutation.mockResolvedValue({ revisionId: "revision-2" });
		components.push(mount(BlogPostPage, {
			target: document.body,
			props: { documentId: "post-1" },
		}));
		await vi.waitFor(() => {
			expect(document.querySelector('input[aria-label="Image alt text"]')).toBeTruthy();
		});

		const reviewAlt = document.querySelector<HTMLInputElement>("#blog-media-alt-0");
		expect(reviewAlt).toBeTruthy();
		expect(document.querySelector("#blog-media-alt-1")).toBeNull();
		expect(document.body.textContent).not.toContain("alt text for body image");
		reviewAlt!.value = "Main review alt";
		reviewAlt!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();

		const bodyAlt = document.querySelector<HTMLInputElement>('input[aria-label="Image alt text"]');
		const caption = document.querySelector<HTMLInputElement>('input[aria-label="Image caption"]');
		expect(bodyAlt).toBeTruthy();
		expect(caption).toBeTruthy();
		bodyAlt!.value = "Editor body alt";
		bodyAlt!.dispatchEvent(new Event("change", { bubbles: true }));
		caption!.value = "Editor caption";
		caption!.dispatchEvent(new Event("change", { bubbles: true }));
		await tick();
		button("save draft")?.click();
		await tick();

		const saveCall = mocks.mutation.mock.calls.find((call) =>
			(call[0] as { name?: string }).name === "post:saveDraft");
		expect(saveCall?.[1]).toMatchObject({
			draft: {
				mainImage: { altText: "Main review alt" },
				body: {
					blocks: [{ altText: "Editor body alt", caption: "Editor caption" }],
				},
			},
		});
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
