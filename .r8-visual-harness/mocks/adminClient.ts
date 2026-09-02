export function useAdminClient() {
	return {
		mutation: async () => {
			if (new URLSearchParams(location.search).get("state") === "mutation-error") {
				throw new Error("deterministic mutation failure");
			}
			return { documentId: "post-created" };
		},
	};
}
