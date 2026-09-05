---
"@jessepomeroy/admin": patch
---

Keep Product Editor save, discard and restart results scoped to the operation
that initiated them. Ignore late successes and errors after navigation, including
returning to the same product, so they cannot overwrite current edits or another
save's state. Preserve existing draft query-echo and conflict behavior.
