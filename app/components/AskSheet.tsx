import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CornerDownLeft, Loader2, Mic, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { type Lang, t, langDateLocale } from "../i18n";

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

type Resolved = {
  verseKey: string;
  surahName: string;
  page: number; // app numbering — pass straight to onNavigate
  line: number;
  note: string;
  confidence: number;
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

async function fetchNavigate(q: string): Promise<Resolved> {
  const res = await fetch(`/api/navigate?q=${encodeURIComponent(q)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Navigation failed.");
  return data as Resolved;
}

export function AskSheet({ lang, voice = false, onClose, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  // Lazy initializers: voice support is known at mount, so the unsupported
  // message / listening state start correct without a setState-in-effect.
  const [listening, setListening] = useState(() => voice && getSpeechRecognition() !== null);
  const [voiceError, setVoiceError] = useState<string | null>(() =>
    voice && getSpeechRecognition() === null ? t(lang, "ask.voiceUnsupported") : null
  );
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const examples = [t(lang, "ask.example1"), t(lang, "ask.example2"), t(lang, "ask.example3")];

  const { data: result, error, isFetching } = useQuery({
    queryKey: ["navigate", submitted],
    queryFn: () => fetchNavigate(submitted),
    enabled: submitted.length > 0,
  });

  function submit(q: string) {
    const n = normalize(q);
    if (!n || isFetching) return;
    setSubmitted(n);
  }

  useEffect(() => {
    if (!voice) return;
    const Recognition = getSpeechRecognition();
    if (!Recognition) return; // unsupported message already set by the initializer
    const rec = new Recognition();
    recognitionRef.current = rec;
    rec.lang = langDateLocale[lang];
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let final = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      setQuery(final || interim);
    };
    rec.onerror = (e) => {
      // "no-speech" / "aborted" just fall back to typing; anything else gets a message
      if (e.error !== "no-speech" && e.error !== "aborted") setVoiceError(t(lang, "ask.voiceError"));
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      if (final.trim()) submit(final);
    };
    rec.start();
    return () => {
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
      <span className="mt-1 text-[0.8125rem] text-(--fg2)">{t(lang, "ask.subtitle")}</span>

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

      {result && !isFetching && (
        <button
          type="button"
          onClick={() => onNavigate(result.page, result.line)}
          className="mt-3 flex w-full flex-col gap-1 rounded-[14px] bg-(--bg2) p-3.5 text-left active:bg-border"
        >
          <div className="flex items-center justify-between">
            <span className="text-[0.9375rem] font-semibold">
              {result.surahName} · {result.verseKey}
            </span>
            <span className="flex items-center gap-1 text-[0.8125rem] font-medium text-(--fg2)">
              {t(lang, "ask.pageLabel")} {result.page} <CornerDownLeft className="size-3.5 -scale-x-100" />
            </span>
          </div>
          <span className="text-[0.8125rem] leading-snug text-(--fg2)">{result.note}</span>
        </button>
      )}
    </div>
  );
}
