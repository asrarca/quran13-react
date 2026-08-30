// Cross-device sync for bookmarks, highlights, rakat markers and preferences.
//
// CLIENT ONLY (touches localStorage and the browser Supabase client).
//
// Design rules, in priority order:
//
//   1. The reader never waits on the network. localStorage stays the source of
//      truth for rendering; Supabase is a background replica. Every function
//      here is safe to call while signed out, offline, or unconfigured — it
//      degrades to a no-op rather than throwing.
//   2. Nothing is silently deleted. Merges are unions; on a genuine conflict
//      the server copy wins, but a local-only entry is always pushed up.
//   3. Writes go through a durable queue so an edit made offline (a real case
//      for a PWA used in a masjid) still lands once connectivity returns.
//
// Page numbers here are INTERNAL 0-based values, matching app state and the
// quran13-page cookie — not the page + 1 shown in the UI.

import type { HighlightColorKey, Theme, FontSize, MushafKey } from "@/app/types";
import type { Lang } from "@/app/i18n";
import { getSupabase } from "@/app/lib/supabase/client";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type RemotePrefs = {
  theme: Theme | null;
  lang: Lang | null;
  mushaf: MushafKey | null;
  fontSize: FontSize | null;
  lastPage: number | null;
  translationEditions: Record<string, string>;
};

export type SyncSnapshot = {
  bookmarks: Record<number, string>;
  highlights: Record<number, Record<number, HighlightColorKey>>;
  rakat: Record<number, Record<number, number>>;
  prefs: RemotePrefs | null;
};

/** Local state to seed the server with on first sign-in. */
export type LocalSnapshot = Omit<SyncSnapshot, "prefs"> & { prefs: RemotePrefs };

export type PendingOp =
  | { t: "bm.set"; page: number; createdAt: string }
  | { t: "bm.del"; page: number }
  | { t: "hl.set"; page: number; line: number; color: HighlightColorKey }
  | { t: "hl.del"; page: number; line: number }
  | { t: "rk.set"; page: number; line: number; n: number }
  | { t: "rk.del"; page: number; line: number }
  | { t: "prefs.set"; prefs: Partial<RemotePrefs> };

const QUEUE_KEY = "quran13-sync-queue";
const MERGED_KEY = "quran13-sync-merged"; // marks the one-time first-sign-in merge

// Supabase caps payload sizes; chunk bulk upserts well under any practical limit.
const CHUNK = 500;

