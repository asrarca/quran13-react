// =============================================================================
// build-ayah-map.mjs
//
// Builds data/ayah-map.json: a { "surah:ayah" -> [page, line] } table for THIS
// app's 13-line, 847-page mushaf. This is the foundation for the natural-
// language navigation agent: an LLM resolves a question ("what's the ayah about
// wudu?") to a verse key like "5:6", and this map turns that into the page (and
// line) the app jumps to.
//
// WHY INTERPOLATION (not a direct API pull):
//   The Quran Foundation API has NO 13-line / 847-page mushaf — every layout it
//   hosts is 604/610/548 pages (run `discover` to see). So we can't read the
//   847-page numbers directly. Instead we:
//     1. Pull edition-independent structure for all 6236 ayahs from a REFERENCE
//        mushaf on the API (default: Indopak 15-line, id 6 — closest text flow
//        to this app's Indopak 13-line): each ayah's reference page + line, juz,
//        and rub_el_hizb. This gives a continuous "position through the mushaf".
//     2. Anchor that position to the app's KNOWN 847-page marks from
//        data/quran-data.json: 114 surah starts, 30 juz starts, and ~90 juz
//        sections (which carry an exact page AND line).
//     3. Piecewise-linearly interpolate every ayah's 847 page+line, then measure
//        accuracy by leave-one-out cross-validation on those anchors.
//
// Usage (Node 20+, prod creds — prelive lacks the verse/word data):
//   node --env-file=.env.local scripts/build-ayah-map.mjs discover
//   node --env-file=.env.local scripts/build-ayah-map.mjs build [referenceMushafId]
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const { QF_CLIENT_ID, QF_CLIENT_SECRET, QF_AUTH_BASE, QF_API_BASE } = process.env;

const REFERENCE_MUSHAF_DEFAULT = 6; // Indopak 15-line (610 pages)
const APP_LINES_PER_PAGE = 13;
const SECTION_RUB_OFFSET = { quarter: 3, half: 5, three_quarter: 7 }; // rub within juz

function requireEnv() {
  const missing = ["QF_CLIENT_ID", "QF_CLIENT_SECRET", "QF_AUTH_BASE", "QF_API_BASE"].filter(
    (k) => !process.env[k]
  );
  if (missing.length) {
    console.error(
      `Missing env vars: ${missing.join(", ")}\n` +
        `Fill them in .env.local (use PROD creds) and run:\n` +
        `  node --env-file=.env.local scripts/build-ayah-map.mjs ...`
    );
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

// --- discover: list available mushaf layouts ---------------------------------
async function discover(token) {
  const data = await apiGet(token, "/mushafs");
  const mushafs = data.mushafs ?? data;
  console.log("id  lines  pages  name");
  console.log("--  -----  -----  ----------------------------------------");
  for (const m of mushafs) {
    console.log(
      `${String(m.id).padEnd(4)}${String(m.lines_per_page).padEnd(7)}${String(m.pages_count).padEnd(7)}${m.name ?? ""}`
    );
  }
  console.log(
    `\nNone will be 13-line/847-page — that's expected. The build uses one of these\n` +
      `as a REFERENCE for text flow (default ${REFERENCE_MUSHAF_DEFAULT}, Indopak 15-line):\n` +
      `  node --env-file=.env.local scripts/build-ayah-map.mjs build [id]`
  );
}

// --- 1. pull ordered per-ayah structure from the reference mushaf ------------
async function fetchReferenceOrder(token, mushafId) {
  // Determine page count for this mushaf.
  const { mushafs } = await apiGet(token, "/mushafs");
  const ref = (mushafs ?? []).find((m) => m.id === Number(mushafId));
  if (!ref) throw new Error(`Reference mushaf id ${mushafId} not found. Run \`discover\`.`);
  const totalRefPages = ref.pages_count;
  console.log(`Reference: ${ref.name} (${ref.lines_per_page} lines, ${totalRefPages} pages)\n`);

  /** ordered list of ayahs as they appear in the mushaf.
   *  refPos = cumulative WORD count at the start of the ayah. Word count is
   *  edition-invariant (same words, same order), so it tracks physical text
   *  flow far better than a foreign edition's page/line positions. */
  const order = [];
  const seen = new Set();
  let cumulativeWords = 0;
  for (let page = 1; page <= totalRefPages; page++) {
    const data = await apiGet(
      token,
      `/verses/by_page/${page}?mushaf=${mushafId}&words=true&per_page=300` +
        `&fields=verse_key,words_count,juz_number,rub_el_hizb_number&word_fields=char_type_name`
    );
    for (const v of data.verses ?? []) {
      if (!v.verse_key || seen.has(v.verse_key)) continue; // first appearance = start
      seen.add(v.verse_key);
      // actual Arabic words (exclude the end-of-ayah number token)
      const words = v.words_count ?? (v.words ?? []).filter((w) => w.char_type_name === "word").length;
      order.push({
        key: v.verse_key,
        refPos: cumulativeWords, // words BEFORE this ayah
        juz: v.juz_number,
        rub: v.rub_el_hizb_number,
      });
      cumulativeWords += words;
    }
    if (page % 50 === 0 || page === totalRefPages) process.stdout.write(`\r  fetched ${page}/${totalRefPages} ref pages...`);
  }
  console.log(`\n  got ${order.length} ayahs in order (${cumulativeWords} total words).`);
  return order;
}

// --- 2. build (refPos -> app 847-position) anchors from known marks ----------
function buildAnchors(order, quranData) {
  const byKey = new Map(order.map((o) => [o.key, o]));
  const firstByPredicate = (pred) => order.find(pred);

  // pos847 is 0-based continuous: (page-1) + (line-1)/13. Line unknown -> top of page.
  const anchors = []; // { refPos, pos847, kind, key }
  const add = (refPos, page, line, kind, key) => {
    if (refPos == null) return;
    anchors.push({ refPos, pos847: (page - 1) + (line != null ? (line - 1) / APP_LINES_PER_PAGE : 0), kind, key });
  };

  // 114 surah starts (page known, line unknown)
  for (const s of quranData.surahs) {
    const o = byKey.get(`${s.num}:1`);
    if (o) add(o.refPos, s.page, null, "surah", `${s.num}:1`);
  }
  // 30 juz starts (page known, line unknown): first ayah whose juz_number === J
  for (const j of quranData.juz) {
    const o = firstByPredicate((x) => x.juz === j.num);
    if (o) add(o.refPos, j.page, null, "juz", o.key);
    // ~90 juz sections (page AND line known): rub_el_hizb boundaries
    for (const sec of j.sections ?? []) {
      const off = SECTION_RUB_OFFSET[sec.id];
      if (off == null || sec.line == null) continue;
      const rubNum = (j.num - 1) * 8 + off;
      const so = firstByPredicate((x) => x.rub === rubNum);
      if (so) add(so.refPos, sec.page, sec.line, `sec:${sec.id}`, so.key);
    }
  }

  anchors.sort((a, b) => a.refPos - b.refPos);
  return anchors;
}

// piecewise-linear interpolation of pos847 for a given refPos
function interpolate(anchors, refPos) {
  if (refPos <= anchors[0].refPos) {
    const a = anchors[0], b = anchors[1];
    return a.pos847 + (b.pos847 - a.pos847) * ((refPos - a.refPos) / (b.refPos - a.refPos || 1));
  }
  const last = anchors[anchors.length - 1];
  if (refPos >= last.refPos) {
    const a = anchors[anchors.length - 2], b = last;
    return a.pos847 + (b.pos847 - a.pos847) * ((refPos - a.refPos) / (b.refPos - a.refPos || 1));
  }
  let lo = 0, hi = anchors.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].refPos <= refPos) lo = mid; else hi = mid;
  }
  const a = anchors[lo], b = anchors[hi];
  return a.pos847 + (b.pos847 - a.pos847) * ((refPos - a.refPos) / (b.refPos - a.refPos || 1));
}

