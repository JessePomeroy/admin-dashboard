---
"@jessepomeroy/admin": minor
---

Add optional tenant-authorized cleanup for catalog print masters, paid files and expired uploads, plus product and inquiry removal controls. Keep storage manifests server-only, support retry after partial cleanup, and expose web-media cleanup through the existing host adapter. Hosts must deploy the matching CRM API/Worker contract and explicitly mount/configure the new handler before enabling these controls.

Add reference-protected content history cleanup, orphan web-media cleanup support, and creator-controlled offboarding with 90-day retention and an explicit early-erasure choice for eligible CRM records. Preserve accepted quotes, signed contracts and payment/linked invoice history. Provider shutdown and complete tenant/account erasure remain separate operator work.

Add the reusable server-only public-site gate for immediate client-site shutdown. Hosts check current tenant availability, fail closed, and avoid caching public responses; admin/auth and explicitly selected historical customer-service routes stay available.
