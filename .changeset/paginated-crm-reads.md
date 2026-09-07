---
"@jessepomeroy/admin": major
---

CRM requires `api.crm.listClientsWithTags`, wired to the new paginated Convex query. Client lists load 50 rows at a time with tags included; detail tags/activity use reactive subscriptions instead of imperative reload caches. Existing `listClients` remains available for other consumers.
