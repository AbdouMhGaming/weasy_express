---
name: Neutral dark-mode palette
description: User preference for Weasy Express dark mode after rejecting warm-tinted alternatives.
---

Use neutral charcoal and gray surfaces with legible light text for the optional dark mode. Keep red limited to the site's existing brand actions and accents, rather than tinting dark backgrounds brown, yellow, or rose.

Dark mode is a portal-only feature. The public website must stay light without a theme switch, while the user's saved portal preference is preserved when visiting public pages.

**Why:** On 2026-10-01, the user explicitly requested removing dark mode from the main website while keeping it in the portals.

**How to apply:** Scope theme restoration to portal routes both before the initial paint and after client-side navigation. Cross-tab preference changes must not make a public page dark.

**Why:** The user explicitly rejected a warm ink and muted-rose dark palette as looking yellow or red, and asked for a normal dark mode. They also rejected medium-gray page backgrounds in the Expéditeurs and Suivi portals compared with Admin.

**How to apply:** When adding dark styles to new sections, choose unsaturated neutral surfaces and check their text contrast; preserve intentional red hero and button branding without extending it to neutral panels. Audit translucent light-gray page backgrounds as well as opaque ones: light at 50% opacity over charcoal can render as medium gray, so neutral dark page backgrounds should be solid.