# Architecture — @jessepomeroy/admin

The package is a shared presentation and host-adapter layer. It deliberately
sits between SvelteKit hosts and their generated Convex APIs without owning a
backend deployment.

## Layers

```text
Consumer SvelteKit app
  ├── Better Auth + tenant/creator authorization
  ├── generated Convex API and deployment
  ├── Resend/gallery Worker credentials
  └── AdminConfig / AdminServerConfig
           ↓
@jessepomeroy/admin
  ├── page and component UI
  ├── normalized feature/session model
  ├── query + mutation transport adapter
  └── server handler factories
           ↓
Convex, Resend, gallery-worker
```

## Client surface

`setAdminConfig` stores the host configuration in Svelte context. Page
components read that context and receive load data through props. Generated
Convex references remain opaque inside the package because each consumer owns
the concrete generated types.

Reactive queries use `convex-svelte`. `useAdminClient` wraps the raw client and
only intercepts mutations when HTTP transport is selected.

Feature gates present the host-supplied tier and role state. A locked state may
offer operator-contact guidance, but it must not initiate billing or choose
tenant, billing-identity, or redirect authority in the browser.

## Server surface

`setServerConfig` stores the server adapter configuration for SvelteKit handler
factories. Server modules may create authenticated Convex HTTP clients, send
Resend email, and forward gallery operations, but credentials and authorization
decisions remain host-owned. A host-supplied `verifyAdmin` callback is required;
shared side-effect handlers fail closed at runtime if it is missing. A scoped
gallery upload-session grant may replace a repeated request-level check after
authorized issuance, but the package still requires verifier configuration
before accepting that grant or contacting the Worker.

Import server factories from `@jessepomeroy/admin/server` so browser bundles do
not traverse server dependencies.

## Auth model

Authentication and authorization are separate:

1. The host extracts the Better Auth token.
2. `createAdminAuthValidator` validates the token through a host-supplied Convex
   `whoami` reference.
3. The host checks site membership or creator role for the requested resource.
4. The browser WebSocket receives a short-lived token for queries.
5. HTTP mutations receive a fresh authenticated Convex client.

The package cannot infer tenant membership from a valid identity alone. Every
shared email, portal, and gallery side-effect factory therefore depends on the
required verifier (directly or through an authorized scoped upload grant)
rather than treating route mounting as authorization.

## Gallery boundary

The gallery UI/controller owns selection and upload orchestration. Server
handlers validate request shape, site/key scope, and authentication before
forwarding to the Worker. The Worker owns upload tokens, R2 operations, portal
token validation, downloads, and prepared archives.

Storage keys are parsed from the right as
`<siteUrl>/<galleryId>/<kind>/<filename>`. The host adapter compares the parsed
site exactly with its configured site (apart from trailing-slash
canonicalization) before either an upload-session grant or request-level admin
authorization can permit a Worker call. A grant is valid only on its receiving
host and for one single-segment gallery ID.

Upload authority remains Worker-owned across both browser transports. The
controller sends the exact `File.size` during presign and retains the returned
short-lived capability separately from the upload URL. A direct PUT sends that
capability to the Worker; if the browser must fall back through the host, the
same capability accompanies the host-scoped upload-session grant. The host
validates tenant/key scope and preserves the body as a fixed-length stream, but
does not substitute the global Worker admin bearer for PUT authority. Current
Vercel/Node hosts use the validated `Content-Length` with streaming `fetch`;
Cloudflare runtimes use native `FixedLengthStream` when available. Neither path
buffers image bytes in the package. Provider request-body limits still apply to
the fallback: Vercel currently limits inbound function bodies to 4.5 MB, so
larger gallery files must use the direct browser-to-Worker PUT path.

This boundary spans three repositories and must be verified end-to-end:

- `admin-dashboard`
- host app (`angelsrest` or `reflecting-pool`)
- `gallery-worker`

## Change discipline

- Prefer deep page/controller interfaces over exposing implementation helpers.
- Add a host-facing option only when hosts genuinely need different behavior.
- Keep internal seams internal until a real alternate implementation exists.
- Contract changes require package tests, build output, and consumer checks.
