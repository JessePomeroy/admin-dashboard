---
"@jessepomeroy/admin": patch
---

Make internal document-email recovery and gallery session key helpers module-private. The README configuration example drops the retired `sanityStudioUrl` field and now builds its API with `createStandardAdminAPI`, leaving unverified optional features disabled. Package entry points are unchanged.
