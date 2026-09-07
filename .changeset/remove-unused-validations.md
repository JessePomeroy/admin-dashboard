---
"@jessepomeroy/admin": patch
---

Remove three internal validation helpers with no production callers and their implementation-only tests. Public trimString and validateFilename exports and their behavior remain unchanged.
