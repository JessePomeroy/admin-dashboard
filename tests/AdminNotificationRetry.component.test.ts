import { createRawSnippet, mount, tick, unmount } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { writable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminLayout from "../src/lib/components/AdminLayout.svelte";

vi.hoisted(() => { window.localStorage.setItem("theme", "light"); });
const mocks = vi.hoisted(() => ({ mutation: vi.fn(), warn: vi.fn() }));
const page = writable({ url: new URL("https://fixture.invalid/admin/orders") });
const query = new SvelteMap<string, Record<string, boolean>>();
vi.mock("$app/stores", () => ({ get page() { return page; } }));
vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({
		siteName: "Fixture admin", siteUrl: "fixture.invalid",
		api: { notifications: { getUnreadFlags: "getUnreadFlags", markSeen: "markSeen" } },
	}),
}));
vi.mock("../src/lib/adminClient", () => ({ useAdminClient: () => ({ mutation: mocks.mutation }) }));
vi.mock("../src/lib/logger", () => ({ logger: { warn: mocks.warn } }));
vi.mock("convex-svelte", () => ({ useQuery: () => ({ get data() { return query.get("data"); } }) }));

const children = createRawSnippet(() => ({ render: () => "<p>Admin content</p>" }));
let component: ReturnType<typeof mount> | undefined;
async function mountLayout() {
	component = mount(AdminLayout, {
		target: document.body,
		props: { children, data: { adminSession: { status: "unauthenticated" } } },
	});
	await tick();
}
async function navigate(path: string) {
	page.set({ url: new URL(path, "https://fixture.invalid") });
	await tick();
}

beforeEach(() => {
	vi.useFakeTimers();
	mocks.mutation.mockReset().mockResolvedValue(undefined);
	mocks.warn.mockReset();
	query.clear();
	query.set("data", { orders: true, inquiries: true });
	page.set({ url: new URL("https://fixture.invalid/admin/orders") });
});
afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
	vi.useRealTimers();
});

describe("page-seen acknowledgement ownership", () => {
	it("waits for notification readiness and does not repeat successful acknowledgements on query refresh", async () => {
		query.clear();
		await mountLayout();
		expect(mocks.mutation).not.toHaveBeenCalled();
		query.set("data", { orders: true });
		await tick();
		expect(mocks.mutation).toHaveBeenCalledWith("markSeen", { siteUrl: "fixture.invalid", page: "orders" });
		query.set("data", { orders: false });
		await tick();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(mocks.mutation).toHaveBeenCalledTimes(1);
	});

	it("retries a failed active page with backoff and stops after success", async () => {
		mocks.mutation.mockRejectedValueOnce(new Error("Temporary outage"));
		await mountLayout();
		await vi.advanceTimersByTimeAsync(999);
		expect(mocks.mutation).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(mocks.mutation).toHaveBeenCalledTimes(2);
		expect(mocks.mutation).toHaveBeenLastCalledWith("markSeen", { siteUrl: "fixture.invalid", page: "orders" });
		await vi.advanceTimersByTimeAsync(60_000);
		expect(mocks.mutation).toHaveBeenCalledTimes(2);
	});

	it("keeps the same visit across page-store refreshes without overlapping or restarting requests", async () => {
		let reject!: (error: Error) => void;
		mocks.mutation.mockReturnValueOnce(new Promise<void>((_resolve, fail) => { reject = fail; }));
		await mountLayout();
		await navigate("/admin/orders?refresh=1");
		await vi.advanceTimersByTimeAsync(60_000);
		expect(mocks.mutation).toHaveBeenCalledTimes(1);
		reject(new Error("Temporary outage"));
		await vi.advanceTimersByTimeAsync(500);
		await navigate("/admin/orders?refresh=2");
		await vi.advanceTimersByTimeAsync(499);
		expect(mocks.mutation).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(mocks.mutation).toHaveBeenCalledTimes(2);
		await navigate("/admin/orders?refresh=3");
		await vi.advanceTimersByTimeAsync(60_000);
		expect(mocks.mutation).toHaveBeenCalledTimes(2);
	});

	it("caps the retry interval without making concurrent requests", async () => {
		mocks.mutation.mockRejectedValue(new Error("Offline"));
		await mountLayout();
		let attempts = 1;
		for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
			await vi.advanceTimersByTimeAsync(delay - 1);
			expect(mocks.mutation).toHaveBeenCalledTimes(attempts);
			await vi.advanceTimersByTimeAsync(1);
			expect(mocks.mutation).toHaveBeenCalledTimes(++attempts);
		}
	});

	it("cancels scheduled retries on navigation and acknowledges a later visit", async () => {
		mocks.mutation.mockRejectedValueOnce(new Error("Offline"));
		await mountLayout();
		await navigate("/admin/inquiries");
		await vi.advanceTimersByTimeAsync(60_000);
		expect(mocks.mutation).toHaveBeenCalledTimes(2);
		expect(mocks.mutation).toHaveBeenLastCalledWith("markSeen", { siteUrl: "fixture.invalid", page: "inquiries" });
		await navigate("/admin/orders");
		expect(mocks.mutation).toHaveBeenCalledTimes(3);
	});

	it("does not schedule a stale request failure after leaving its page", async () => {
		let reject!: (error: Error) => void;
		mocks.mutation.mockReturnValueOnce(new Promise<void>((_resolve, fail) => { reject = fail; }));
		await mountLayout();
		await navigate("/admin/inquiries");
		reject(new Error("Old request failed"));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(mocks.mutation).toHaveBeenCalledTimes(2);
	});

	it("cancels retries on unmount", async () => {
		mocks.mutation.mockRejectedValue(new Error("Offline"));
		await mountLayout();
		await unmount(component!);
		component = undefined;
		await vi.advanceTimersByTimeAsync(60_000);
		expect(mocks.mutation).toHaveBeenCalledTimes(1);
	});
});
