---
"@jessepomeroy/admin": patch
---

Reuse the identical resolved and terminal email-recovery handling in invoice and
contract pages. Preserve exact-attempt cleanup, newer-attempt and selected-document
guards, and status updates; quote-specific recovery feedback is unchanged.
