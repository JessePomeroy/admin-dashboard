# @jessepomeroy/admin

## 5.1.0

### Minor Changes

- 49e73e6: Reuse the shared accessible modal shell for email templates and platform-client details while preserving responsive sizing. Remove the unreachable platform-client creation dialog and direct users to operator onboarding.

  AdminModal adds an optional accessible label and CSS sizing overrides; existing defaults remain unchanged.

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
