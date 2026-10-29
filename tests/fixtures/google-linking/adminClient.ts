export function useAdminClient() {
	return { mutation: async () => { throw new Error("Unexpected fixture mutation"); } };
}
