---
name: Ecotrack dashboard density
description: Confirmed layout and collapsed-sidebar interaction preferences for the Expediteur Ecotrack portal.
---

Keep the Ecotrack dashboard information-dense: Delivery Modes shares a row with Performance Trends, while Top Products shares a row with Geographic Distribution and Top Wilayas.

**Why:** The user explicitly confirmed this compact dashboard direction and rejected the earlier oversized vertical layout.

**How to apply:** Preserve these desktop groupings when editing analytics cards; stack responsively on smaller screens.

The collapsed desktop sidebar must display only intact clickable icons. Orders is a category container: clicking its icon must first expand the sidebar and reveal its status choices.

**Why:** An icon-only Orders control cannot expose status navigation inside the narrow rail, and cropped brand artwork looks broken.

**How to apply:** Hide Orders text, chevron, submenu, and auxiliary language controls while collapsed. Scale the full logo with object containment, and expand/open Orders together on icon click.

Place the desktop sidebar collapse control in the Expediteur identity/role row below the logo, never over the logo.

**Why:** The control covered the brand artwork when the sidebar was collapsed; the user corrected its preferred location.

**How to apply:** Keep it beside the username and role in expanded mode and centered in that same row in icon-only mode.

Order statuses use one fixed operational sequence: ready to ship, pickup, to station, at station, to wilaya, preparation, delivery, suspended, three payment stages, then three return stages.

**Why:** The sequence reflects the user’s actual parcel workflow; alphabetical or API response order is confusing.

**How to apply:** Canonicalize Ecotrack status aliases before rendering counts or filtering, and preserve this sequence in sidebar and status selectors.

Only show order statuses whose current count is greater than zero.

**Why:** Empty statuses add unnecessary sidebar clutter.

**How to apply:** Aggregate aliases first, then remove zero-count canonical statuses before rendering the Orders submenu.

All Ecotrack operational screens must inherit the existing Weasy Express visual system and interaction patterns; screenshots or references communicate content, not a replacement theme.

**Why:** The user repeatedly rejected Ecotrack reports and admin-delay screens that copied a reference image’s colors instead of matching the main website.

**How to apply:** Reuse the main dashboard’s white/slate surfaces, red brand accent, spacing, controls, and responsive behavior for reports, Retards, and future Ecotrack sections.

Dashboard quick actions must complete their task in place when possible. Order quick search belongs directly above New Order and opens an anchored search/results panel; it must not navigate to History.

**Why:** The user intends to remove History and expects the dashboard shortcut to remain a genuinely fast search interaction.

**How to apply:** Keep the button adjacent to the New Order FAB and show matching order essentials in an overlay without changing the active sidebar section.