---
"@jessepomeroy/admin": major
---

CRM requires `api.crm.listClientsWithTags`, wired to the new paginated Convex query. Client lists use snapshot cursor pages of at most 50 rows with tags included, next/previous/refresh controls, and refresh after local mutations; detail tags/activity use reactive subscriptions instead of imperative reload caches. Existing `listClients` remains available for other consumers.
