// GET /api/navigate?q=<question>  ->  { verseKey, surahName, page, line, note, confidence }
//
// The natural-language navigation endpoint. GET (not POST) so the response can be
// cached by the browser and the CDN — the same question always resolves to the
// same verse, so we never need to hit the LLM twice for it.

import { NextResponse } from "next/server";
import { resolveQuery, NavigateError } from "@/app/lib/navigate";

export const runtime = "nodejs"; // Anthropic SDK needs the Node runtime, not edge

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q");
  if (typeof q !== "string" || !q.trim()) {
    return NextResponse.json({ error: "`q` query parameter is required." }, { status: 400 });
  }
  // voice=1: the query is a speech transcription — the resolver interprets it
  // phonetically. Part of the URL, so CDN/browser caches stay distinct.
  const voice = params.get("voice") === "1";

  try {
    const result = await resolveQuery(q, voice);
    return NextResponse.json(result, {
      headers: {
        // Query → verse is stable: cache in the browser (1h) and hard at the CDN
        // (1y), serving stale while revalidating so repeat lookups never re-hit the LLM.
        "Cache-Control": "public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    if (err instanceof NavigateError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("navigate error:", err);
    return NextResponse.json({ error: "Navigation failed." }, { status: 500 });
  }
}
