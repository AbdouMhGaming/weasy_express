---
name: Hostinger build policy
description: Requirements for complete Hostinger production packages and their external runtime dependencies.
---

Hostinger production packages must include the complete application. Never set `VITE_HOSTINGER_BUILD` while packaging because it removes the Expediteur Ecotrack interface from the frontend bundle.

**Why:** The user explicitly requires all current and future features to be included in Hostinger builds; a restricted build caused Expediteur updates to disappear after deployment.

**How to apply:** Always use the project Hostinger build script and verify the resulting ZIP contains the Ecotrack dashboard and settings assets.

The generated production package must include both `mysql2` and `drizzle-orm` as runtime dependencies.

**Why:** The API bundle leaves these packages external, so Hostinger must install them for the server to start.

**How to apply:** After packaging, inspect the generated `package.json` before delivering the ZIP.

Hostinger updates must replace `public/` and `dist/` together and restart the Node.js application.

**Why:** Updating only the SPA while an older API process remains active makes new `/api` routes return HTML/404 responses, causing JSON parser failures in the browser.

**How to apply:** Deployment instructions must require stopping the app, clearing old hashed frontend assets, replacing both folders, installing production dependencies, and restarting Node.js.

Hostinger deployments must initialize new idempotent MySQL structures automatically at application startup.

**Why:** The user’s Hostinger workflow only accepts package uploads and handles Node.js lifecycle automatically; they cannot run migration commands manually.

**How to apply:** For additive schema needs, use safe raw `CREATE TABLE IF NOT EXISTS` initialization before dependent background services start. Never use Drizzle schema push.

Hostinger automatic builds may not expose `SESSION_SECRET`; Ecotrack encryption must still work without manual environment configuration.

**Why:** Hostinger’s run log confirmed automatic deployment supplied working database variables but no session secret, causing every token save to fail.

**How to apply:** Prefer a valid session/admin secret when supplied; otherwise derive the encryption key from the stable secret database environment. Treat credentials encrypted under another key as requiring reconnection, not as a dashboard crash.