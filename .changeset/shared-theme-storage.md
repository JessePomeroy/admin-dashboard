---
"@jessepomeroy/admin": minor
---

Add the lightweight `@jessepomeroy/admin/theme` entry point for the existing `isDark` store. The root export remains available and shares the same store instance.

The store now owns the document's dark class as well as preference persistence, so public and admin consumers stay synchronized without a mounted admin layout. Unrecognized preferences fall back to the system setting, and denied storage reads or writes no longer prevent theme initialization or switching. Server imports remain free of browser side effects.