const posToPageLine = (pos847) => {
  const page = Math.min(847, Math.max(1, Math.floor(pos847) + 1));
  const line = Math.min(APP_LINES_PER_PAGE, Math.max(1, Math.round((pos847 - Math.floor(pos847)) * APP_LINES_PER_PAGE) + 1));
  return [page, line];
};

// --- 3. leave-one-out accuracy on the anchors --------------------------------
function crossValidate(anchors) {
  const report = (kind, filter) => {
    const pts = anchors.filter(filter);
    let exactPage = 0, within1 = 0, lineErrSum = 0, lineN = 0;
    for (const pt of pts) {
      const others = anchors.filter((a) => a !== pt);
      const [page, line] = posToPageLine(interpolate(others, pt.refPos));
      const [truePage, trueLine] = posToPageLine(pt.pos847);
      if (page === truePage) exactPage++;
      if (Math.abs(page - truePage) <= 1) within1++;
      if (pt.kind.startsWith("sec:")) { lineErrSum += Math.abs(line - trueLine); lineN++; }
    }
    const pct = (n) => ((100 * n) / pts.length).toFixed(1);
    console.log(
      `  ${kind.padEnd(14)} n=${String(pts.length).padStart(3)}  exact-page ${pct(exactPage)}%  ±1 ${pct(within1)}%` +
        (lineN ? `  line MAE ${(lineErrSum / lineN).toFixed(2)}` : "")
    );
  };
  console.log(`\nLeave-one-out accuracy (how well held-out anchors are predicted):`);
  report("surah starts", (a) => a.kind === "surah");
  report("juz starts", (a) => a.kind === "juz");
  report("juz sections", (a) => a.kind.startsWith("sec:"));
}

async function build(token, mushafId) {
  const quranData = JSON.parse(readFileSync(resolve(ROOT, "data/quran-data.json"), "utf8"));
  const order = await fetchReferenceOrder(token, mushafId);
  const anchors = buildAnchors(order, quranData);
  console.log(`Built ${anchors.length} anchors (surah starts + juz starts + juz sections).`);

  crossValidate(anchors);

  // final map: interpolate every ayah using ALL anchors
  const ayahToLocation = {};
  for (const o of order) ayahToLocation[o.key] = posToPageLine(interpolate(anchors, o.refPos));

  const out = {
    generatedAt: new Date().toISOString(),
    method: "interpolation",
    referenceMushafId: Number(mushafId),
    anchorCount: anchors.length,
    note: "surah:ayah -> [page, line] in this app's 13-line 847-page numbering (1-based). Interpolated; page is reliable, line is approximate.",
    ayahToLocation,
  };
  const outPath = resolve(ROOT, "data/ayah-map.json");
  writeFileSync(outPath, JSON.stringify(out));
  console.log(`\nWrote ${Object.keys(ayahToLocation).length} ayahs -> ${outPath}`);
}

async function main() {
  requireEnv();
  const [mode, arg] = process.argv.slice(2);
  const token = await getToken();
  if (mode === "discover") return discover(token);
  if (mode === "build") return build(token, arg || REFERENCE_MUSHAF_DEFAULT);
  console.error("Usage: node --env-file=.env.local scripts/build-ayah-map.mjs <discover|build> [referenceMushafId]");
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
