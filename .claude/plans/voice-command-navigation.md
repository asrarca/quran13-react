# Plan: Voice Command Navigation via Long-Press Nav Bar

## Context
The Quran reader app has a 5-button bottom nav (Surah, Juz, Page, Saved, Settings). The user wants to long-press any nav button to trigger voice recognition, then speak commands like "Surah Maryam", "Juz 10", or "Page 333" to navigate. This uses the browser's built-in Web Speech API — no third-party library needed.

**Complexity: Medium** — the pieces are individually simple but need to fit together cleanly (long-press → mic → parse → navigate).

---

## What exists to reuse
- `LONG_PRESS_MS = 600` — reuse the same threshold
- `goToPage(n)` — existing navigation function, just call it
- `surahs` array — has `num`, `name` (English: "Maryam", "Fatihah"), `page`
- `juz` array — has `num`, `page`
- `t(lang, key)` + all i18n JSON files — add new strings following existing pattern
- `navigator.vibrate?.(15)` — reuse haptic feedback pattern

---

## Implementation

### 1. New state + ref (page.tsx)
```ts
const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'error' | 'nomatch'>('idle');
const navPressTimer = useRef<number | null>(null);
```

### 2. Long-press on nav buttons
Add `onPointerDown` / `onPointerUp` / `onPointerLeave` / `onPointerCancel` to the Surah, Juz, and Page nav buttons (not Saved or Settings — no useful command there). On `onPointerDown`, start `navPressTimer`. After `LONG_PRESS_MS` (600ms), fire `startVoiceCommand()`. On early release, cancel the timer.

### 3. `startVoiceCommand()` function
```ts
function startVoiceCommand() {
  const SpeechRecognition =
    window.SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setVoiceState('error'); // auto-dismiss after 2s
    return;
  }
  navigator.vibrate?.(15);
  const rec = new SpeechRecognition();
  rec.lang = langDateLocale[lang]; // match app's current locale
  rec.interimResults = false;
  rec.maxAlternatives = 3;
  setVoiceState('listening');
  rec.onresult = (e) => {
    const transcripts = Array.from(e.results[0]).map(r => r.transcript);
    const matched = parseVoiceCommand(transcripts);
    if (matched !== null) { goToPage(matched); setVoiceState('idle'); }
    else setVoiceState('nomatch'); // auto-dismiss after 2s
  };
  rec.onerror = () => setVoiceState('error');
  rec.onend = () => { if (voiceState === 'listening') setVoiceState('idle'); };
  rec.start();
}
```

### 4. `parseVoiceCommand(transcripts: string[]): number | null`
Try each transcript alternative in order. Case-insensitive matching.

**Surah** — strip leading keyword (using `t(lang, 'nav.surah')` + "surah"/"sura" fallbacks), then:
  1. `parseInt(rest)` → `surahs[n-1].page`
  2. Scan `surahs` for `s.name.toLowerCase().includes(rest)` — first match wins
  3. Scan `surahs` for `s.arabic.includes(rest)`

**Juz** — strip keyword (using `t(lang, 'nav.juz')` + "juz" fallback) → `parseInt(rest)` → `juz.find(j => j.num === n && !j.isNisf)?.page`

**Page** — strip keyword (using `t(lang, 'nav.page')` + "page" fallback) → `parseInt(rest)` → `rest - 1` (internal 0-based), clamped

No fuzzy/Levenshtein matching needed — partial substring is sufficient for surah names.

### 5. Voice UI overlay
A small floating pill fixed at the top-center of the screen (`fixed top-4 left-1/2 -translate-x-1/2 z-50`), styled like the existing highlight picker (bg-(--bg), rounded-full, shadow). Shows:
- **listening**: pulsing `Mic` icon (from lucide-react) + `t(lang, 'voice.listening')`
- **nomatch**: `t(lang, 'voice.noMatch')` — auto-dismisses after 2s via `useEffect`
- **error**: `t(lang, 'voice.notSupported')` — auto-dismisses after 2s

### 6. i18n strings (all 8 JSON files)
Add a `"voice"` section to each:
```json
"voice": {
  "listening": "Listening…",
  "noMatch": "Not understood",
  "notSupported": "Voice not available"
}
```

---

## Files to modify
- `app/page.tsx` — state, refs, `startVoiceCommand`, `parseVoiceCommand`, nav button pointer handlers, voice UI overlay JSX
- `app/i18n/en.json` + all 7 other language files — add `voice.*` strings

---

## Not included
- No voice commands for Saved / Settings
- No fuzzy distance matching
- No continuous listening / wake word
- No waveform animation

---

## Verification
1. `npx tsc --noEmit` — clean
2. Chrome on phone: long-press Surah → mic prompt → "Surah Maryam" → page 307
3. "Juz 15" → Juz 15 start page
4. "Page 100" → page 100
5. Unsupported browser → "Voice not available" pill dismisses after 2s
6. Short-press still opens normal sheet — no regression
