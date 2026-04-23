# AGENTS.md — @jessepomeroy/admin

Rules for working on this Svelte 5 admin-dashboard library package.

## Project Context

- **Package name:** `@jessepomeroy/admin`
- **Current version:** `1.1.0` (not yet published — v1.0.2 is latest on npm; publish before consumers bump their deps past link)
- **Purpose:** Shared admin dashboard UI for multi-tenant photographer CRM platform. Consumed by `angelsrest` (creator's site) and `reflecting-pool` (first client template), with more to come.
- **Stack:** Svelte 5 (runes) + Convex client + Better Auth (via consumer). No server runtime — pure client library.

## Package architecture

- Entry: `src/lib/index.ts` — re-exports everything public.
- Consumers set `AdminConfig` via `setAdminConfig(config)` in their `+layout.svelte`. All pages read it via `getAdminConfig()` (Svelte context under the hood).
- API refs (`config.api`) are typed opaquely (`FnRef = any`) — consumer passes their generated `api` object. Typing is enforced at the consumer boundary, not inside this package.

## Mutation transport — READ THIS BEFORE TOUCHING MUTATIONS

The package supports two mutation transports via `AdminConfig.mutationTransport`:

- `"websocket"` (default): `client.mutation(...)` fires over the authenticated Convex WebSocket. Requires the consumer to wire auth into the Convex client (e.g. via `createSvelteAuthClient`).
- `"http"`: `client.mutation(...)` POSTs to `AdminConfig.mutationEndpoint` (default `/api/admin/mutation`). The consumer must implement that route as a server-side proxy that holds the auth cookie and forwards via `ConvexHttpClient`.

**Every admin page calls `useAdminClient()` (from `src/lib/adminClient.ts`), NOT `useConvexClient()` directly.** `useAdminClient` is a `Proxy` over the raw Convex client — it intercepts `.mutation()` when transport is `"http"` and passes through everything else (queries, actions, connection state). This means:

- New pages **must** use `useAdminClient()`, not `useConvexClient()`.
- Mutation call sites look identical regardless of transport: `await client.mutation(api.foo.bar, args)`.
- Why the indirection: `@mmailaender/convex-better-auth-svelte@0.7.3` has a permanent WebSocket pause bug on SvelteKit client-side navigation when paired with `better-auth@1.5.x`. `angelsrest` works around it by running an unauthenticated browser WebSocket and routing mutations through an HTTP proxy. See the Obsidian note at `~/Documents/quilt/00_inbox/2026-04-23 PR candidate — convex-better-auth-svelte pause bug.md` for full context + the upstream PR plan (deferred).

## Svelte conventions (in this package)

- Svelte 5 runes everywhere: `$state`, `$derived`, `$effect`, `$props`. No `writable()` stores except where Better Auth nanostores cross the boundary.
- Context for shared config (`setAdminConfig`/`getAdminConfig`), not stores.
- Page components accept `{ data }` from SvelteKit page loaders.
- `useXxx()` naming for context-reading helpers — matches `@mmailaender/convex-svelte` (`useConvexClient`, `useQuery`). Slightly React-flavored but locally consistent.
- Keep `FnRef = any` for Convex API references (see `src/lib/config.ts` note). Tight typing is impractical across the consumer boundary and typing is enforced at the consumer's generated `api`.

## Running checks

```bash
cd ~/Documents/work/admin-dashboard
pnpm build      # svelte-package -> dist/
pnpm check      # svelte-check
pnpm test       # vitest
```

## Releasing

- Bump `package.json` version per semver:
  - new public API / config field → minor (1.1.0 → 1.2.0)
  - behavior change / rename → major
- `pnpm build` regenerates `dist/`.
- `pnpm publish` (requires npm auth).
- Consumers (`angelsrest`, `reflecting-pool`, etc.) then bump their dep from `^1.X.Y` and `pnpm install`.
- For local dev before publishing, consumers should use `"@jessepomeroy/admin": "link:../admin-dashboard"`.

## Consumer list (keep in sync on breaking changes)

- `~/Documents/work/angelsrest` — on `mutationTransport: "http"` pattern as of 2026-04-23.
- `~/Documents/work/reflecting-pool` — needs the same migration (see catch-up prompt in the Obsidian note).

## Don't

- Don't re-wire the browser Convex WebSocket to Better Auth (`createSvelteAuthClient`) without consulting the pause-bug note. It's a known trap.
- Don't add per-mutation `+server.ts` endpoints in consumers — the universal `/api/admin/mutation/+server.ts` handles any mutation by name. Keep the pattern uniform.
- Don't add emojis to files unless the user explicitly asks.
