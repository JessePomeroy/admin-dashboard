---
"@jessepomeroy/admin": major
---

Remove retired Sanity project fields, Studio links and `AdminConfig.sanityStudioUrl`.
Platform-client create/edit forms now expose only current platform fields; the
public `PlatformClient` type no longer includes `sanityProjectId`. Remove those
two properties from host configuration and client objects when upgrading.
Existing imported revision provenance remains supported.
