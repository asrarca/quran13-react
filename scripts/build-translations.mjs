// =============================================================================
// build-translations.mjs
//
// Builds data/translations/{lang}.json — one bundled translation per UI language,
// mapping "surah:ayah" -> plain-text translation. Powers the per-page translation
// sheet (offline PWA; no runtime Quran Foundation dependency).
//
// One translation resource per app language, chosen from the QF catalog
// (/resources/translations). Arabic uses Tafsir al-Muyassar exposed in
// "translation mode" (id 1014), since translation-into-Arabic is N/A.
//
// Usage (Node 20+, PROD QF creds in .env.local):
//   node --env-file=.env.local scripts/build-translations.mjs
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const { QF_CLIENT_ID, QF_CLIENT_SECRET, QF_AUTH_BASE, QF_API_BASE } = process.env;

// lang -> { id, name }. Resolved from /resources/translations (see script probe).
const TRANSLATIONS = {
  en: { id: 20, name: "Saheeh International" },
  fr: { id: 31, name: "Muhammad Hamidullah" },
  es: { id: 83, name: "Sheikh Isa Garcia" },
  de: { id: 27, name: "Frank Bubenheim and Nadeem Elyas" },
  hi: { id: 122, name: "Maulana Azizul Haque al-Umari" },
  ur: { id: 234, name: "Fatah Muhammad Jalandhari" },
  ar: { id: 1014, name: "Tafsir al-Muyassar (translation mode)" },
};

function requireEnv() {
  const missing = ["QF_CLIENT_ID", "QF_CLIENT_SECRET", "QF_AUTH_BASE", "QF_API_BASE"].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(", ")}\nUse PROD creds in .env.local.`);
    process.exit(1);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getToken() {
  const basic = Buffer.from(`${QF_CLIENT_ID}:${QF_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${QF_AUTH_BASE}/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=content",
  });
  if (!res.ok) throw new Error(`Token request failed: HTTP ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (!json.access_token) throw new Error(`No access_token: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function apiGet(token, path) {
  const url = `${QF_API_BASE}/content/api/v4${path}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      headers: { "x-auth-token": token, "x-client-id": QF_CLIENT_ID, Accept: "application/json" },
    });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      await sleep(500 * (attempt + 1));
      continue;
    }
    throw new Error(`GET ${path} failed: HTTP ${res.status} ${await res.text()}`);
  }
  throw new Error(`GET ${path} failed after retries`);
}

// Canonical verse order (1:1 … 114:6) from surah verse counts — the order the QF
// bulk translation endpoint returns items in.
function canonicalKeys() {
  const { surahs } = JSON.parse(readFileSync(resolve(ROOT, "data/quran-data.json"), "utf8"));
  const keys = [];
  for (const s of [...surahs].sort((a, b) => a.num - b.num)) {
    for (let a = 1; a <= s.ayah; a++) keys.push(`${s.num}:${a}`);
  }
  return keys;
}

// Strip QF markup to plain text: drop footnote markers entirely, keep inner text
// of other tags (e.g. Muyassar's <span class="green">…</span> quoted words).
function sanitize(s) {
  return String(s)
    .replace(/<sup[^>]*>.*?<\/sup>/gis, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Fallback for resources that GROUP ayahs (e.g. tafsir-in-translation-mode), where
// the bulk endpoint returns fewer than 6236 items so index alignment is unsafe.
// Fetch per chapter, keyed by the verse_key the API attaches to each verse.
async function fetchByChapter(token, id) {
  const text = {};
  let last = ""; // forward-fill: grouped continuation verses share the group's text
  for (let n = 1; n <= 114; n++) {
    const d = await apiGet(token, `/verses/by_chapter/${n}?translations=${id}&per_page=300&fields=verse_key`);
    for (const v of d.verses ?? []) {
      if (!v.verse_key) continue;
      const raw = v.translations?.[0]?.text;
      const clean = raw != null && String(raw).trim() !== "" ? sanitize(raw) : "";
      if (clean) last = clean;
      text[v.verse_key] = clean || last;
    }
    if (n % 20 === 0 || n === 114) process.stdout.write(`${n}/114 `);
  }
  return text;
}

// Serialize with readable metadata but each "surah:ayah": "text" on one line.
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
  requireEnv();
  const token = await getToken();
  const keys = canonicalKeys();
  if (keys.length !== 6236) throw new Error(`Expected 6236 canonical keys, got ${keys.length}`);

  const outDir = resolve(ROOT, "data/translations");
  mkdirSync(outDir, { recursive: true });

  for (const [lang, { id, name }] of Object.entries(TRANSLATIONS)) {
    process.stdout.write(`\n${lang}: fetching "${name}" (id ${id})... `);
    const data = await apiGet(token, `/quran/translations/${id}?fields=text`);
    const items = data.translations ?? [];
    let text = {};
    if (items.length === keys.length) {
      // Fast path: bulk items are in canonical order, align by index.
      for (let i = 0; i < keys.length; i++) text[keys[i]] = sanitize(items[i].text);
    } else {
      // Grouped resource: refetch verse-keyed.
      process.stdout.write(`(grouped ${items.length} entries → by verse key: `);
      text = await fetchByChapter(token, id);
      process.stdout.write(`) `);
    }
    if (Object.keys(text).length !== keys.length) {
      throw new Error(`${lang}: got ${Object.keys(text).length} ayat, expected ${keys.length}.`);
    }

    const meta = { language: lang, source: name, translationId: id, generatedAt: new Date().toISOString() };
    writeFileSync(resolve(outDir, `${lang}.json`), serialize(meta, text));
    process.stdout.write(`wrote ${keys.length} ayat  (e.g. 2:255 → "${text["2:255"].slice(0, 48)}…")`);
  }
  console.log(`\n\nDone. ${Object.keys(TRANSLATIONS).length} translation files in data/translations/`);
}

main().catch((e) => {
  console.error("\n" + e.message);
  process.exit(1);
});
