---
"@jessepomeroy/admin": patch
---

Prevent authenticated delivery-gallery image responses from inheriting public Worker cache policies by enforcing `private, no-store` in the host proxy while preserving streamed bodies and image metadata.
