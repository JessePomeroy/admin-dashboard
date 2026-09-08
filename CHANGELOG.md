# @jessepomeroy/admin

## 6.0.1

### Patch Changes

- 5ba30e3: Keep portfolio drafts, recovery data and asynchronous editor actions scoped to the selected gallery. Preserve unsaved work across navigation and ignore completed operations from a destroyed editor instance.

## 6.0.0

### Major Changes

- 1353cdc: CRM requires `api.crm.listClientsWithTags`, wired to the new paginated Convex query. Client lists use snapshot cursor pages of at most 50 rows with tags included, next/previous/refresh controls, and refresh after local mutations; detail tags/activity use reactive subscriptions instead of imperative reload caches. Existing `listClients` remains available for other consumers.

### Patch Changes

- 4b69d4d: Restore the previous body scroll policy when an admin or editor drawer closes or its layout unmounts, and preserve existing overflow styles while both drawers are closed.
- eabc891: Share modal keyboard, focus restoration and scroll cleanup between the Admin shell and media picker while preserving their styling and global toast access.
- 9f96fb8: Retry failed page-seen notification acknowledgements with bounded backoff while the page remains active. Cancel retry timers on navigation or layout teardown, and do not let a stale request schedule retries for a later visit.
- 6e984cb: Separate pure authored document-email rendering from durable send orchestration while preserving exact HTML, text, variable snapshots, and portal action placement.
- f0ffda1: Use one validated integer-cent invoice calculation across default and authored emails, invoice forms and displays, and pending dashboard totals. Positive fractional quantities are supported without a precision cap; each line is rounded before subtotal, then percentage tax is rounded once. Numeric form drafts convert unit dollar prices to cents first, show invalid values without crashing, and permit clearing tax to zero.
- c8041aa: Add previous and next navigation to the shared editor media picker, retaining one active library page plus existing attachment and local-upload reads. Bound library reads and require an explicit same-cursor retry if a reactive page becomes incomplete, rather than skipping unread assets. Show loading, retryable errors, and empty ready-image pages without hiding navigation to older assets. Preserve selected/deleting states and keyboard focus when navigation disables a control.
- 95de97d: Prevent authenticated delivery-gallery image responses from inheriting public Worker cache policies by enforcing `private, no-store` in the host proxy while preserving streamed bodies and image metadata.
- ed795d7: Remove the unused internal private-asset replacement capability projection while preserving configured uploads, publication guards and public host configuration.
- 64c21e0: Consolidate product artwork and download upload lifetimes in an internal session, preserving one-PUT verification, draft identity checks, and cancellation while discarding stale responses after navigation or teardown.
- 4282840: Keep quote conversion results, errors, and pending state attached to their initiating detail selection so closing, switching, or reopening a quote cannot receive an older conversion's UI updates.
- d979067: Remove three internal validation helpers with no production callers and their implementation-only tests. Public trimString and validateFilename exports and their behavior remain unchanged.
- 01bc881: Share editor web-media reads, uploaded-asset state and merge rules across About, Modeling, Portfolio and Product. Preserve picker scope, current query contracts and product navigation cleanup.
- a4ad205: Use precise package-local invoice and contract form payloads, share each document's create mutation mapping between draft and send actions, and remove duplicate contract form assembly. Preserve optional fields, fractional invoice calculations, cent conversions, and separate email overrides.

## 5.1.1

### Patch Changes

- 6b2c10e: Release AdminLayout and AuthGuard session subscriptions when their components are destroyed, preserving existing session and authorization behavior.

## 5.1.0

### Minor Changes

- 49e73e6: Reuse the shared accessible modal shell for email templates and platform-client details while preserving responsive sizing. Remove the unreachable platform-client creation dialog and direct users to operator onboarding.

  AdminModal adds an optional accessible label and CSS sizing overrides; existing defaults remain unchanged.

- f38bd95: Add the lightweight `@jessepomeroy/admin/theme` entry point for the existing `isDark` store. The root export remains available and shares the same store instance.

  The store now owns the document's dark class as well as preference persistence, so public and admin consumers stay synchronized without a mounted admin layout. Unrecognized preferences fall back to the system setting, and denied storage reads or writes no longer prevent theme initialization or switching. Server imports remain free of browser side effects.

### Patch Changes

- 017d50f: Apply client category/status filters in the CRM query and label bounded lists and partial statistics.
- d04bcd2: Remove the unsupported admin-email edit field from platform client details while retaining the read-only list.
- bda205c: Share email-template fields and preview between create and edit dialogs while preserving their separate lifecycle and save behavior.
- c015e53: Share identical input/focus styles across 13 components and field group/label styles across 10, retaining Svelte scoping, existing backgrounds and local layout overrides.
- 2c55c92: Share singleton-editor draft recovery and save coordination. Serialize saves with publication/discard, retain edits made during requests, and preserve device drafts across offline and storage failures.

## 5.0.3

### Patch Changes

- 6760d94: Keep Product Editor save, discard and restart results scoped to the operation
  that initiated them. Ignore late successes and errors after navigation, including
  returning to the same product, so they cannot overwrite current edits or another
  save's state. Preserve existing draft query-echo and conflict behavior.

## 5.0.2

### Patch Changes

- 6e449cf: Concentrate shared Product Editor draft-load initialization in one page-local
  function. Preserve distinct legacy, graph and no-editable-draft projections,
  query-update guards, local edits, publication and upload behavior.

## 5.0.1

### Patch Changes

- 051aeb7: Reuse the identical resolved and terminal email-recovery handling in invoice and
  contract pages. Preserve exact-attempt cleanup, newer-attempt and selected-document
  guards, and status updates; quote-specific recovery feedback is unchanged.

## 5.0.0

### Major Changes

- fb548df: Remove retired Sanity project fields, Studio links and `AdminConfig.sanityStudioUrl`.
  Platform-client create/edit forms now expose only current platform fields; the
  public `PlatformClient` type no longer includes `sanityProjectId`. Remove those
  two properties from host configuration and client objects when upgrading.
  Existing imported revision provenance remains supported.

## 4.0.0

### Major Changes

- 4507b0b: Keep server-only configuration, handlers, and provider clients exclusively on
  the `@jessepomeroy/admin/server` export. Browser consumers continue to use the
  package root.

### Patch Changes

- b30bc84: Keep product draft and publish actions in one stable header position, and align
  variant removal controls with their availability controls.
