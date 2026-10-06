---
name: Payout QR confirmations
description: Security and semantics for payment receipts, QR scanning, and staff OTP confirmation.
---

An approved payout can carry a scannable receipt. The QR points to a portal route, but only a signed-in Expéditeur who owns that payout may perform the one-time confirmation that marks it paid. GET/navigation must not mutate payment state. Super admins alone may manually mark a payout paid; office agents may approve and download receipts, but not manually pay them.

The user also requires an alternative when the merchant has no phone or sends someone to collect: authorized admins or the payout's linked office may confirm a pending/accepted payout using a one-time code delivered to the owning root Expéditeur's notification center. Staff must not be able to retrieve the code through notification APIs. Office confirmation with this proof is an explicit exception to the prohibition on manually marking payouts paid.

**Why:** QR readers, link previews, and crawlers may open URLs without the recipient's intent; a bare public link cannot be allowed to change financial records. Sending the QR contents to an external generation service would also expose a payment-confirmation token. The OTP alternative preserves the merchant's participation when someone else collects the payout.

**How to apply:** Generate QR images locally; authorize and atomically consume the confirmation token in an authenticated POST. OTPs must expire, limit guesses/resends, and be bound to the payout; paid transitions must invalidate the alternative confirmation method. Keep the approval document labeled as awaiting confirmation until the paid transition actually occurs.