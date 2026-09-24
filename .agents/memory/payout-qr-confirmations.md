---
name: Payout QR confirmations
description: Security and semantics for payment receipts and QR scanning.
---

An approved payout can carry a scannable receipt. The QR points to a portal route, but only a signed-in Expéditeur who owns that payout may perform the one-time confirmation that marks it paid. GET/navigation must not mutate payment state. Super admins alone may manually mark a payout paid; office agents may approve and download receipts, but not manually pay them.

**Why:** QR readers, link previews, and crawlers may open URLs without the recipient's intent; a bare public link cannot be allowed to change financial records. Sending the QR contents to an external generation service would also expose a payment-confirmation token.

**How to apply:** Generate QR images locally; authorize and atomically consume the confirmation token in an authenticated POST. Keep the approval document labeled as awaiting confirmation until the paid transition actually occurs.