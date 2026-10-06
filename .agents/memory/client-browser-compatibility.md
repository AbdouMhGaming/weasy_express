---
name: Client browser compatibility
description: Why older-browser rendering compatibility is required for Weasy Express, not merely current-browser screenshots.
---

Preserve an older-browser CSS baseline when changing the site's or portals' styling. In particular, a button with white text or a white logo must still have a visible solid-color background if its gradient cannot be parsed.

**Why:** The user reported clients seeing missing login buttons, branding, and icon fills. The existing Tailwind 4 output used modern gradient interpolation and color functions; browsers such as Chrome 109 can discard these backgrounds and make their contents appear missing.

**How to apply:** Check both development and final production CSS for usable fallback colors/gradients and property defaults. Development screenshots alone do not validate the packaged stylesheet. Preserve meaningful content and recovery controls when assets fail.
