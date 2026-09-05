# @jessepomeroy/admin

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
