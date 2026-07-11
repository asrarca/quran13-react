// POST /api/navigate  { query: string }  ->  { verseKey, surahName, page, line, note, confidence }
//
// The natural-language navigation endpoint. The client sends a question, gets
// back a resolved verse + the page to jump to via goToPage().

import { NextResponse } from "next/server";
import { resolveQuery, NavigateError } from "@/app/lib/navigate";

export const runtime = "nodejs"; // Anthropic SDK needs the Node runtime, not edge

export async function POST(request: Request) {
  let body: { query?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.query !== "string") {
    return NextResponse.json({ error: "`query` must be a string." }, { status: 400 });
  }

  try {
    const result = await resolveQuery(body.query);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NavigateError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("navigate error:", err);
    return NextResponse.json({ error: "Navigation failed." }, { status: 500 });
  }
}
