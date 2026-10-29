import { createAuthClient } from "better-auth/svelte";
import { createRawSnippet, mount, tick, unmount } from "svelte";
import { afterEach, expect, it, vi } from "vitest";
import AdminLayout from "../src/lib/components/AdminLayout.svelte";

vi.hoisted(() => { window.localStorage.setItem("theme", "light"); });
const requests: { path: string; body: string | undefined }[] = [];
const client = createAuthClient({
	baseURL: "https://fixture.invalid",
	fetchOptions: {
		customFetchImpl: async (input, init) => {
			const path = new URL(String(input)).pathname;
			requests.push({ path, body: typeof init?.body === "string" ? init.body : undefined });
			if (path === "/api/auth/list-accounts") return Response.json([{ providerId: "credential" }]);
			if (path === "/api/auth/link-social") return Response.json({ error: "fixture rejection" }, { status: 400 });
			throw new Error(`Unexpected fixture request: ${path}`);
		},
	},
});
const config = {
	siteName: "Fixture admin", siteUrl: "https://fixture.invalid", isCreator: true, api: {},
	authClient: {
		listAccounts: client.listAccounts,
		linkSocial: client.linkSocial,
		useSession: () => ({ subscribe(callback: (value: { data: { user: { email: string } }; isPending: boolean }) => void) {
			callback({ data: { user: { email: "owner@example.test" } }, isPending: false });
			return () => {};
		} }),
	},
};
vi.mock("../src/lib/config", () => ({ getAdminConfig: () => config }));
vi.mock("../src/lib/adminClient", () => ({ useAdminClient: () => ({ mutation: vi.fn() }) }));
vi.mock("convex-svelte", () => ({ useQuery: vi.fn() }));

let component: ReturnType<typeof mount> | undefined;
afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
	requests.length = 0;
});

it("uses the real Better Auth path-proxy methods from the shared sidebar", async () => {
	component = mount(AdminLayout, {
		target: document.body,
		props: {
			children: createRawSnippet(() => ({ render: () => "<p>Admin content</p>" })),
			data: { adminSession: { status: "authorized", email: "owner@example.test", tier: "full", isCreator: true } },
		},
	});
	await tick();
	const button = () => document.querySelector<HTMLButtonElement>('button[aria-label="connect google"]');
	await vi.waitFor(() => expect(button()).not.toBeNull());
	expect(requests.map(request => request.path)).toEqual(["/api/auth/list-accounts"]);
	button()?.click();
	await vi.waitFor(() => expect(requests).toHaveLength(2));
	expect(requests[1].path).toBe("/api/auth/link-social");
	expect(JSON.parse(requests[1].body ?? "null")).toMatchObject({ provider: "google", disableRedirect: true });
	await vi.waitFor(() => expect(button()?.disabled).toBe(false));
});
