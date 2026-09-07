---
"@jessepomeroy/admin": patch
---

Use one validated integer-cent invoice calculation across default and authored emails, invoice forms and displays, and pending dashboard totals. Positive fractional quantities are supported without a precision cap; each line is rounded before subtotal, then percentage tax is rounded once. Numeric form drafts convert unit dollar prices to cents first, show invalid values without crashing, and permit clearing tax to zero.
