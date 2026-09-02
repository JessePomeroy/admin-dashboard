const posts = [
	{
		documentId: "post-draft",
		documentKey: "post-draft",
		kind: "post",
		slug: "quiet-morning",
		rank: 0,
		draft: { revisionId: "draft-1", title: "Quiet Morning", format: "essay", presentation: "standard", displayPublishedAt: null },
		published: null,
		updatedAt: 2,
		archivedAt: null,
	},
	{
		documentId: "post-changed",
		documentKey: "post-changed",
		kind: "post",
		slug: "field-notes",
		rank: 1,
		draft: { revisionId: "draft-2", title: "Field Notes from the North Shore", format: "technicalNote", presentation: "technical", displayPublishedAt: 2 },
		published: { revisionId: "published-1", title: "Field Notes from the North Shore", format: "technicalNote", presentation: "technical", displayPublishedAt: 1 },
		updatedAt: 3,
		archivedAt: null,
	},
	{
		documentId: "post-published",
		documentKey: "post-published",
		kind: "post",
		slug: "winter-light",
		rank: 2,
		draft: null,
		published: { revisionId: "published-2", title: "Winter Light", format: "essay", presentation: "standard", displayPublishedAt: 1 },
		updatedAt: 1,
		archivedAt: null,
	},
];

const authors = [{
	documentId: "author-1",
	documentKey: "author-1",
	kind: "author",
	slug: "jesse",
	rank: 0,
	label: "Jesse",
	draftRevisionId: "author-draft",
	publishedRevisionId: "author-published",
	updatedAt: 1,
	archivedAt: null,
}];

const categories = [{
	documentId: "category-1",
	documentKey: "category-1",
	kind: "category",
	slug: "field-notes",
	rank: 0,
	label: "Field notes",
	draftRevisionId: "category-published",
	publishedRevisionId: "category-published",
	updatedAt: 1,
	archivedAt: null,
}];

function body() {
	return {
		version: 1,
		blocks: [{
			type: "paragraph",
			key: "paragraph-1",
			children: [{ type: "text", key: "paragraph-1-text", text: "Morning arrived without ceremony. The horizon held a narrow band of silver while the shore stayed blue and still.", marks: [] }],
		}],
	};
}

function draft(title: string) {
	return {
		kind: "post",
		title,
		slug: "field-notes",
		format: "technicalNote",
		presentation: "technical",
		displayPublishedAt: Date.UTC(2026, 6, 18, 12),
		summary: "A study of weather, distance, and the quiet geometry of the lake.",
		seoTitle: "",
		seoDescription: "",
		brief: "",
		approach: "",
		outcome: "",
		credits: "",
		equipment: [],
		materials: [],
		authorDocumentId: "author-1",
		categories: [{ key: "category-field-notes", documentId: "category-1" }],
		body: body(),
	};
}

function postState() {
	const state = new URLSearchParams(location.search).get("state");
	const published = state === "published";
	const revision = {
		revisionId: published ? "published-2" : "draft-2",
		schemaVersion: 1,
		draft: draft(state === "validation" ? "" : published ? "Winter Light" : "Field Notes from the North Shore"),
		source: "admin",
		createdAt: 1,
	};
	return {
		documentId: published ? "post-published" : "post-changed",
		documentKey: published ? "post-published" : "post-changed",
		kind: "post",
		slug: published ? "winter-light" : "field-notes",
		rank: published ? 2 : 1,
		draft: published ? null : revision,
		published: published ? revision : { ...revision, revisionId: "published-1" },
		updatedAt: 1,
		publishedAt: published ? 1 : null,
		archivedAt: null,
	};
}

function stateFor(ref: { name?: string }, args: unknown) {
	const state = new URLSearchParams(location.search).get("state");
	if (ref.name === "post:listForEditor") {
		if (state === "loading") return { data: undefined, isLoading: true, error: undefined };
		if (state === "error") return { data: undefined, isLoading: false, error: new Error("private provider detail") };
		if (state === "empty") return { data: [], isLoading: false, error: undefined };
		return { data: posts, isLoading: false, error: undefined };
	}
	if (ref.name === "blog:listForEditor") {
		return { data: (args as { kind?: string } | undefined)?.kind === "author" ? authors : categories, isLoading: false, error: undefined };
	}
	if (ref.name === "post:getEditorState") return { data: postState(), isLoading: false, error: undefined };
	return { data: [], isLoading: false, error: undefined };
}

export function useQuery(ref: { name?: string }, args?: unknown) {
	return {
		get data() {
			const resolvedArgs = typeof args === "function" ? (args as () => unknown)() : args;
			return stateFor(ref, resolvedArgs).data;
		},
		get isLoading() {
			const resolvedArgs = typeof args === "function" ? (args as () => unknown)() : args;
			return stateFor(ref, resolvedArgs).isLoading;
		},
		get error() {
			const resolvedArgs = typeof args === "function" ? (args as () => unknown)() : args;
			return stateFor(ref, resolvedArgs).error;
		},
	};
}
