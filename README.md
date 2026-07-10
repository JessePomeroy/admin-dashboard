# @jessepomeroy/admin

Shared Svelte 5 admin UI and SvelteKit server adapters for the Angels Rest
photographer platform. The package is consumed by the Angels Rest hub and
client spoke sites such as Reflecting Pool.

## Package boundaries

| Import | Responsibility |
|---|---|
| `@jessepomeroy/admin` | Svelte pages/components, session helpers, feature gates, configuration, and `useAdminClient` |
| `@jessepomeroy/admin/server` | Auth/token factories, HTTP mutation proxy, email handlers, gallery Worker handlers, and server configuration |

The package does not own a Convex deployment, Better Auth configuration,
tenant database, Resend account, or R2 bucket. Each host supplies those through
configuration and generated Convex references.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full host/package boundary.

## Installation

```bash
pnpm add @jessepomeroy/admin
```

The package is published to GitHub Packages. Configure the scope without
committing a token:

```ini
@jessepomeroy:registry=https://npm.pkg.github.com
```

Put a `read:packages` token in user or hosted npm configuration before install.

## Host integration checklist

1. Create an `AdminConfig` with the tenant identity, generated Convex `api`,
   auth client, theme, and optional gallery Worker URL.
2. Create an `AdminServerConfig` with Convex/Resend/Worker credentials plus the
   host's request verifier and Convex token reader.
3. Validate the Better Auth session and tenant/creator membership in the host's
   server layout before returning `getTenantAdminLayoutData(...)`.
4. Initialize `setupConvex`/`setupAuth` in the browser layout for reactive
   authenticated queries.
5. Choose a mutation transport. Current platform hosts use the HTTP proxy with
   a fresh authenticated `ConvexHttpClient` per request.
6. Mount thin route wrappers around the shared page components.
7. Mount only the server handlers required by enabled features.

Reference integrations live in `../angelsrest/src/routes/admin/` and
`../reflecting-pool/src/routes/admin/`.

## Client configuration

```ts
import type { AdminConfig } from "@jessepomeroy/admin";
import { api } from "$convex/api";

export const adminConfig: AdminConfig = {
  siteUrl: "client.example",
  siteName: "client studio",
  fromEmail: "Client Studio <noreply@client.example>",
  isCreator: false,
  api,
  authClient,
  mutationTransport: "http",
  mutationEndpoint: "/api/admin/mutation",
  sanityStudioUrl: "https://client.sanity.studio",
  galleryWorkerUrl: "https://gallery-worker.example.workers.dev",
};
```

If the host's generated Convex module name differs from `AdminAPI`—for example,
`galleries` versus `galleryDelivery`—use a Proxy alias. Never spread Convex's
`api` Proxy; it has no enumerable function namespaces.

## Server configuration

```ts
import type { AdminServerConfig } from "@jessepomeroy/admin/server";

export const adminServerConfig: AdminServerConfig = {
  ...adminConfig,
  convexUrl: publicEnv.PUBLIC_CONVEX_URL ?? "",
  resendApiKey: privateEnv.RESEND_API_KEY ?? "",
  galleryAdminSecret: privateEnv.GALLERY_ADMIN_SECRET ?? "",
  verifyAdmin: adminAuth.verifyRequest,
  getConvexToken: adminAuth.getTokenFromRequest,
};
```

`createAdminAuthValidator` validates that the Better Auth JWT maps to a Convex
identity. That is authentication, not tenant or creator authorization. Hosts
must check stored membership for the data or external side effect being
requested.

## Query and mutation transport

Every package mutation must use `useAdminClient()`, not `useConvexClient()`.

- `"websocket"` sends mutations through the browser Convex connection and
  requires that connection to be authenticated.
- `"http"` POSTs `{ name, args }` to the configured mutation endpoint. The
  supplied `createAdminMutationHandler` authenticates the request, resolves the
  generated function reference, creates a fresh Convex HTTP client, and forwards
  the mutation.

Queries always use `convex-svelte`'s reactive WebSocket path. Current hosts
manually wire `setupAuth` to avoid a historical session-pause race during
SvelteKit client navigation.

## Pages and tiers

| Page | Basic | Full | Creator-only behavior |
|---|:---:|:---:|---|
| Dashboard, orders, inquiries, galleries | Yes | Yes | Platform-wide summaries where configured |
| CRM, board, invoices, quotes, contracts, emails, messages | No | Yes | Cross-tenant capabilities remain separately gated |
| Platform | No | No | Yes |

Exported page components are `DashboardPage`, `OrdersPage`, `InquiriesPage`,
`GalleriesPage`, `CrmPage`, `BoardPage`, `InvoicingPage`, `QuotesPage`,
`ContractsPage`, `EmailsPage`, `MessagesPage`, and `PlatformPage`.

## Server handlers

`@jessepomeroy/admin/server` exports factories for:

- invoice, quote, and contract email delivery
- portal-token creation
- the universal admin mutation proxy
- Better Auth JWT validation and browser token delivery
- gallery upload-session, presign, upload, process, delete, and bulk-delete
  routes

Gallery handlers bridge the host to `gallery-worker`. The host owns tenant
authorization; the Worker owns R2 key validation, upload tokens, object access,
and portal-token verification.

## Development

```bash
pnpm check
pnpm test
pnpm build
```

`pnpm build` writes the publishable `dist/` package.

## Release

Releases are currently manual:

1. Choose a semver bump: patch for fixes, minor for additive public API, major
   for breaking behavior or types.
2. Update `package.json` and build.
3. Run the full checks.
4. Publish to GitHub Packages with `pnpm publish`.
5. Update consumers only after the package is available.

For unpublished cross-repo work, consumers may temporarily use
`link:../admin-dashboard`; do not commit that link unless the change explicitly
requires a coordinated local-development branch.
