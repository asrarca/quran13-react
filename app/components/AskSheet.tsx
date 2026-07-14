import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CornerDownLeft, Loader2, Mic, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { type Lang, t } from "../i18n";
import { pageToParam } from "../lib/reader-cookies";

// Natural-language navigation: ask a question, jump to the verse's page.
// Requests go through TanStack Query, so repeating a question in the same session
// is served from cache (no refetch); the server + CDN cache it across sessions.

// Feature flag: long-pressing the header Ask button opens this sheet in voice
// mode (page.tsx checks this before arming its long-press timer). Set to false
// to make the button a plain tap-only trigger.
export const VOICE_LONG_PRESS_ENABLED = true;

// Minimal Web Speech API surface — not in TypeScript's DOM lib for the webkit-prefixed
// constructor that Safari/iOS exposes.
type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

type Match = {
  verseKey: string;
  surahName: string;
  page: number; // app numbering — pass straight to onNavigate
  line: number;
  note: string;
  confidence: number;
};

// The resolver returns up to three matches (best first); we show all it returns.
type Resolved = {
  matches: Match[];
};

type Props = {
  lang: Lang;
  voice?: boolean; // start listening for a spoken question on open (long-press entry)
  onClose: () => void;
  onNavigate: (page: number, line: number) => void;
};

