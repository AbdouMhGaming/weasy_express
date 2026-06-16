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
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";

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
    start: "node --enable-source-maps ./dist/index.mjs",
  },
  engines: { node: ">=20" },
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

1. Upload this folder contents to your Hostinger Node.js hosting root.
2. Copy \`.env.example\` to \`.htaccess\` or set env vars in the Hostinger panel:
   - \`PORT\` — port provided by Hostinger (usually 3000)
   - \`NODE_ENV=production\`
   - \`DB_HOST\`, \`DB_USER\`, \`DB_PASS\`, \`DB_NAME\` — your MySQL credentials
   - \`STATIC_DIR=./public\`
   - \`ADMIN_SECRET\` — a random secret for admin authentication
3. Set the start command to: \`node --enable-source-maps ./dist/index.mjs\`
4. The server will serve both the API (\`/api/*\`) and the frontend SPA.

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

// ── 4. Create archive ─────────────────────────────────────────────────────
console.log("\n📦  Creating archive…");
const dateStr = new Date().toISOString().slice(0, 10);

// Try zip first, fall back to tar.gz
let archiveName, archivePath;
const hasZip = (() => { try { execSync("which zip", { stdio: "pipe" }); return true; } catch { return false; } })();

if (hasZip) {
  archiveName = `weasy-express-${dateStr}.zip`;
  archivePath = path.join(DEPLOY_DIR, archiveName);
  if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
  run(`cd "${BUILD_DIR}" && zip -r "${archivePath}" .`);
} else {
  archiveName = `weasy-express-${dateStr}.tar.gz`;
  archivePath = path.join(DEPLOY_DIR, archiveName);
  if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
  run(`tar -czf "${archivePath}" -C "${BUILD_DIR}" .`);
}

const stats = fs.statSync(archivePath);
const sizeMb = (stats.size / 1024 / 1024).toFixed(1);
console.log(`\n✅  Package ready: deploy/${archiveName}  (${sizeMb} MB)`);
console.log(`\n📋  Top-level contents:`);
execSync(`ls -1 "${BUILD_DIR}"`, { stdio: "inherit" });
