---
"@jessepomeroy/admin": patch
---

Keep a same-page retry link available when public-site availability fails closed. Preserve path/query, omit fragments and escape the absolute same-origin URL so retry cannot redirect to a protocol-relative destination or inject markup. No retained tenant content is rendered.
