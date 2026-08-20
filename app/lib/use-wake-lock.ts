"use client";

import { useEffect } from "react";

// iOS dims the screen ~30s after the last touch and locks a few seconds later,
// which is short for reading a page of Quran. The system Auto-Lock setting is
// not reachable from the web; the only lever a PWA has is the Screen Wake Lock
// API (Safari 16.4+, standalone PWAs included), and that API is binary — held
// or not held, with no timeout of its own.
//
// So "extend the timeout to N ms" is expressed as: hold a wake lock while the
// reader is being used, and drop it N ms after the last interaction. Up to N
// the screen stays fully lit; once we release, iOS resumes its normal ~30s dim
// -> lock sequence. Idle-in-pocket behaviour is therefore unchanged apart from
// the N ms grace period.
export function useWakeLock(timeoutMs: number) {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    // request() is async, so two interactions in flight could each acquire a
    // sentinel and leak the first one. One in-flight request at a time.
    let pending = false;

    async function acquire() {
      if (cancelled || pending || sentinel || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void next.release();
          return;
        }
        sentinel = next;
        // The UA releases the lock on its own when the tab is hidden or the
        // device locks anyway; clear our handle so the next interaction knows
        // to ask for a fresh one.
        next.addEventListener("release", () => {
          if (sentinel === next) sentinel = null;
        });
      } catch {
        // Rejected when the document isn't visible or the UA declines (e.g.
        // low battery). Not fatal — the next interaction retries.
      } finally {
        pending = false;
      }
    }

    function release() {
      const current = sentinel;
      sentinel = null;
      if (current) void current.release();
    }

    function poke() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(release, timeoutMs);
      void acquire();
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        poke();
      } else {
        clearTimeout(idleTimer);
        // iOS has already released the lock by the time we get here; drop the
        // stale handle so returning to the app re-acquires.
        sentinel = null;
      }
    }

    // Capture phase so a handler that stops propagation (sheet drags, the
    // long-press picker) can't starve the timer. Passive: we never preventDefault.
    const events = ["pointerdown", "pointerup", "touchstart", "keydown", "wheel"] as const;
    for (const type of events) {
      window.addEventListener(type, poke, { capture: true, passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);

    // Opening the app counts as an interaction — start the window immediately.
    poke();

    return () => {
      cancelled = true;
      clearTimeout(idleTimer);
      for (const type of events) {
        window.removeEventListener(type, poke, { capture: true });
      }
      document.removeEventListener("visibilitychange", onVisibility);
      release();
    };
  }, [timeoutMs]);
}
