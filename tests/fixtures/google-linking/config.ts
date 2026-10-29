import { writable } from "svelte/store";
import { createAuthClient } from "better-auth/svelte";
import type { AdminAuthClient, SessionStoreValue } from "../../../src/lib/config";

export const scenario = new URL(window.location.href).searchParams.get("state") ?? "unlinked";
export const session = writable<SessionStoreValue>({ data: { user: { email: "owner@example.test" } }, isPending: false });
export const requests: Parameters<NonNullable<AdminAuthClient["linkSocial"]>>[0][] = [];

const authClient: AdminAuthClient = {
	useSession: () => session,
	signIn: { email: async () => ({ error: null }), social: async () => ({ error: null }) },
	signUp: { email: async () => ({ error: null }) },
	signOut: async () => session.set({ data: null, isPending: false }),
	changePassword: async () => ({ error: { message: "This preview does not change passwords." } }),
	listAccounts: async () => scenario === "read-error"
		? { error: { message: "Synthetic unavailable response" } }
		: { data: scenario === "linked" ? [{ providerId: "credential" }, { providerId: "google" }] : [{ providerId: "credential" }] },
	linkSocial: async (input) => {
		requests.push(input);
		if (scenario === "redirect") return { data: { url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=fixture&prompt=consent", redirect: false } };
		return { error: { message: "Synthetic response; no Google request was sent." } };
	},
};
if (scenario === "real-client") {
	const client = createAuthClient({ baseURL: window.location.origin });
	authClient.listAccounts = client.listAccounts;
	authClient.linkSocial = client.linkSocial;
}
if (new URL(window.location.href).searchParams.has("legacy")) {
	delete authClient.listAccounts;
	delete authClient.linkSocial;
}

export function getAdminConfig() {
	return {
		siteName: "queen worm", siteUrl: "queenworm.example", fromEmail: "no-reply@queenworm.example",
		isCreator: false, api: { siteEditor: {} }, editor: { siteSettings: true }, authClient,
	};
}
