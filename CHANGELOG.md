# @jessepomeroy/admin

## 4.0.0

### Major Changes

- 4507b0b: Keep server-only configuration, handlers, and provider clients exclusively on
  the `@jessepomeroy/admin/server` export. Browser consumers continue to use the
  package root.

### Patch Changes

- b30bc84: Keep product draft and publish actions in one stable header position, and align
  variant removal controls with their availability controls.
