---
"@jessepomeroy/admin": patch
---

Add previous and next navigation to the shared editor media picker, retaining one active library page plus existing attachment and local-upload reads. Bound library reads and require an explicit same-cursor retry if a reactive page becomes incomplete, rather than skipping unread assets. Show loading, retryable errors, and empty ready-image pages without hiding navigation to older assets. Preserve selected/deleting states and keyboard focus when navigation disables a control.
