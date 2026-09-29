---
"@jessepomeroy/admin": patch
---

Unify editor publication controls and distinguish published state from saved drafts.
Products, portfolio galleries and blog content share Publish, Publish changes and
Unpublish actions in their headers. Previously hidden portfolio galleries are
presented as unpublished; page editors retain their configured capabilities.

Deploy the portfolio backend change that makes publish restore visibility before
adopting this release. The package uses existing mutation references; no host
configuration or schema migration is required.
