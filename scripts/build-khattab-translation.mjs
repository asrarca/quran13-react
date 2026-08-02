// =============================================================================
// build-khattab-translation.mjs
//
// Builds data/translations/en-khattab.json — the second English edition ("The
// Clear Quran" by Dr. Mustafa Khattab), mapping "surah:ayah" -> plain text. Same
// { source, text } shape and one-ayah-per-line serialization as the QF-sourced
// files from build-translations.mjs, so the translation sheet loads it identically.
//
// Source: fawazahmed0/quran-api, edition "eng-mustafakhattaba" — the *Allah*
// edition (keeps "Allah" untranslated, vs the "God" edition). Verses carry an
// explicit chapter/verse, so the map is built by verse key (no index alignment)
// and then validated against the app's canonical 6236 keys.
//
// Usage (Node 20+):  node scripts/build-khattab-translation.mjs
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const EDITION = "eng-mustafakhattaba";
const SOURCE = "Dr. Mustafa Khattab, The Clear Quran";
const OUT_ID = "en-khattab";
const CDN = `https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/${EDITION}.json`;

// Canonical verse order (1:1 … 114:6) from surah verse counts.
function canonicalKeys() {
  const { surahs } = JSON.parse(readFileSync(resolve(ROOT, "data/quran-data.json"), "utf8"));
  const keys = [];
  for (const s of [...surahs].sort((a, b) => a.num - b.num)) {
    for (let a = 1; a <= s.ayah; a++) keys.push(`${s.num}:${a}`);
  }
  return keys;
}

// Whitespace-normalize only. The edition is already plain text (no HTML/footnotes);
// its em-dashes and curly quotes are intentional and kept verbatim.
function sanitize(s) {
  return String(s).replace(/\s+/g, " ").trim();
}

// Readable metadata, each "surah:ayah": "text" on its own line (matches the other
// translation files).
function serialize(meta, text) {
  let s = "{\n";
  for (const [k, v] of Object.entries(meta)) s += `  ${JSON.stringify(k)}: ${JSON.stringify(v)},\n`;
  s += `  "text": {\n`;
  s += Object.entries(text)
    .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(",\n");
  s += "\n  }\n}\n";
  return s;
}

async function main() {
  const keys = canonicalKeys();
  if (keys.length !== 6236) throw new Error(`Expected 6236 canonical keys, got ${keys.length}`);
  const expected = new Set(keys);

  process.stdout.write(`Fetching "${SOURCE}" (${EDITION})... `);
  const res = await fetch(CDN);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${CDN}`);
  const raw = await res.json();
  const verses = raw.quran;
  if (!Array.isArray(verses)) throw new Error(`Unexpected payload: no "quran" array`);
  process.stdout.write(`${verses.length} verses.\n`);

  // Build by explicit verse key — no reliance on array order.
  const text = {};
  for (const v of verses) {
    const key = `${v.chapter}:${v.verse}`;
    if (!expected.has(key)) throw new Error(`Verse key outside canonical set: ${key}`);
    if (key in text) throw new Error(`Duplicate verse key: ${key}`);
    const clean = sanitize(v.text);
    if (!clean) throw new Error(`Empty text for ${key}`);
    text[key] = clean;
  }

  // Every canonical ayah must be present, in canonical order.
  const missing = keys.filter((k) => !(k in text));
  if (missing.length) throw new Error(`Missing ${missing.length} ayat, e.g. ${missing.slice(0, 5).join(", ")}`);
  const ordered = {};
  for (const k of keys) ordered[k] = text[k];

  const outDir = resolve(ROOT, "data/translations");
  mkdirSync(outDir, { recursive: true });
  const meta = {
    language: "en",
    source: SOURCE,
    edition: `${EDITION} (fawazahmed0/quran-api)`,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(resolve(outDir, `${OUT_ID}.json`), serialize(meta, ordered));
  console.log(
    `Wrote ${keys.length} ayat → data/translations/${OUT_ID}.json` +
      `\n  1:1   → "${ordered["1:1"]}"` +
      `\n  2:255 → "${ordered["2:255"].slice(0, 56)}…"`
  );
}

main().catch((e) => {
  console.error("\n" + e.message);
  process.exit(1);
});
