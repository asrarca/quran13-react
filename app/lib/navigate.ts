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
const MODEL = MODELS.haiku;

// The `effort` parameter is supported on Sonnet 5 / Opus 4.6+ but NOT on Haiku 4.5.
const SUPPORTS_EFFORT = MODEL !== MODELS.haiku;

export type NavigateResult = {
  verseKey: string;
  surahName: string;
  page: number; // app numbering (1-based) — pass straight to goToPage
  line: number; // approximate; page-level nav is what we trust
  note: string;
  confidence: number;
};

const SYSTEM = `You help a Quran-reader app resolve a user's natural-language question to the single most relevant verse of the Quran.

Rules:
- Ground your answer in the actual text of the Quran. Identify the verse a knowledgeable reciter would point to.
- Return the verse as "surah:ayah" using the standard numbering (surahs 1-114). Example: the ablution (wudu) verse is 5:6.
- If several verses fit, choose the single most canonical / well-known one and mention the others in the note.
- Never invent a reference. If you are genuinely unsure, pick the closest well-attested verse and set a low confidence.
- Keep "note" to one short sentence a layperson understands.`;

// Used when the query came from voice: the user recited a verse (or fragment)
// of the Quran aloud in Arabic, and we get the raw speech-to-text transcription.
// The model must locate that recitation in the Quranic text.
const VOICE_SYSTEM = `${SYSTEM}

The user recited a verse of the Quran — or a fragment of one — aloud in Arabic, and the message below is the raw speech-to-text transcription of that recitation. The recognizer is not tuned for Quranic Arabic: expect missing diacritics, oddly split or joined words, and substitutions of similar-sounding everyday words for Quranic ones. Match the transcription tolerantly against the Quranic text and return the verse being recited. If the fragment occurs in more than one verse, pick the most well-known occurrence and mention the alternatives in the note. If the recitation spans several verses, return only the single verse where it begins — never a range.`;

const SCHEMA = {
  type: "object",
  properties: {
    verseKey: { type: "string", description: 'The verse as "surah:ayah", e.g. "5:6".' },
    surahName: { type: "string", description: "English name of the surah, e.g. Al-Ma'idah." },
    confidence: { type: "number", description: "0 to 1 — how sure you are this is the intended verse." },
    note: { type: "string", description: "One short sentence on why this verse matches." },
  },
  required: ["verseKey", "surahName", "confidence", "note"],
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
    // Disable thinking (Sonnet 5 would otherwise run adaptive thinking by default),
    // and use low effort where the model supports it, to keep this a fast lookup.
    thinking: { type: "disabled" },
    output_config: {
      ...(SUPPORTS_EFFORT ? { effort: "low" as const } : {}),
      format: { type: "json_schema", schema: SCHEMA },
    },
    messages: [{ role: "user", content: trimmed }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new NavigateError("No response from model.", 502);

  let parsed: { verseKey: string; surahName: string; confidence: number; note: string };
  try {
    parsed = JSON.parse(text.text);
  } catch {
    throw new NavigateError("Could not parse model response.", 502);
  }

  // A multi-verse recitation can still come back as a range ("93:1-2") despite
  // the prompt; keep the starting verse.
  parsed.verseKey = parsed.verseKey.replace(/^(\d+:\d+)[-–]\d+$/, "$1");

  if (!verseKeyExists(parsed.verseKey)) {
    throw new NavigateError(`Model returned an invalid verse (${parsed.verseKey}).`, 422);
  }
  const loc = locateVerse(parsed.verseKey)!; // exists — verseKeyExists passed

  const result: NavigateResult = {
    verseKey: parsed.verseKey,
    surahName: parsed.surahName,
    page: loc.page,
    line: loc.line,
    note: parsed.note,
    confidence: parsed.confidence,
  };

  // Cache with a simple size cap (drop the oldest entry when full).
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, result);

  return result;
}
