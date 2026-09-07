import { createRawSnippet, mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionStoreValue } from "../src/lib/config";
import AdminLayout from "../src/lib/components/AdminLayout.svelte";
import AuthGuard from "../src/lib/components/AuthGuard.svelte";

vi.hoisted(() => { window.localStorage.setItem("theme", "light"); });

const callbacks = new Set<(value: SessionStoreValue) => void>();
const config = {
 siteName: "Fixture admin", siteUrl: "https://fixture.invalid", isCreator: true, api: {},
 authClient: {
  useSession: () => ({ subscribe(callback: (value: SessionStoreValue) => void) {
   callbacks.add(callback);
   callback({ data: { user: { email: "fixture@example.invalid" } }, isPending: false });
   return () => { callbacks.delete(callback); };
  } }),
 },
};
vi.mock("../src/lib/config", () => ({ getAdminConfig: () => config }));
vi.mock("../src/lib/adminClient", () => ({ useAdminClient: () => ({ mutation: vi.fn() }) }));
vi.mock("convex-svelte", () => ({ useQuery: () => ({ data: { authorized: true } }) }));
const children = createRawSnippet(() => ({ render: () => "<p>Protected fixture content</p>" }));

beforeEach(() => { callbacks.clear(); });
afterEach(() => { document.body.replaceChildren(); });

for (const isCreator of [true, false]) {
 describe(isCreator ? "creator host" : "tenant host", () => {
  for (const [name, component] of [["AdminLayout", AdminLayout], ["AuthGuard", AuthGuard]] as const) {
   it(`${name} releases session observers on every unmount`, async () => {
    config.isCreator = isCreator;
    for (let cycle = 0; cycle < 2; cycle++) {
     const instance = mount(component, { target: document.body, props: { children, data: { adminSession: { status: "unauthenticated" } } } });
     await tick();
     expect(callbacks.size).toBe(1);
     expect(document.body.textContent).toContain("Protected fixture content");
     for (const callback of callbacks) callback({ data: { user: { email: "updated@example.invalid" } }, isPending: false });
     await tick();
     await unmount(instance);
     expect(callbacks.size).toBe(0);
    }
   });
  }
 });
}
