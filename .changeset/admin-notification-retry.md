---
"@jessepomeroy/admin": patch
---

Retry failed page-seen notification acknowledgements with bounded backoff while the page remains active. Cancel retry timers on navigation or layout teardown, and do not let a stale request schedule retries for a later visit.
