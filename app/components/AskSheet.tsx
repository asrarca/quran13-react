import { useState } from "react";
import { CornerDownLeft, Loader2, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { type Lang, t } from "../i18n";

// Natural-language navigation: ask a question, jump to the verse's page.

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
  onClose: () => void;
  onNavigate: (page: number, line: number) => void;
};

export function AskSheet({ lang, onClose, onNavigate }: Props) {
  const examples = [t(lang, "ask.example1"), t(lang, "ask.example2"), t(lang, "ask.example3")];
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Resolved | null>(null);

  async function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/navigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Navigation failed.");
      setResult(data as Resolved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

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
      <span className="mt-1 text-[13px] text-(--fg2)">{t(lang, "ask.subtitle")}</span>

      <form
        className="mt-4 flex items-center gap-2 rounded-[14px] bg-(--bg2) px-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(query);
        }}
      >
        <Search className="size-4.5 shrink-0 text-(--fg2)" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={500}
          placeholder={t(lang, "ask.placeholder")}
          className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-(--fg) outline-none placeholder:text-(--fg3)"
        />
        <button
          type="submit"
          disabled={!query.trim() || loading}
          className="flex size-8 items-center justify-center rounded-full bg-(--fg) text-(--bg) disabled:opacity-30"
          aria-label={t(lang, "ask.title")}
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <CornerDownLeft className="size-4" />}
        </button>
      </form>

      {!result && !error && !loading && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQuery(ex);
                submit(ex);
              }}
              className="rounded-full bg-(--bg2) px-3 py-1.5 text-[12px] text-(--fg2) active:bg-border"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && <div className="mt-3 rounded-[14px] bg-(--bg2) px-3.5 py-3 text-[13px] text-(--fg2)">{error}</div>}

      {result && (
        <button
          type="button"
          onClick={() => onNavigate(result.page, result.line)}
          className="mt-3 flex w-full flex-col gap-1 rounded-[14px] bg-(--bg2) p-3.5 text-left active:bg-border"
        >
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold">
              {result.surahName} · {result.verseKey}
            </span>
            <span className="flex items-center gap-1 text-[13px] font-medium text-(--fg2)">
              {t(lang, "ask.pageLabel")} {result.page} <CornerDownLeft className="size-3.5 -scale-x-100" />
            </span>
          </div>
          <span className="text-[13px] leading-snug text-(--fg2)">{result.note}</span>
        </button>
      )}
    </div>
  );
}
