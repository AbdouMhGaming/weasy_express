#!/bin/bash
set -e

# Install dependencies only.
# NOTE: Do NOT run `pnpm --filter db push` here. This project manages all DB
# tables via raw SQL scripts (lib/db/add-*.mjs). Running drizzle-kit push would
# detect tables not in the Drizzle schema and prompt to DROP them, which is
# destructive. Run the relevant add-*.mjs script manually when a new table is needed.
pnpm install --frozen-lockfile