function chunk<T>(rows: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Durable write queue
// ---------------------------------------------------------------------------

function readQueue(): PendingOp[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as PendingOp[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(ops: PendingOp[]): void {
  if (typeof window === "undefined") return;
  try {
    if (ops.length) window.localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
    else window.localStorage.removeItem(QUEUE_KEY);
  } catch {
    // private mode / quota — the local state is still correct, only sync lags
  }
}

/**
 * Record a change and attempt to push it.
 *
 * Callers do not await this: the local write has already happened and the UI is
 * already correct. Failure here only means the op stays queued.
 */
export function queueOp(op: PendingOp): void {
  writeQueue([...readQueue(), op]);
  void flushQueue();
}

/** Current signed-in user id, or null. */
async function currentUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  return error ? null : (data.user?.id ?? null);
}

let flushing = false;

/**
 * Drain the pending queue in order.
 *
 * Ordering matters — a set followed by a delete of the same cell must not be
 * applied backwards — so this stops at the first network failure and leaves the
 * remainder queued. A row rejected by a constraint is dropped instead, since
 * retrying it forever would wedge every op behind it.
 */
export async function flushQueue(): Promise<void> {
  if (flushing || typeof window === "undefined") return;
  if (!navigator.onLine) return;

  const supabase = getSupabase();
  if (!supabase) return;

  const userId = await currentUserId();
  if (!userId) return; // signed out: keep the queue for a future sign-in

  flushing = true;
  try {
    let queue = readQueue();
    while (queue.length) {
      const op = queue[0];
      const result = await applyOp(supabase, userId, op);

      if (result === "retry") break; // transient: stop, keep the rest queued
      queue = queue.slice(1);
      writeQueue(queue);
    }
  } finally {
    flushing = false;
  }
}

type ApplyResult = "done" | "retry";

async function applyOp(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  userId: string,
  op: PendingOp,
): Promise<ApplyResult> {
  const run = async (p: PromiseLike<{ error: { code?: string; message: string } | null }>) => {
    const { error } = await p;
    if (!error) return "done" as const;
    // PostgREST reports constraint/permission problems with a code; a bare
    // network failure has none. Only the latter is worth retrying.
    if (!error.code) return "retry" as const;
    console.warn("[sync] dropping op", op.t, error.message);
    return "done" as const;
  };

  switch (op.t) {
    case "bm.set":
      return run(
        supabase
          .from("bookmarks")
          .upsert({ user_id: userId, page: op.page, created_at: op.createdAt }, { onConflict: "user_id,page" }),
      );
    case "bm.del":
      return run(supabase.from("bookmarks").delete().eq("user_id", userId).eq("page", op.page));
    case "hl.set":
      return run(
        supabase
          .from("highlights")
          .upsert(
            { user_id: userId, page: op.page, line: op.line, color: op.color },
            { onConflict: "user_id,page,line" },
          ),
      );
    case "hl.del":
      return run(
        supabase.from("highlights").delete().eq("user_id", userId).eq("page", op.page).eq("line", op.line),
      );
    case "rk.set":
      return run(
        supabase
          .from("rakat_markers")
          .upsert(
            { user_id: userId, page: op.page, line: op.line, number: op.n },
            { onConflict: "user_id,page,line" },
          ),
      );
    case "rk.del":
      return run(
        supabase.from("rakat_markers").delete().eq("user_id", userId).eq("page", op.page).eq("line", op.line),
      );
    case "prefs.set":
      return run(
        supabase.from("reader_prefs").upsert({ user_id: userId, ...prefsToRow(op.prefs) }, { onConflict: "user_id" }),
      );
  }
}

// ---------------------------------------------------------------------------
// Row <-> app shape
// ---------------------------------------------------------------------------

function prefsToRow(p: Partial<RemotePrefs>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.theme !== undefined) row.theme = p.theme;
  if (p.lang !== undefined) row.lang = p.lang;
  if (p.mushaf !== undefined) row.mushaf = p.mushaf;
  if (p.fontSize !== undefined) row.font_size = p.fontSize;
  if (p.lastPage !== undefined) row.last_page = p.lastPage;
  if (p.translationEditions !== undefined) row.translation_editions = p.translationEditions;
  return row;
}

type PrefsRow = {
  theme: Theme | null;
  lang: Lang | null;
  mushaf: MushafKey | null;
  font_size: FontSize | null;
  last_page: number | null;
  translation_editions: Record<string, string> | null;
};

function rowToPrefs(r: PrefsRow): RemotePrefs {
  return {
    theme: r.theme,
    lang: r.lang,
    mushaf: r.mushaf,
    fontSize: r.font_size,
    lastPage: r.last_page,
    translationEditions: r.translation_editions ?? {},
  };
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

/** Fetch everything for the signed-in user. Returns null when signed out. */
export async function pullSnapshot(): Promise<SyncSnapshot | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const userId = await currentUserId();
  if (!userId) return null;

  const [bm, hl, rk, pf] = await Promise.all([
    supabase.from("bookmarks").select("page, created_at").eq("user_id", userId),
    supabase.from("highlights").select("page, line, color").eq("user_id", userId),
    supabase.from("rakat_markers").select("page, line, number").eq("user_id", userId),
    supabase.from("reader_prefs").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  if (bm.error || hl.error || rk.error) return null;

  const bookmarks: SyncSnapshot["bookmarks"] = {};
  for (const r of bm.data ?? []) bookmarks[r.page] = r.created_at;

  const highlights: SyncSnapshot["highlights"] = {};
  for (const r of hl.data ?? []) {
    (highlights[r.page] ??= {})[r.line] = r.color as HighlightColorKey;
  }

  const rakat: SyncSnapshot["rakat"] = {};
  for (const r of rk.data ?? []) {
    (rakat[r.page] ??= {})[r.line] = r.number;
  }

  return {
    bookmarks,
    highlights,
    rakat,
    prefs: pf.data ? rowToPrefs(pf.data as PrefsRow) : null,
  };
}

// ---------------------------------------------------------------------------
// First sign-in merge
// ---------------------------------------------------------------------------

/**
 * Seed the server from local state the first time this account signs in on this
 * device, then return the merged truth.
 *
 * The merge rule is "server wins a collision, local-only entries are pushed",
 * implemented with `ignoreDuplicates` upserts: rows the server already has are
 * left untouched (so a bookmark keeps its original created_at), rows it lacks
 * are inserted. That makes this safe to run more than once.
 */
export async function mergeLocalIntoRemote(local: LocalSnapshot): Promise<SyncSnapshot | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const userId = await currentUserId();
  if (!userId) return null;

  const bookmarkRows = Object.entries(local.bookmarks).map(([page, createdAt]) => ({
    user_id: userId,
    page: Number(page),
    created_at: createdAt,
  }));

  const highlightRows = Object.entries(local.highlights).flatMap(([page, lines]) =>
    Object.entries(lines).map(([line, color]) => ({
      user_id: userId,
      page: Number(page),
      line: Number(line),
      color,
    })),
  );

  const rakatRows = Object.entries(local.rakat).flatMap(([page, lines]) =>
    Object.entries(lines).map(([line, n]) => ({
      user_id: userId,
      page: Number(page),
      line: Number(line),
      number: n,
    })),
  );

  for (const rows of chunk(bookmarkRows)) {
    await supabase.from("bookmarks").upsert(rows, { onConflict: "user_id,page", ignoreDuplicates: true });
  }
  for (const rows of chunk(highlightRows)) {
    await supabase.from("highlights").upsert(rows, { onConflict: "user_id,page,line", ignoreDuplicates: true });
  }
  for (const rows of chunk(rakatRows)) {
    await supabase.from("rakat_markers").upsert(rows, { onConflict: "user_id,page,line", ignoreDuplicates: true });
  }

  // Prefs are a singleton, so "server wins" means: only write if absent.
  await supabase
    .from("reader_prefs")
    .upsert({ user_id: userId, ...prefsToRow(local.prefs) }, { onConflict: "user_id", ignoreDuplicates: true });

  markMerged(userId);
  return pullSnapshot();
}

/** Has this account already been merged from this device? */
export function hasMerged(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MERGED_KEY) === userId;
  } catch {
    return false;
  }
}

