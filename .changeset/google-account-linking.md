---
"@jessepomeroy/admin": minor
---

Add a Google account-linking control between change password and sign out, matching the other sidebar items. It appears only after the signed-in account is confirmed to have no Google connection. Hosts can supply the optional Better Auth listAccounts and linkSocial methods; linking preserves the existing account and server-side email and membership checks.
