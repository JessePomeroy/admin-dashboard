---
"@jessepomeroy/admin": major
---

Remove retired compatibility paths so the package depends only on the contracts current hosts use.

- **Mutations always use the HTTP proxy.** `useAdminClient()` now always POSTs mutations to `mutationEndpoint` (default `/api/admin/mutation`). The WebSocket mutation transport is gone. `mutationTransport` is kept only as a deprecated `"http"` literal with no runtime effect, so `"websocket"` is now a type error.
- **Inquiries require `api.inquiries.listPaginated`.** `InquiriesPage` no longer reads or patches a host-supplied `data.inquiries` list. Its `data` prop is now `{ adminSession? }`.
- **Delivery galleries require `api.galleryDelivery.listBySitePaginated`.** The unpaginated `listBySite` fallback and its client-side status filter are removed. `AdminAPI["galleryDelivery"]` no longer has `listBySite`, and `createStandardAdminAPI` no longer binds `galleries.listBySite`.
- **Products use only the catalog graph API.** The single-print `api.catalogProducts` editor (graph version 1) and the `catalogProducts` field on `AdminAPI` are removed. The Products workspace turns on only when `catalogProductGraphs` has `listForEditor`, `getEditorState`, `createDraft`, `saveDraft` and `discardDraft`. The public helper `catalogProductDraftFromRevision` and the types `CatalogProductVariantProjection` and `CatalogRevisionSource` are removed. `CatalogProductEditorRevision` now describes only the graph projection: `schemaVersion: 2`, with no top-level v1 title, price or variant fields. `CatalogProductEditorState.graphVersion` is `2 | undefined`. `copyCatalogProductDraft` accepts only a draft form.
- **`emailLog` is no longer part of the API surface.** The package never called `emailLog.create`. `AdminAPI.emailLog` and the `emailLog` requirement and binding in `createStandardAdminAPI` / `StandardAdminApiSource` are removed, so the backend can retire `emailLog.list` and `emailLog.create`.

### Migration

The steps are the same for every host (Angels Rest hub, queenworm):

1. **Mutation transport:** no change is needed for hosts that already set `mutationTransport: "http"`. You may delete the line. Make sure `createAdminMutationHandler` is mounted at `mutationEndpoint`, or at `/api/admin/mutation` if unset. A host that set `"websocket"` or omitted the field must mount that route before upgrading. Browser fixtures that set `mutationTransport: "websocket"` so a fake client would receive mutations must drop that line and answer `POST /api/admin/mutation` instead, for example from their `fetch` stub. Angels Rest's handbook and editor-document-pane fixtures need this change.
2. **Inquiries:** bind `inquiries.listPaginated`. `createStandardAdminAPI` already does this. Stop returning the `inquiries: []` placeholder from `src/routes/admin/inquiries/+page.server.ts`, and drop any `PageServerLoad<{ inquiries: InquiryUI[] }>` annotation. Extra load data still type-checks, so this is cleanup rather than a compile blocker.
3. **Delivery galleries:** bind `galleryDelivery.listBySitePaginated`. `createStandardAdminAPI` already does this. Remove any hand-written `galleryDelivery.listBySite` binding, and update tests that assert it.
4. **Products:** delete any `catalogProducts: { listForEditor, getEditorState, createDraft, saveDraft, discardDraft, remove }` capability block, such as the one in Angels Rest's `src/lib/config/adminPlatformCapabilities.ts`. With `satisfies AdminAPI`-style checks it is now an excess-property type error. `createStandardAdminAPI` already provides `catalogProductGraphs`, which the editor already preferred. Fixtures that build `CatalogProductEditorRevision` values must drop the top-level v1 fields, such as `title` and `variantCount`, and keep `draft`.
5. **`emailLog`:** remove any hand-written `emailLog` binding from objects typed as `AdminAPI`. Nothing in the package reads it.