function markMerged(userId: string): void {
  try {
    window.localStorage.setItem(MERGED_KEY, userId);
  } catch {
    // non-fatal: the merge is idempotent, so a repeat run is harmless
  }
}

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------
//
// Reader state is held as whole objects and persisted by effects that rewrite
// the entire record (see Reader.tsx). Rather than instrumenting every mutation
// site, those effects compare the new value against the last synced one and emit
// only what changed. The records are small — a few hundred entries at most — so
// a full walk per change is cheaper than the bookkeeping it replaces.

/** Ops needed to turn `prev` into `next` for the bookmarks record. */
export function diffBookmarks(
  prev: Record<number, string>,
  next: Record<number, string>,
): PendingOp[] {
  const ops: PendingOp[] = [];
  for (const [key, createdAt] of Object.entries(next)) {
    if (prev[Number(key)] !== createdAt) ops.push({ t: "bm.set", page: Number(key), createdAt });
  }
  for (const key of Object.keys(prev)) {
    if (!(key in next)) ops.push({ t: "bm.del", page: Number(key) });
  }
  return ops;
}

/**
 * Ops for the page → line → value records (highlights and rakat markers).
 * `kind` picks which op pair to emit; the traversal is identical for both.
 */
export function diffCells<V extends string | number>(
  prev: Record<number, Record<number, V>>,
  next: Record<number, Record<number, V>>,
  kind: "hl" | "rk",
): PendingOp[] {
  const ops: PendingOp[] = [];

  const set = (page: number, line: number, v: V): PendingOp =>
    kind === "hl"
      ? { t: "hl.set", page, line, color: v as HighlightColorKey }
      : { t: "rk.set", page, line, n: v as number };
  const del = (page: number, line: number): PendingOp =>
    kind === "hl" ? { t: "hl.del", page, line } : { t: "rk.del", page, line };

  for (const [pageKey, lines] of Object.entries(next)) {
    const page = Number(pageKey);
    const before = prev[page] ?? {};
    for (const [lineKey, value] of Object.entries(lines)) {
      const line = Number(lineKey);
      if (before[line] !== value) ops.push(set(page, line, value));
    }
  }

  for (const [pageKey, lines] of Object.entries(prev)) {
    const page = Number(pageKey);
    const after = next[page] ?? {};
    for (const lineKey of Object.keys(lines)) {
      const line = Number(lineKey);
      if (!(line in after)) ops.push(del(page, line));
    }
  }

  return ops;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Retry pending writes when connectivity returns.
 * Returns a cleanup function for useEffect.
 */
export function startFlushOnReconnect(): () => void {
  if (typeof window === "undefined") return () => {};
  const onOnline = () => void flushQueue();
  window.addEventListener("online", onOnline);
  void flushQueue();
  return () => window.removeEventListener("online", onOnline);
}

/** Sign out and clear device-local sync bookkeeping (never the reader data). */
export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
  try {
    window.localStorage.removeItem(MERGED_KEY);
  } catch {
    // ignore
  }
}
