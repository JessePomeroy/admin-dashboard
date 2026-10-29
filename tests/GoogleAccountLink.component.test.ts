import { mount, tick, unmount } from "svelte";
import { writable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GoogleAccountLink from "../src/lib/components/GoogleAccountLink.svelte";
import type { AdminAuthClient } from "../src/lib/config";

const page = writable({ url: new URL("https://fixture.invalid/admin") });
const addToast = vi.fn();
vi.mock("$app/stores", () => ({ get page() { return page; } }));
vi.mock("../src/lib/toast", () => ({ addToast: (...args: unknown[]) => addToast(...args) }));

type Accounts = Awaited<ReturnType<NonNullable<AdminAuthClient["listAccounts"]>>>;
type LinkResult = Awaited<ReturnType<NonNullable<AdminAuthClient["linkSocial"]>>>;
let component: ReturnType<typeof mount> | undefined;
const connectButton = () => document.querySelector<HTMLButtonElement>('button[aria-label="connect google"]');

function render(listAccounts: NonNullable<AdminAuthClient["listAccounts"]>, linkSocial = vi.fn(async (): Promise<LinkResult> => ({ error: { code: "FAILED" } }))) {
	component = mount(GoogleAccountLink, { target: document.body, props: { listAccounts, linkSocial, callbackURL: "/admin" } });
	return linkSocial;
}

beforeEach(() => {
	page.set({ url: new URL("https://fixture.invalid/admin") });
	addToast.mockReset();
});
afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
});

describe("Google account linking", () => {
	it("shows no connect control until an account read confirms Google is absent", async () => {
		const accounts = Promise.withResolvers<Accounts>();
		render(() => accounts.promise);
		await tick();
		expect(connectButton()).toBeNull();
		accounts.resolve({ data: [{ providerId: "credential" }] });
		await vi.waitFor(() => expect(connectButton()?.textContent).toContain("connect google"));
	});

	it("renders no control for a linked Google account", async () => {
		const listAccounts = vi.fn(async () => ({ data: [{ providerId: "credential" }, { providerId: "google" }] }));
		render(listAccounts);
		await vi.waitFor(() => expect(listAccounts).toHaveBeenCalledOnce());
		await tick();
		expect(document.querySelector("button")).toBeNull();
	});

	it.each(["error", "missing", "rejected"])("does not assume an %s account response means unlinked, and permits a retry", async (kind) => {
		let calls = 0;
		render(async () => {
			calls++;
			if (calls > 1) return { data: [{ providerId: "google" }] };
			if (kind === "rejected") throw new Error("Offline");
			return kind === "error" ? { error: { code: "FAILED" } } : {};
		});
		await vi.waitFor(() => expect(document.querySelector('[aria-label="retry google connection check"]')).not.toBeNull());
		expect(connectButton()).toBeNull();
		document.querySelector<HTMLButtonElement>("button")?.click();
		await vi.waitFor(() => expect(calls).toBe(2));
		await tick();
		expect(document.querySelector("button")).toBeNull();
	});

	it("uses explicit authenticated linking, prevents duplicate requests, and recovers from failure", async () => {
		const response = Promise.withResolvers<LinkResult>();
		const linkSocial = vi.fn(() => response.promise);
		render(async () => ({ data: [] }), linkSocial);
		await vi.waitFor(() => expect(connectButton()).not.toBeNull());
		connectButton()?.click();
		connectButton()?.click();
		await tick();
		expect(linkSocial).toHaveBeenCalledOnce();
		expect(linkSocial.mock.calls[0][0]).toMatchObject({ provider: "google", disableRedirect: true });
		const options = linkSocial.mock.calls[0][0];
		expect(new URL(options.callbackURL).pathname).toBe("/admin");
		expect(new URL(options.errorCallbackURL).searchParams.get("google_link")).toBe("error");
		expect(connectButton()?.disabled).toBe(true);
		response.resolve({ error: { code: "FAILED" } });
		await vi.waitFor(() => expect(connectButton()?.disabled).toBe(false));
		expect(addToast).toHaveBeenCalledWith("couldn't open google. try again.");
	});

	it.each(["https://untrusted.example/auth", "javascript:alert(1)"])("rejects an unexpected authorization destination: %s", async (url) => {
		render(async () => ({ data: [] }), vi.fn(async () => ({ data: { url } })));
		await vi.waitFor(() => expect(connectButton()).not.toBeNull());
		connectButton()?.click();
		await vi.waitFor(() => expect(addToast).toHaveBeenCalledWith("couldn't open google. try again."));
		expect(connectButton()?.disabled).toBe(false);
	});

	it.each([
		["access_denied", "google connection canceled. you can try again."],
		["email_doesn't_match", "use the google account with the same email as your admin login."],
	])("explains a returned %s without trusting the URL as proof of connection", async (code, message) => {
		const url = new URL("https://fixture.invalid/admin?google_link=error");
		url.searchParams.set("error", code);
		page.set({ url });
		render(async () => ({ data: [] }));
		await vi.waitFor(() => expect(addToast).toHaveBeenCalledWith(message));
		expect(connectButton()).not.toBeNull();
	});

	it("ignores unrelated callback errors", async () => {
		page.set({ url: new URL("https://fixture.invalid/admin?error=access_denied") });
		render(async () => ({ data: [] }));
		await vi.waitFor(() => expect(connectButton()).not.toBeNull());
		expect(addToast).not.toHaveBeenCalled();
	});

	it("ignores a pending link response after the account control unmounts", async () => {
		const response = Promise.withResolvers<LinkResult>();
		render(async () => ({ data: [] }), vi.fn(() => response.promise));
		await vi.waitFor(() => expect(connectButton()).not.toBeNull());
		connectButton()?.click();
		await unmount(component!);
		component = undefined;
		response.resolve({ data: { url: "https://accounts.google.com/o/oauth2/v2/auth" } });
		await tick();
		expect(addToast).not.toHaveBeenCalled();
	});

	it("checks again when returning through the browser back-forward cache", async () => {
		const listAccounts = vi.fn(async () => ({ data: [] as { providerId: string }[] }));
		render(listAccounts);
		await vi.waitFor(() => expect(connectButton()).not.toBeNull());
		listAccounts.mockResolvedValue({ data: [{ providerId: "google" }] });
		window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
		await vi.waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(2));
		await tick();
		expect(connectButton()).toBeNull();
	});
});
