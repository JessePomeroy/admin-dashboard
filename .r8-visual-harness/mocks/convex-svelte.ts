const posts = [
	{
		documentId: "post-draft",
		documentKey: "post-draft",
		kind: "post",
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
		kind: "post",
		slug: "field-notes",
		rank: 1,
		draft: {
			revisionId: "draft-2",
			title: "Field Notes from the North Shore",
			format: "technicalNote",
			presentation: "technical",
			displayPublishedAt: 2,
		},
		published: {
			revisionId: "published-1",
			title: "Field Notes from the North Shore",
			format: "technicalNote",
			presentation: "technical",
			displayPublishedAt: 1,
		},
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
		published: {
			revisionId: "published-2",
			title: "Winter Light",
			format: "essay",
			presentation: "standard",
			displayPublishedAt: 1,
		},
		updatedAt: 1,
		archivedAt: null,
	},
];

export function useQuery() {
	const state = new URLSearchParams(location.search).get("state");
	return {
		get data() {
			return state === "loading" || state === "error" ? undefined : state === "empty" ? [] : posts;
		},
		get isLoading() {
			return state === "loading";
		},
		get error() {
			return state === "error" ? new Error("private provider detail") : undefined;
		},
	};
}
