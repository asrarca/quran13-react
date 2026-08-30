"use client";

// Session state and the two sign-in flows (Google, emailed code).
//
// Sign-in is always optional. `status` starts at "loading" only briefly; the
// reader renders normally throughout and never blocks on it.

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase, syncConfigured } from "@/app/lib/supabase/client";

export type AuthStatus = "loading" | "signed-out" | "signed-in";

export function useAuth(): { user: User | null; status: AuthStatus } {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>(syncConfigured ? "loading" : "signed-out");

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    let active = true;

    // getUser() revalidates against the auth server rather than trusting the
    // locally stored session, so a revoked or expired session reads as signed
    // out instead of briefly appearing valid.
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setStatus(data.user ? "signed-in" : "signed-out");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setStatus(session?.user ? "signed-in" : "signed-out");
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, status };
}

export type AuthResult = { ok: true } | { ok: false; error: string };

/**
 * Google OAuth. Leaves the page and returns to /auth/callback, which exchanges
 * the code for a session before the app re-renders.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "not_configured" };

  // redirectTo carries NO query string on purpose. Supabase matches this URL
  // against the project's Redirect URLs allowlist including the query string, so
  // a "?next=..." would fail to match a plain allowlist entry, and Supabase
  // would silently fall back to the Site URL — dropping the auth code and
  // leaving the user with an account but no session.
  //
  // Nothing is lost by dropping it: "/" re-reads the current page from the
  // quran13-page cookie (see app/page.tsx), so the reader comes back exactly
  // where it was.
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Email step 1 — send a 6-digit code.
 *
 * Deliberately NOT a magic link: a link opens in the system browser, which for
 * an installed PWA is a different context than the app the user is standing in,
 * so they would end up signed in somewhere they cannot see. Omitting
 * emailRedirectTo is what selects the code flow; the Supabase email template
 * must render {{ .Token }} for the code to actually appear in the message.
 */
export async function sendEmailCode(email: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "not_configured" };

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Email step 2 — exchange the code for a session. */
export async function verifyEmailCode(email: string, token: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "not_configured" };

  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: "email",
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
