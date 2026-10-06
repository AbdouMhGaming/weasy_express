#!/usr/bin/env node
/**
 * Build script for Hostinger Node.js deployment.
 *
 * Creates a self-contained zip package ready to upload to Hostinger:
 *   dist/index.mjs       — Express API server (CJS bundle)
 *   public/              — Built Vite SPA (served via STATIC_DIR)
 *   uploads/commissions/ — Created on first run
 *   package.json         — Minimal production manifest
 *   .env.example         — Template for required env vars
 *
 * Usage:
 *   node scripts/build-hostinger.mjs
 *   → produces: deploy/weasy-express-<date>.zip
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");

const ROOT = new URL("..", import.meta.url).pathname;
const DEPLOY_DIR = path.join(ROOT, "deploy");
const BUILD_DIR = path.join(DEPLOY_DIR, "build");

function run(cmd, opts = {}) {
  console.log(`\n▶  ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts });
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

// ── 1. Build frontend ──────────────────────────────────────────────────────
console.log("\n🖼  Building frontend (Vite)…");
run("PORT=5000 BASE_PATH=/ pnpm --filter @workspace/weasy-express run build");

// ── 2. Build API server ────────────────────────────────────────────────────
console.log("\n🔧  Building API server (esbuild)…");
run("pnpm --filter @workspace/api-server run build");

// ── 3. Assemble deployment directory ─────────────────────────────────────
console.log("\n📁  Assembling deployment package…");
fs.rmSync(BUILD_DIR, { recursive: true, force: true });
fs.mkdirSync(BUILD_DIR, { recursive: true });

// Copy compiled API server
copyDir(
  path.join(ROOT, "artifacts/api-server/dist"),
  path.join(BUILD_DIR, "dist")
);

// Copy built frontend SPA
copyDir(
  path.join(ROOT, "artifacts/weasy-express/dist/public"),
  path.join(BUILD_DIR, "public")
);

// Copy uploads directory skeleton
fs.mkdirSync(path.join(BUILD_DIR, "uploads/commissions"), { recursive: true });
fs.writeFileSync(
  path.join(BUILD_DIR, "uploads/.gitkeep"), ""
);

// Write production package.json
const pkgJson = {
  name: "weasy-express",
  version: "1.0.0",
  private: true,
  type: "module",
  scripts: {
    start: "node ./dist/index.mjs",
  },
  engines: { node: ">=20" },
  // These packages are external in the esbuild bundle — Hostinger must install them.
  // mysql2: externalized explicitly in build.mjs
  // drizzle-orm: pulled in via @workspace/db and left unbundled by esbuild
  // pdf-parse: required at runtime by the office and Ecotrack PDF upload parsers
  dependencies: {
    "mysql2": "^3.22.4",
    "drizzle-orm": "^0.45.2",
    "pdf-parse": "1.1.1",
  },
};
fs.writeFileSync(
  path.join(BUILD_DIR, "package.json"),
  JSON.stringify(pkgJson, null, 2) + "\n"
);

// Write .env.example
const envExample = `# Hostinger Node.js — Required environment variables
# Copy this to .env and fill in your values

PORT=3000
NODE_ENV=production

# MySQL database (primary)
DB_HOST=your-mysql-host.hostinger.com
DB_USER=your_db_user
DB_PASS=your_db_password
DB_NAME=your_db_name

# Path to the built SPA (relative to process.cwd())
STATIC_DIR=./public

# Optional: Admin HMAC secret (set a random string)
ADMIN_SECRET=change_me_to_a_random_secret_string

# Optional: preferred stable encryption/session secret. If Hostinger does not
# provide it, the app derives a stable key from the existing DB environment.
SESSION_SECRET=change_me_to_a_long_random_secret_string
`;
fs.writeFileSync(path.join(BUILD_DIR, ".env.example"), envExample);

// Write deployment README
const readme = `# Weasy Express — Hostinger Deployment

## Files in this package

| Path | Description |
|------|-------------|
| \`dist/index.mjs\` | Compiled Express API server |
| \`public/\` | Built React SPA (served by the server) |
| \`uploads/commissions/\` | XLSX file storage (auto-created) |
| \`package.json\` | Production start script |
| \`.env.example\` | Required environment variables |

## Deployment steps

1. Stop the Hostinger Node.js application before replacing files.
   Preserve the existing \`uploads/\` directory (including commissions), database, and environment variables. This is a code update, not a data reset.
2. Delete the old \`public/assets/\` directory so stale hashed frontend files cannot remain.
3. Upload the complete package contents to the Node.js application root. Replace both \`public/\` and \`dist/\`; never update only one of them.
4. Run \`npm install --omit=dev\` from the application root so all production dependencies are installed.
5. Keep your existing environment variables, or set them in the Hostinger panel using \`.env.example\` as a reference (never copy it to \`.htaccess\`):
   - \`PORT\` — port provided by Hostinger (usually 3000)
   - \`NODE_ENV=production\`
   - \`DB_HOST\`, \`DB_USER\`, \`DB_PASS\`, \`DB_NAME\` — your MySQL credentials
   - \`STATIC_DIR=./public\`
   - \`ADMIN_SECRET\` — a random secret for admin authentication
   - \`SESSION_SECRET\` — optional preferred encryption secret; the app automatically uses the existing database environment when Hostinger does not provide one
6. Set the start command to: \`node --enable-source-maps ./dist/index.mjs\`
7. Start or restart the Node.js application after every upload.
8. The server will serve both the API (\`/api/*\`) and the frontend SPA.
9. Payout OTP storage is created automatically using an additive CREATE TABLE IF NOT EXISTS; existing payout and commission records are preserved.

If the browser reports that an API response starts with \`<!DOCTYPE\`, the frontend and API versions do not match or Hostinger has not restarted the Node.js process. Repeat steps 1–7 with the complete package.

## DB migration (optional)

To migrate data from the first DB to a second DB, run:

\`\`\`bash
cd lib/db
DB_HOST=... DB_USER=... DB_PASS=... DB_NAME=... \\
DB_HOST_2=... DB_USER_2=... DB_PASS_2=... DB_NAME_2=... \\
node migrate-to-new-db.mjs
\`\`\`
`;
fs.writeFileSync(path.join(BUILD_DIR, "README.md"), readme);

// ── 4. Create zip archive with adm-zip ────────────────────────────────────
console.log("\n📦  Creating zip archive (adm-zip)…");
const dateStr = new Date().toISOString().slice(0, 10);
const archiveName = `weasy-express-${dateStr}.zip`;
const archivePath = path.join(DEPLOY_DIR, archiveName);

if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);

const zip = new AdmZip();

function addDirToZip(zip, srcDir, zipPrefix = "") {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const entryZipDir = zipPrefix;
    // Skip source-map files — not needed in production
    if (!entry.isDirectory() && entry.name.endsWith(".map")) continue;
    if (entry.isDirectory()) {
      const subPrefix = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
      addDirToZip(zip, srcPath, subPrefix);
    } else {
      zip.addLocalFile(srcPath, entryZipDir);
    }
  }
}

addDirToZip(zip, BUILD_DIR);
zip.writeZip(archivePath);

const stats = fs.statSync(archivePath);
const sizeMb = (stats.size / 1024 / 1024).toFixed(1);
console.log(`\n✅  Package ready: deploy/${archiveName}  (${sizeMb} MB)`);
console.log(`\n📋  Top-level contents:`);
execSync(`ls -1 "${BUILD_DIR}"`, { stdio: "inherit" });
