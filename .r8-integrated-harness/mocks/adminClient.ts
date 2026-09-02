export function useAdminClient() {
	return {
		mutation: async (ref: { name?: string }) => {
			const state = new URLSearchParams(location.search).get("state");
			if (state === "mutation-error") {
				throw new Error("Could not save this draft. Your edits are still here.");
			}
			if (state === "saving") {
				await new Promise(() => {});
			}
			if (ref.name === "post:saveDraft") return { revisionId: "revision-saved" };
			if (ref.name === "post:publish") return { revisionId: "revision-published" };
			return { documentId: "post-created" };
		},
	};
}
