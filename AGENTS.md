# AGENTS.md — @jessepomeroy/admin

Canonical rules for the shared Svelte 5 admin package.

## Role and boundaries

- The package provides shared admin UI **and** SvelteKit server adapters.
- It does not own authentication configuration, a Convex deployment, tenant
  data, email credentials, or gallery storage.
- Hosts provide generated Convex API references and enforce site/creator
  authorization.
- Client exports belong at `@jessepomeroy/admin`; server-only exports belong at
  `@jessepomeroy/admin/server`.

See `ARCHITECTURE.md` before changing configuration, auth, mutation transport,
or server handlers.

## Package architecture

- `src/lib/index.ts`: public Svelte/client surface
- `src/lib/server.ts`: public server-only surface
- `src/lib/config.ts`: host contracts and Svelte/server configuration
- `src/lib/adminClient.ts`: mutation-transport proxy
- `src/lib/adminSession.ts`: normalized server/client session shapes
- `src/lib/pages/`: page-level UI
- `src/lib/components/`: reusable UI
- `src/lib/server/`: auth, Convex, email, gallery, and error adapters

## Svelte conventions

- Use Svelte 5 runes and context. Do not introduce a second config store.
- Every mutation call uses `useAdminClient()`. Queries may use `useQuery`.
- Page components consume host-provided data/config; they do not import a
  consumer's generated API or environment.
- Keep Convex function references opaque (`FnRef`) inside this cross-project
  package. Consumer-generated types remain authoritative at the host boundary.
- Preserve the lowercase, CSS-variable-driven admin design system.

## Authentication and authorization

- `createAdminAuthValidator` proves a token maps to a Convex identity.
- Identity validity alone is not tenant or creator authorization.
- Server handler factories call the configured verifier, but the host must
  supply a verifier appropriate for the side effect.
- Do not silently make `verifyAdmin` optional on a newly destructive handler.
- Do not expose server helpers through browser imports; use the `/server`
  export.

## Mutation transport

- `"websocket"` is supported for hosts with a stable authenticated Convex
  browser connection.
- `"http"` routes mutations through the universal SvelteKit proxy and a fresh
  authenticated Convex HTTP client.
- New mutations must work through `useAdminClient` without transport-specific
  call-site branches.
- Do not add per-mutation consumer endpoints when the universal proxy suffices.

## Gallery delivery

- Keep R2 key parsing and upload policy in the existing gallery modules.
- Host handlers must scope requests to the configured site before calling the
  Worker.
- Preserve streaming request/response bodies; do not buffer large images in the
  package.
- Changes to handler contracts require coordinated verification in Angels Rest,
  Reflecting Pool, and `gallery-worker`.

## Checks

```bash
pnpm check
pnpm test
pnpm build
```

The build writes `dist/`; tests/checks should pass before release.

## Release rules

- Patch: compatible bug fix.
- Minor: additive public API/config/handler.
- Major: breaking public API, behavior, or required host migration.
- Publish before changing consumer version ranges.
- Do not commit, publish, or update consumers without explicit permission.
- Do not add AI-assistant co-author trailers.

## Consumers

- `../angelsrest`: creator hub, HTTP mutations, manually authenticated queries
- `../reflecting-pool`: tenant spoke, HTTP mutations, manually authenticated
  queries

Treat both as required integration surfaces for auth, page, and handler changes.
