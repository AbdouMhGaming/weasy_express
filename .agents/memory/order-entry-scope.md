---
name: Order-entry scope
description: Shared requirements for single and bulk order entry.
---

Apply order-entry changes to both the single-order form and multi-order rows, including imported rows wherever the requirement affects validation or destination coverage.

**Why:** The user explicitly called out that the single-order service, searchable destination, fee, and phone changes were missed in multi-order entry.

**How to apply:** Check both workflows whenever changing order fields, fees, destination filtering, or validation. Use Ecotrack coverage and tariffs rather than manually configured substitutes. Show delivery fees only after a valid wilaya and commune are selected, and weight fees only when weight is entered.
