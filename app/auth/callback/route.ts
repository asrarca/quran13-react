// OAuth / magic-link landing route.
//
// Supabase redirects here with a one-time `code`, which we exchange for a
// session. The exchange sets the session cookies via the server client, so the
// very next request — including the server-rendered first frame — is signed in.

import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Providers report a refused/failed consent here rather than sending a code.
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) {
    console.warn("[auth] provider returned an error:", providerError);
    return NextResponse.redirect(`${origin}/?sync_error=provider`);
  }

  if (!code) {
    // Reaching this route with no code usually means the redirect URL is not in
    // the project's allowlist, so Supabase dropped the code on the way back.
    console.warn("[auth] callback hit with no code — check Supabase Redirect URLs");
    return NextResponse.redirect(`${origin}/?sync_error=missing_code`);
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/?sync_error=not_configured`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.warn("[auth] code exchange failed:", error.message);
    return NextResponse.redirect(`${origin}/?sync_error=exchange_failed`);
  }

  // "/" restores the reader's page from the quran13-page cookie, so there is no
  // need to thread a return path through the OAuth round trip.
  return NextResponse.redirect(`${origin}/`);
}
