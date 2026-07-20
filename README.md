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

### Private product drafts

The optional Products workspace is capability-driven. It appears only when the
host declares `editor.products` and provides a complete private-draft API.
Legacy hosts may provide `catalogProducts.listForEditor`, `getEditorState`,
`createDraft`, `saveDraft`, and `discardDraft` for the single-print editor.
Hosts using the catalog graph model may instead provide the same function names
under `catalogProductGraphs`; the list page can read back all enabled product
kinds. V2 single-print drafts can edit identity, sale settings, print options,
and ordered variants while preserving imported media and print-source
relations. Other V2 product kinds remain staged read-back views until their
specific editors land.

```ts
export const adminConfig: AdminConfig = {
  // existing host configuration
  editor: {
    products: {
      enabledKinds: ["print", "print_set", "postcard"],
    },
  },
  api: new Proxy(api, {
    get(target, property, receiver) {
      if (property === "catalogProductGraphs") return api.catalogProductGraphs;
      return Reflect.get(target, property, receiver);
    },
  }),
};
```

The V2 graph capability is still private and publish-gated by the host. It does
not expose a publish mutation, public-by-slug query, preview,
checkout/provider identifiers, or public provider switch by itself. Sanity may
remain the live public catalog until a later host slice deliberately connects
publication and print-quality source media.

## Server configuration

```ts
import type { AdminServerConfig } from "@jessepomeroy/admin/server";

export const adminServerConfig: AdminServerConfig = {
  ...adminConfig,
  convexUrl: publicEnv.PUBLIC_CONVEX_URL ?? "",
  resendApiKey: privateEnv.RESEND_API_KEY ?? "",
  galleryAdminSecret: privateEnv.GALLERY_ADMIN_SECRET ?? "",
  cmsMediaWorkerUrl: privateEnv.CMS_MEDIA_WORKER_URL ?? "",
  cmsMediaTenantSecret: privateEnv.CMS_MEDIA_TENANT_SECRET ?? "",
  cmsMediaConvexSiteUrl: privateEnv.CMS_MEDIA_CONVEX_SITE_URL ?? "",
  cmsMediaDeletionCompletionSecret:
    privateEnv.CMS_MEDIA_DELETION_COMPLETION_SECRET ?? "",
  verifyAdmin: adminAuth.verifyRequest,
  getConvexToken: adminAuth.getTokenFromRequest,
};
```

`createAdminAuthValidator` validates that the Better Auth JWT maps to a Convex
identity. That is authentication, not tenant or creator authorization. Hosts
must check stored membership for the data or external side effect being
requested. `verifyAdmin` is therefore required: shared side-effect handlers fail
closed before Convex, Resend, or Gallery Worker work if runtime configuration
omits it. Gallery upload-session grants may replace repeated cookie checks only
after this verifier authorized grant issuance; they still fail closed if the
verifier is later removed. Return `false` or throw to reject a request; do not
substitute route-presence or identity validity for tenant-aware authorization.

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

Locked features show operator-contact guidance. Feature gates present the
host-supplied tier and role state; the package does not initiate subscription
checkout or accept browser-selected tenant, billing, or redirect authority.
CRM subscription onboarding and access changes are operator-run processes.

## Server handlers

`@jessepomeroy/admin/server` exports factories for:

- invoice, quote, and contract email delivery
- portal-token creation
- the universal admin mutation proxy
- Better Auth JWT validation and browser token delivery
- gallery upload-session, presign, upload, process, delete, and bulk-delete
  routes
- CMS media upload/process and permanent asset-deletion routes

`createCmsMediaDeleteHandler` accepts exactly `{ id }` from the browser. It
authenticates the admin, asks Convex to mark that host tenant's unreferenced
asset for deletion, validates the complete fixed-key manifest, removes the
objects through the tenant-scoped CMS media Worker, and only then calls the
Convex `.site` completion action. The host supplies the site identity, both
server bearers, and the generated `portfolioEditor.requestDeletion` reference;
none may come from browser input. A Worker or completion failure leaves the
Convex record in its retryable `deleting` state. Mount this permanent operation
separately from editor controls that merely remove an image placement.

Gallery handlers bridge the host to `gallery-worker`. The host owns tenant
authorization; the Worker owns R2 key validation, upload tokens, object access,
and portal-token verification. Before forwarding any gallery operation, the
server adapter parses the Worker's right-to-left storage-key shape and requires
its exact site namespace to match the host's configured `siteUrl`. Upload-session
grants are bound to that same receiving host and to one single-segment gallery
ID. Only trailing slashes are canonicalized; site identity stays case-sensitive.
New gallery presigns carry the exact positive file size and retain the Worker's
short-lived upload capability separately from its URL. Direct browser PUT and
same-origin host fallback send that same capability; the host proxy preserves
the streamed length and does not replace upload authority with the global
Worker admin bearer. Host-provider request limits still apply: Vercel currently
limits inbound function bodies to 4.5 MB, so larger gallery files require the
direct browser-to-Worker path.

## Development

```bash
pnpm check
pnpm test
pnpm build
```

`pnpm build` writes the publishable `dist/` package.

## Release

Releases use a dedicated version-only PR after the implementation has merged:

1. Choose a semver bump: patch for fixes, minor for additive public API, major
   for breaking behavior or types.
2. Change only the version in `package.json` and run the full checks.
3. Merge only after PR CI passes. The main-branch publish workflow builds and
   publishes to GitHub Packages; do not also publish locally.
4. Verify the registry version and publish workflow.
5. Update consumers only after the package is available.

For unpublished cross-repo work, consumers may temporarily use
`link:../admin-dashboard`; do not commit that link unless the change explicitly
requires a coordinated local-development branch.
