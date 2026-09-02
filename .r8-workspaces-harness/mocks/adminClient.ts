export function useAdminClient() {
	return { mutation: async () => ({ revisionId: "saved-revision" }) };
}
