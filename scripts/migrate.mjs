// Applies supabase/migrations/*.sql in filename order.
//
// Run with: npm run db:migrate
//
// Uses DB_POOLER_URL rather than DB_CONNECTION_STRING because the direct
// db.<ref>.supabase.co host is IPv6-only, and most home/office networks are
// still IPv4-only. Both point at the same database.
//
// The migrations are written to be idempotent (create if not exists, drop policy
// if exists) so re-running is safe.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const url = process.env.DB_POOLER_URL || process.env.DB_CONNECTION_STRING;
if (!url) {
  console.error("Set DB_POOLER_URL (or DB_CONNECTION_STRING) in .env.local");
  process.exit(1);
}

// macOS ships an ancient psql that predates SCRAM auth; prefer Homebrew libpq.
const CANDIDATES = [
  "/opt/homebrew/opt/libpq/bin/psql",
  "/usr/local/opt/libpq/bin/psql",
  "psql",
];
const psql = CANDIDATES.find((p) => p === "psql" || existsSync(p));

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

if (!files.length) {
  console.log("No migrations found.");
  process.exit(0);
}

for (const file of files) {
  console.log(`\n→ ${file}`);
  try {
    execFileSync(psql, [url, "-v", "ON_ERROR_STOP=1", "-q", "-f", path.join(dir, file)], {
      stdio: "inherit",
    });
  } catch {
    console.error(`\n✗ ${file} failed`);
    process.exit(1);
  }
}

console.log("\n✓ migrations applied");