// Normalize so "The Ayah About Wudu" and "the ayah about wudu" share one cache key
// (matches the server's normalization).
function normalize(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

// voice=1 tells the resolver the query is the transcription of an Arabic
// recitation of a verse, to be matched against the Quranic text.
async function fetchNavigate(q: string, voice: boolean): Promise<Resolved> {
  const res = await fetch(`/api/navigate?q=${encodeURIComponent(q)}${voice ? "&voice=1" : ""}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Navigation failed.");
  return data as Resolved;
}

const VOICE_SILENCE_MS = 1500; // stop listening this long after the last speech
const VOICE_MAX_WAIT_MS = 6000; // stop if nothing was heard at all (iOS never auto-stops)

export function AskSheet({ lang, voice = false, onClose, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState<{ q: string; voice: boolean } | null>(null);
  // Lazy initializers: voice support is known at mount, so the unsupported
  // message / listening state start correct without a setState-in-effect.
  const [listening, setListening] = useState(() => voice && getSpeechRecognition() !== null);
  const [voiceError, setVoiceError] = useState<string | null>(() =>
    voice && getSpeechRecognition() === null ? t(lang, "ask.voiceUnsupported") : null
  );
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const examples = [
    t(lang, "ask.example1"),
    t(lang, "ask.example2"),
    t(lang, "ask.example3"),
    t(lang, "ask.example4"),
  ];

  const { data: result, error, isFetching } = useQuery({
    queryKey: ["navigate", submitted?.q, submitted?.voice],
    queryFn: () => fetchNavigate(submitted!.q, submitted!.voice),
    enabled: submitted !== null,
  });

  function submit(q: string, fromVoice = false) {
    const n = normalize(q);
    if (!n || isFetching) return;
    setSubmitted({ q: n, voice: fromVoice });
  }

  useEffect(() => {
    if (!voice) return;
    const Recognition = getSpeechRecognition();
    if (!Recognition) return; // unsupported message already set by the initializer
    const rec = new Recognition();
    recognitionRef.current = rec;
    // Voice input is a recitation of the Quran itself, so always recognize Arabic
    // regardless of the app language.
    rec.lang = "ar-SA";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    // iOS never stops a session on its own, so we manage the lifecycle: stop as
    // soon as a final result lands, or after VOICE_SILENCE_MS without new speech.
    let final = "";
    let latest = "";
    let silenceTimer: number | null = null;
    const clearSilenceTimer = () => {
      if (silenceTimer !== null) window.clearTimeout(silenceTimer);
      silenceTimer = null;
    };
    const armSilenceTimer = (ms: number) => {
      clearSilenceTimer();
      silenceTimer = window.setTimeout(() => rec.stop(), ms);
    };
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      latest = final.trim() ? final : interim;
      setQuery(latest);
      if (e.results[e.results.length - 1]?.isFinal) rec.stop();
      else armSilenceTimer(VOICE_SILENCE_MS);
    };
    rec.onerror = (e) => {
      // "no-speech" / "aborted" just fall back to typing; anything else gets a message
      if (e.error !== "no-speech" && e.error !== "aborted") setVoiceError(t(lang, "ask.voiceError"));
    };
    rec.onend = () => {
      clearSilenceTimer();
      recognitionRef.current = null;
      setListening(false);
      // iOS can delay or skip isFinal entirely, so submit the best transcript we
      // have (interim included), flagged as voice for phonetic interpretation.
      if (latest.trim()) submit(latest, true);
    };
    rec.start();
    armSilenceTimer(VOICE_MAX_WAIT_MS);
    return () => {
      clearSilenceTimer();
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.abort();
      recognitionRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="animate-pop-in absolute left-1/2 top-20 z-50 flex w-[21rem] max-w-[92vw] -translate-x-1/2 flex-col rounded-3xl bg-(--bg) p-5.5 shadow-[0_20px_60px_rgba(0,0,0,0.32)]">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-lg font-semibold">
          <Sparkles className="size-4.5 text-(--fg2)" />
          {t(lang, "ask.title")}
        </span>
        <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <span className="mt-1 text-[0.8125rem] text-(--fg2)">{t(lang, voice ? "ask.subtitleVoice" : "ask.subtitle")}</span>

      <form
        className="mt-4 flex items-center gap-2 rounded-[14px] bg-(--bg2) px-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(query);
        }}
      >
        {listening ? (
          <Mic className="size-4.5 shrink-0 animate-pulse text-red-500" />
        ) : (
          <Search className="size-4.5 shrink-0 text-(--fg2)" />
        )}
        <input
          autoFocus={!voice}
          dir="auto"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={500}
          placeholder={t(lang, listening ? "ask.listening" : "ask.placeholder")}
          className="h-12 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-(--fg) outline-none placeholder:text-(--fg3)"
        />
        {listening ? (
          <button
            type="button"
            onClick={() => recognitionRef.current?.stop()}
            className="flex size-8 items-center justify-center rounded-full bg-(--fg) text-(--bg)"
            aria-label={t(lang, "ask.listening")}
          >
            <X className="size-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!query.trim() || isFetching}
            className="flex size-8 items-center justify-center rounded-full bg-(--fg) text-(--bg) disabled:opacity-30"
            aria-label={t(lang, "ask.title")}
          >
            {isFetching ? <Loader2 className="size-4 animate-spin" /> : <CornerDownLeft className="size-4" />}
          </button>
        )}
      </form>

      {voiceError && !listening && !result && !error && !isFetching && (
        <div className="mt-3 rounded-[14px] bg-(--bg2) px-3.5 py-3 text-[0.8125rem] text-(--fg2)">{voiceError}</div>
      )}

      {!result && !error && !isFetching && !listening && !voiceError && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQuery(ex);
                submit(ex);
              }}
              className="rounded-full bg-(--bg2) px-3 py-1.5 text-[0.75rem] text-(--fg2) active:bg-border"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && !isFetching && (
        <div className="mt-3 rounded-[14px] bg-(--bg2) px-3.5 py-3 text-[0.8125rem] text-(--fg2)">{error.message}</div>
      )}

      {result && !isFetching && result.matches.length > 0 && (
        // Up to three matches; cap the height and scroll if the notes run long.
        <div className="mt-3 flex max-h-[46vh] flex-col gap-2 overflow-y-auto">
          {result.matches.map((m) => (
            <button
              key={m.verseKey}
              type="button"
              onClick={() => onNavigate(m.page, m.line)}
              className="flex w-full shrink-0 flex-col gap-1 rounded-[14px] bg-(--bg2) p-3.5 text-left active:bg-border"
            >
              <div className="flex items-center justify-between">
                <span className="text-[0.9375rem] font-semibold">
                  {m.surahName} · {m.verseKey}
                </span>
                <span className="flex items-center gap-1 text-[0.8125rem] font-medium text-(--fg2)">
                  {t(lang, "ask.pageLabel")} {pageToParam(m.page)} <CornerDownLeft className="size-3.5 -scale-x-100" />
                </span>
              </div>
              <span className="text-[0.8125rem] leading-snug text-(--fg2)">{m.note}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
