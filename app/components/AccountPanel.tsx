import { useState } from "react";
import { Check, Loader2, LogOut, Mail } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { type Lang, t } from "../i18n";
import { sendEmailCode, signInWithGoogle, verifyEmailCode } from "../lib/use-auth";

type Props = {
  lang: Lang;
  email: string | null;
  signedIn: boolean;
  onSignOut: () => void;
};

// Sign-in is a two-step email flow ("enter address" → "enter code") plus a
// one-tap Google path. `stage` tracks which of the two email steps is showing.
type Stage = "idle" | "code-sent";

// Supabase allows an OTP length of 6-10, set per project under
// Authentication → Providers → Email. Span the whole range so the UI keeps
// working whichever value the project uses.
const OTP_MIN_LENGTH = 6;
const OTP_MAX_LENGTH = 10;

const GoogleMark = () => (
  <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
    <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.500h7.1c4.2-3.8 6.6-9.5 6.6-16.1z" />
    <path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.6-3.9-12.4-9.1H4.3v5.7C7.9 41.1 15.4 46 24 46z" />
    <path fill="#FBBC05" d="M11.6 28.1c-.5-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.7H4.3C2.8 17.1 2 20.4 2 24s.8 6.9 2.3 9.8l7.3-5.7z" />
    <path fill="#EA4335" d="M24 10.8c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.1 30 2 24 2 15.4 2 7.9 6.9 4.3 14.2l7.3 5.7c1.8-5.2 6.6-9.1 12.4-9.1z" />
  </svg>
);

export function AccountPanel({ lang, email, signedIn, onSignOut }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [emailInput, setEmailInput] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rowCls = "border-b border-border px-5 py-4";

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    const res = await signInWithGoogle();
    // On success the browser navigates away, so only failure lands back here.
    if (!res.ok) {
      setError(t(lang, "sync.errorGeneric"));
      setBusy(false);
    }
  }

  async function handleSendCode() {
    setError(null);
    setBusy(true);
    const res = await sendEmailCode(emailInput);
    setBusy(false);
    if (res.ok) {
      setStage("code-sent");
      setCode("");
    } else {
      setError(t(lang, "sync.errorSend"));
    }
  }

  async function handleVerify() {
    setError(null);
    setBusy(true);
    const res = await verifyEmailCode(emailInput, code);
    setBusy(false);
    if (res.ok) {
      // useAuth's onAuthStateChange flips the panel to its signed-in state.
      setStage("idle");
      setEmailInput("");
      setCode("");
    } else {
      setError(t(lang, "sync.errorCode"));
    }
  }

  if (signedIn) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={`${rowCls} flex items-center gap-3`}>
          <Check className="size-5 shrink-0 text-(--fg)" />
          <div className="min-w-0">
            <div className="text-base text-(--fg)">{t(lang, "sync.signedIn")}</div>
            <div className="truncate text-sm text-(--fg2)">{email}</div>
          </div>
        </div>
        <p className="px-5 py-4 text-sm leading-relaxed text-(--fg2)">{t(lang, "sync.onDescription")}</p>
        <div className="px-5 pb-6">
          <Button variant="outline" className="w-full gap-2" onClick={onSignOut}>
            <LogOut className="size-4" />
            {t(lang, "sync.signOut")}
          </Button>
          <p className="pt-3 text-center text-xs leading-relaxed text-(--fg3)">{t(lang, "sync.signOutNote")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="px-5 py-4 text-sm leading-relaxed text-(--fg2)">{t(lang, "sync.offDescription")}</p>

      <div className="px-5 pb-2">
        <Button variant="outline" className="w-full gap-2.5" disabled={busy} onClick={handleGoogle}>
          <GoogleMark />
          {t(lang, "sync.google")}
        </Button>
      </div>

      <div className="flex items-center gap-3 px-5 py-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wider text-(--fg3)">{t(lang, "sync.or")}</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {stage === "idle" ? (
        <div className="px-5 pb-6">
          <label className="mb-2 block text-sm text-(--fg2)" htmlFor="sync-email">
            {t(lang, "sync.emailLabel")}
          </label>
          <input
            id="sync-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder={t(lang, "sync.emailPlaceholder")}
            className="w-full rounded-xl border border-border bg-(--bg2) px-4 py-3 text-base text-(--fg) outline-none focus:border-(--fg3)"
          />
          <Button
            className="mt-3 w-full gap-2"
            disabled={busy || !emailInput.includes("@")}
            onClick={handleSendCode}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            {t(lang, "sync.sendCode")}
          </Button>
        </div>
      ) : (
        <div className="px-5 pb-6">
          <p className="mb-3 text-sm leading-relaxed text-(--fg2)">
            {t(lang, "sync.codeSent", { email: emailInput })}
          </p>
          <label className="mb-2 block text-sm text-(--fg2)" htmlFor="sync-code">
            {t(lang, "sync.codeLabel")}
          </label>
          {/* Length is deliberately not pinned to 6. Supabase's OTP length is a
              project setting (6-10, currently 8 here), so hardcoding a width
              silently locks users out whenever that dial moves. Accept the full
              range and let the server reject a genuinely wrong code. */}
          <input
            id="sync-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            maxLength={OTP_MAX_LENGTH}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, OTP_MAX_LENGTH))}
            placeholder="••••••"
            className="w-full rounded-xl border border-border bg-(--bg2) px-4 py-3 text-center text-2xl tracking-[0.4em] text-(--fg) outline-none focus:border-(--fg3)"
          />
          <Button
            className="mt-3 w-full gap-2"
            disabled={busy || code.length < OTP_MIN_LENGTH}
            onClick={handleVerify}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t(lang, "sync.verify")}
          </Button>
          <button
            type="button"
            className="mt-3 w-full text-center text-sm text-(--fg2) underline"
            onClick={() => {
              setStage("idle");
              setError(null);
            }}
          >
            {t(lang, "sync.changeEmail")}
          </button>
        </div>
      )}

      {error && <p className="px-5 pb-6 text-sm text-red-500">{error}</p>}
    </div>
  );
}
