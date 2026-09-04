---
name: Ecotrack translation audit
description: Required validation preventing raw i18next keys from appearing in the Ecotrack interface.
---

Every Ecotrack UI change must audit every referenced `admin.ecotrackPortal` key against the English, French, and Arabic locale objects before delivery.

**Why:** Vite builds successfully even when an i18next key is missing or placed under the wrong nested object. This previously exposed raw keys such as form field identifiers to users.

**How to apply:** Extract static Ecotrack keys from the changed components, include dynamic tab variants explicitly, and verify that each complete nested path resolves to a non-empty string in all three locale files. Treat a missing key as a failed build.