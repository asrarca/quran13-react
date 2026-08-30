// Browser-side Supabase client.
//
// Safe to import from Client Components. The publishable key is meant to ship to
// the browser — Row Level Security (supabase/migrations/0001_reader_sync.sql) is
// what keeps one user's rows away from another, not the secrecy of this key.
//
// Sessions are stored in cookies rather than localStorage so the server can read
// them too; see ./server.ts.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** True when Supabase is configured. When false the app runs local-only. */
export const syncConfigured = Boolean(url && key);

// Annotated rather than inferred: createBrowserClient's return type is generic
// over a generated Database type we don't have, so inference lands on `any` and
// every call downstream silently loses its types.
let cached: SupabaseClient | null = null;

/**
 * The shared browser client, or null if Supabase env vars are absent.
 *
 * Returning null rather than throwing is deliberate: sync is an optional layer
 * over a reader that must keep working offline and unconfigured.
 */
export function getSupabase(): SupabaseClient | null {
  if (!syncConfigured) return null;
  cached ??= createBrowserClient(url!, key!);
  return cached;
}
