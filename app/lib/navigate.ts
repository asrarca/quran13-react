// Server-only: resolve a natural-language question to a Quran verse + page.
//
// "what's the ayah about wudu?" -> Claude resolves to "5:6" -> we map it to the
// app's 13-line page via data/ayah-map.json. Claude is grounded on the actual
// Quran text (it knows the corpus well); we then VALIDATE the verse key against
// the map so a hallucinated reference can never navigate the user somewhere real.
//
// Uses the Anthropic SDK directly (Claude Opus 4.8) with structured outputs — a
// single constrained call is more reliable than an agent loop for this task.

import Anthropic from "@anthropic-ai/sdk";
import { locateVerse, verseKeyExists } from "./ayah-map";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

// Claude model IDs. Point MODEL at whichever tier you want the resolver to use.
const MODELS = {
  haiku: "claude-haiku-4-5", // cheapest ($1/$5 per MTok), fine for this verse lookup
  sonnet: "claude-sonnet-5", // balanced ($3/$15), strong Quran knowledge
  opus: "claude-opus-4-8", // most capable ($5/$25)
} as const;

// July 2026: Keep Sonnet for now to get better results, since it is
// just friends and family using the app. If this app becomes popular,
// switch to Haiku.
const MODEL = MODELS.sonnet;

// The `effort` parameter is supported on Sonnet 5 / Opus 4.6+ but NOT on Haiku 4.5.
const SUPPORTS_EFFORT = (MODEL === MODELS.sonnet || MODEL === MODELS.opus);

export type NavigateMatch = {
  verseKey: string;
  surahName: string;
  page: number; // app numbering (1-based) — pass straight to goToPage
  line: number; // approximate; page-level nav is what we trust
  note: string;
  confidence: number;
};

// The resolver returns up to three matches, best first. Extra matches are
// included only when they're genuine alternatives, so the UI can offer them.
export type NavigateResult = {
  matches: NavigateMatch[];
};

const SYSTEM = `You help a Quran-reader app resolve a user's natural-language question to the most relevant verse(s) of the Quran.

Rules:
- Ground your answer in the actual text of the Quran. Identify the verse a knowledgeable reciter would point to.
- Return the verse as "surah:ayah" using the standard numbering (surahs 1-114). Example: the ablution (wudu) verse is 5:6.
- Return your single best match first, then up to two more (three total) — but only verses that are genuinely plausible answers to the same question. Never pad the list; one strong match beats a strong one plus weak filler.
- Never invent a reference. If you are genuinely unsure, pick the closest well-attested verse and set a low confidence.
- Keep each "note" to one short sentence a layperson understands. The note describes the verse itself, not why it matched.`;

// Used when the query came from voice: the user recited a verse (or fragment)
// of the Quran aloud in Arabic, and we get the raw speech-to-text transcription.
// The model must locate that recitation in the Quranic text.
const VOICE_SYSTEM = `${SYSTEM}

The user recited a verse of the Quran — or a fragment of one — aloud in Arabic, and the message below is the raw speech-to-text transcription of that recitation.
The recognizer is not tuned for Quranic Arabic: expect missing diacritics, oddly split or joined words, and substitutions of similar-sounding everyday words for Quranic ones.
Match the transcription tolerantly against the Quranic text and return the verse being recited.
Anchor on the distinctive content words of the recitation, not just its overall shape — e.g. "نبأ ابني آدم بالحق" is 5:27 (the sons of Adam), even though "نبأ … بالحق" echoes elsewhere. Do not snap to a more famous verse that merely shares the skeleton.
Return the verse being recited as your first match. If the fragment genuinely occurs in more than one place, add those other occurrences too (up to three matches total), best first.
If the recitation spans several verses, return only the single verse where it begins — never a range.`;

