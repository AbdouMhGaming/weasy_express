---
name: Ecotrack credential recovery
description: Why an existing sender connection may be unreadable and how to handle it without cross-account leakage.
---

An undecryptable stored Ecotrack credential cannot be reconstructed from the cached orders or another sender's credential. Recover it only with the original encryption key, or ask the owning Expéditeur to reconnect. Report an actionable account-connection error to Admin/Suivi, not a portal-session 401 or a generic internal error.

**Why:** A previously connected account's credential failed AES-GCM authentication in the running API, so Suivi could read cached order details but remote remark history failed before an Ecotrack request was made. A backend 401 would incorrectly log out the Suivi user, while an unscoped fallback could reveal another account's data.

**How to apply:** When remote history or sync fails during credential decryption, check key stability and the affected owner before investigating Ecotrack response formats. Keep the owner/tracking pair enforced. If recovering old ciphertext, use explicitly available legacy key material and a controlled rotation; otherwise guide only the affected sender through reconnection.