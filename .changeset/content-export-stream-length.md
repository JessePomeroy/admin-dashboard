---
"@jessepomeroy/admin": patch
---

Accept verified streamed content-export archives when the Worker omits Content-Length. Continue checking a supplied length, enforcing the 16 MiB limit, and requiring a matching SHA-256 hash before returning the download.