const MATCH_SCHEMA = {
  type: "object",
  properties: {
    verseKey: { type: "string", description: 'The verse as "surah:ayah", e.g. "5:6".' },
    surahName: { type: "string", description: "English name of the surah, e.g. Al-Ma'idah." },
    confidence: { type: "number", description: "0 to 1 — how sure you are this is the intended verse." },
    note: { type: "string", description: "One short sentence describing the verse, for a layperson." },
  },
  required: ["verseKey", "surahName", "confidence", "note"],
  additionalProperties: false,
} as const;

const SCHEMA = {
  type: "object",
  properties: {
    // Anthropic structured outputs reject array minItems/maxItems, so the "at most
    // three" cap is expressed in the description and prompt, and enforced below.
    matches: {
      type: "array",
      description: "Best-matching verse(s), most relevant first, at most three. Include extras only as real alternatives.",
      items: MATCH_SCHEMA,
    },
  },
  required: ["matches"],
  additionalProperties: false,
} as const;

export class NavigateError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// In-memory result cache. The same normalized query always resolves to the same
// verse, so we return the cached result instead of re-calling the LLM. This lives
// per server instance (resets on cold start); the route's Cache-Control headers
// add cross-user edge/browser caching on top.
const cache = new Map<string, NavigateResult>();
const CACHE_MAX = 1000;

export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function resolveQuery(query: string, voice = false): Promise<NavigateResult> {
  const trimmed = query.trim();
  if (!trimmed) throw new NavigateError("Empty query.", 400);
  if (trimmed.length > 500) throw new NavigateError("Query too long.", 400);

  // Voice queries use a different system prompt, so cache them separately.
  const key = (voice ? "voice:" : "") + normalizeQuery(trimmed);
  const cached = cache.get(key);
  if (cached) return cached;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: voice ? VOICE_SYSTEM : SYSTEM,
    // Disable thinking (Sonnet 5 would otherwise run adaptive thinking by default).
    // Effort: "low" keeps typed lookups fast, but voice queries need to match a
    // fuzzy speech-to-text transcription against recall of the whole Quran — that
    // extra bit of reasoning ("medium") stops the model snapping to a similar-but-
    // wrong verse (e.g. 5:27 "نبأ ابني آدم بالحق" mis-resolved to 18:13).
    thinking: { type: "disabled" },
    output_config: {
      ...(SUPPORTS_EFFORT ? { effort: voice ? ("medium" as const) : ("low" as const) } : {}),
      format: { type: "json_schema", schema: SCHEMA },
    },
    messages: [{ role: "user", content: trimmed }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new NavigateError("No response from model.", 502);

  type RawMatch = { verseKey: string; surahName: string; confidence: number; note: string };
  let parsed: { matches: RawMatch[] };
  try {
    parsed = JSON.parse(text.text);
  } catch {
    throw new NavigateError("Could not parse model response.", 502);
  }

  const seen = new Set<string>();
  const matches: NavigateMatch[] = [];
  for (const m of parsed.matches ?? []) {
    // A multi-verse recitation can still come back as a range ("93:1-2") despite
    // the prompt; keep the starting verse.
    const verseKey = m.verseKey.replace(/^(\d+:\d+)[-–]\d+$/, "$1");
    // Drop hallucinated or duplicate verse keys rather than failing the whole
    // request — a valid best match shouldn't be lost to a bad alternative.
    if (!verseKeyExists(verseKey) || seen.has(verseKey)) continue;
    seen.add(verseKey);
    const loc = locateVerse(verseKey)!; // exists — verseKeyExists passed
    matches.push({
      verseKey,
      surahName: m.surahName,
      page: loc.page,
      line: loc.line,
      note: m.note,
      confidence: m.confidence,
    });
    if (matches.length === 3) break; // cap: the schema can't enforce maxItems
  }

  if (matches.length === 0) {
    throw new NavigateError("Model returned no valid verse.", 422);
  }

  const result: NavigateResult = { matches };

  // Cache with a simple size cap (drop the oldest entry when full).
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, result);

  return result;
}
