---
"@jessepomeroy/admin": minor
---

Show received payments, remaining balances, and overpayment review notices on
invoices. Support editing and filtering partially paid invoices, use the
authoritative invoice returned by compatible backends after edits, and count
only unpaid balances in the dashboard's outstanding amount.

Remaining-balance collection requires the coordinated invoice payment revision
backend and hub release. Publish this package before adopting its exact version
in a host; older mutation implementations that return no document remain usable.
