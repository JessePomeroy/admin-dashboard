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

## Document email delivery boundary

Invoice, quote, and contract sends cross two external boundaries: the host's
Convex deployment and Resend. The browser assigns one UUID to an explicit send
action and reuses it for bounded transport retries. Before Resend is contacted,
the host-authenticated Convex journal freezes the exact tenant, document,
client, recipient, subject, HTML, plain text, portal capability, and provider
idempotency key. A fixed claim lease prevents a second server request from
blindly repeating an ambiguous provider call.

Provider rejection is terminal `failed`. Network ambiguity remains attached to
the original frozen action: a bounded reconciliation claim may replay the same
Resend idempotency key within its validity window, while a known provider
message ID resumes only local completion. Convex completion atomically writes
the sent email/activity records and advances only a draft document to `sent`,
preserving later lifecycle states and existing timestamps. The package never
reconstructs a frozen envelope on retry and never treats a resolved Resend error
or missing message ID as success.

The browser's UUID and session storage are convenience, not cross-tab
authority. Convex transactionally excludes another open attempt for the same
tenant document. When `prepare` returns `blocked`, the server adopts that full
canonical row, verifies its document scope, and reuses its exact frozen
idempotency key and provider tags. An attempt conflict is never downgraded to a
definite client error that could clear an ambiguous tracker.

Recovery uses a separate browser-safe projection and three host-mounted adapters.
The static document-discovery adapter returns only the canonical open attempt
for an exact tenant document, allowing a new browser session to recover without
knowing an attempt ID. The exact-attempt and resolution adapters retain their
fixed dynamic paths.
Detail views first surface a valid session-tracked attempt, then reconcile it
with document discovery. A terminal exact read is rendered as confirmed,
rejected, or closed-without-send and clears the tracker by document and attempt
ID before any selected-record UI guard.
The GET adapter returns recipient, subject, coarse state, deadlines, and
server-computed action flags; it never returns message bodies, portal or claim
authority, provider keys/tags, or log IDs. The resolve adapter injects the
configured tenant and accepts only an expected document plus either provider
acceptance evidence or the exact high-friction not-accepted decision. Backend
eligibility and stable coded conflicts remain authoritative. A sent resolution
finishes normal lifecycle effects; a not-accepted resolution closes the old
attempt as `resolved_not_sent` without sending. Client cleanup compares the
terminal attempt ID before removing memory or session storage, and no ambiguous
state is automatically cleared or replaced.

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

## Catalog private-editor upload boundary

The additive catalog private-editor server factories are deliberately narrower
than the general CMS media bridge and currently admit only the production Angels
Rest contract. The browser host authenticates an exact same-origin request and
holds two purpose-specific server bearers: one for the Convex durable journal
and one for the Worker's storage-completion route. Convex owns Worker prepare,
the control credential, immutable declaration binding, raw continuations,
leases, receipt reconciliation, and the eventual editor-safe asset projection.
The Worker owns upload-token enforcement, private storage evidence, and its own
receipt producer.

Prepare calls only the fixed journal begin action. It projects the returned
upload token onto the Worker's configured fixed source URL and drops operation
identity and replay state. Complete first reconciles the journal, claims only a
storage continuation and lease, invokes only the fixed Worker storage route,
ACKs the outcome, and reconciles again. It never calls inspection or accepts an
inspection credential. Browser responses contain only upload authority, coarse
pending state, or the closed verified asset metadata union; they never contain
hashes, object keys, operation facts, continuations, leases, or receipts.

The direct browser upload wire contract is one `PUT` to the returned `uploadUrl`
without changing it or adding a query string, with redirects treated as errors.
The request sends
`X-CMS-Editor-Upload-Token: <uploadToken>`, the declaration's exact
`Content-Type`, and the original `File`/`Blob` as the entire body. Its
generated `Content-Length` and actual body length must both equal the declared
`sizeBytes`; browser code must not set `Content-Length` itself. It omits
credentials, authorization, encodings, ranges, and every storage or inspection
continuation. Continuations are server-runner authority and never belong in a
browser URL, header, or body.

The optional config is purpose-separated and contains exactly a Convex journal
origin, host-journal secret, the literal queryless production CMS Worker origin
`https://cms-media-worker.thinkingofview.workers.dev`, a storage-caller secret,
and the browser origin. Alternate Worker hosts, paths, queries, and userinfo fail
closed before browser URL projection or storage authority can leave the host.
The two secrets must be distinct; handlers fail closed before reading the request
body or invoking host auth when they are equal. The config must not grow a Worker
control secret, inspection claim secret, receipt-producer credential, sealing
root, or broad tenant credential.

All URLs are HTTPS origins combined with fixed queryless paths; requests use
manual redirect handling, bounded bodies, bounded response reads, and finite
timeouts. Complete has a 52-second overall deadline with 6-second status,
6-second claim, 24-second Worker, 6-second ACK, and 6-second reconciliation
budgets. That ordering preserves ACK/reconciliation time after an ambiguous
Worker response while returning retryable before a host configured for the
required 60-second maximum can terminate it. Prepare remains bounded by a
25-second overall deadline. Consumers must mount complete on Node 24 with
`maxDuration >= 60`; the factory itself never claims or invokes inspection.
Node 24's lone generated `Sec-Fetch-Mode: cors` is accepted by the Worker
classifier merged in gallery-worker commit `6de645b2`, while the adapter forwards
no browser headers and the Worker continues to reject browser context.

## Change discipline

- Prefer deep page/controller interfaces over exposing implementation helpers.
- Add a host-facing option only when hosts genuinely need different behavior.
- Keep internal seams internal until a real alternate implementation exists.
- Contract changes require package tests, build output, and consumer checks.
