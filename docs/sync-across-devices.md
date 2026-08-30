# Cross-Device Sync — Authentication, Email, and Data Sync

How signed-in users keep bookmarks, highlights, rakat markers and preferences in
step across devices, backed by Supabase (Postgres + Auth) and Resend (email).

This is the single source of truth for the feature: architecture, dashboard
setup, and every failure mode encountered while building it.

---

## Contents

1. [Design principles](#1-design-principles)
2. [Quick reference](#2-quick-reference)
3. [Data model](#3-data-model)
4. [Security model](#4-security-model-rls)
5. [Authentication](#5-authentication)
6. [Email delivery](#6-email-delivery)
7. [How syncing works](#7-how-syncing-works)
8. [Dashboard setup checklist](#8-dashboard-setup-checklist)
9. [Troubleshooting](#9-troubleshooting)
10. [Operations](#10-operations)
11. [Known limitations](#11-known-limitations)

---

## 1. Design principles

Four rules, in priority order. Most of the odd-looking decisions below follow
from them.

**1. Anonymous use is the default and stays first-class.** The reader works with
no account, exactly as it did before sync existed. Signing in is a settings row,
never a wall. If Supabase env vars are absent, the Sync row is hidden entirely
and the app is unchanged.

**2. The reader never waits on the network.** `localStorage` remains the source
of truth for rendering; Supabase is a background replica. Every sync entry point
is safe to call while signed out, offline, or unconfigured — it degrades to a
no-op rather than throwing.

**3. Nothing is silently deleted.** Merges are unions. On a genuine conflict the
server copy wins, but a local-only entry is always pushed up.

**4. Writes survive being offline.** Edits queue durably and flush when
connectivity returns — a real case for a PWA used in a masjid.

---

## 2. Quick reference

### Files

| Path | Role |
|---|---|
| `app/lib/supabase/client.ts` | Browser client. Exports `syncConfigured`, `getSupabase()` |
| `app/lib/supabase/server.ts` | Server client (imports `next/headers` — **server only**) |
| `app/lib/use-auth.ts` | `useAuth()` hook, `signInWithGoogle`, `sendEmailCode`, `verifyEmailCode` |
| `app/lib/sync.ts` | Sync engine: op queue, diffing, pull, merge |
| `app/auth/callback/route.ts` | OAuth code → session exchange |
| `app/components/AccountPanel.tsx` | Sign-in / signed-in UI |
| `app/components/SettingsSheet.tsx` | Hosts the panel (`sync` sub-view, panel index 8) |
| `app/Reader.tsx` | Integration point — write effects, merge-on-sign-in |
| `supabase/migrations/*.sql` | Schema + RLS |
| `scripts/migrate.mjs` | `npm run db:migrate` |

### Environment variables

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` + Amplify | Browser-safe |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local` + Amplify | Browser-safe; RLS is the protection, not secrecy |
| `DB_POOLER_URL` | `.env.local` only | Migrations. **Server-only** |
| `DB_CONNECTION_STRING` | `.env.local` only | Direct host; IPv6-only (see §10) |

The Google client secret and Resend API key belong in the **Supabase dashboard**,
not in this repo — Supabase performs the OAuth exchange and sends the mail. The
app never holds either credential.

### localStorage keys used by sync

| Key | Purpose |
|---|---|
| `quran13-sync-queue` | Pending write ops awaiting flush |
| `quran13-sync-merged` | User id whose first-sign-in merge already ran on this device |

Existing reader keys (`quran13-bookmarks`, `-highlights`, `-rakat`,
`-translation`) are unchanged and remain the render source.

---

## 3. Data model

Four tables. Page numbers are **internal 0-based** values — the same ones in app
state and the `quran13-page` cookie, *not* the `page + 1` shown in the UI. Line
numbers are 1-based (1–13), matching `data/quran-data.json`.

```
reader_prefs    (user_id PK)                    -- singleton, last-write-wins
bookmarks       (user_id, page)                 -- union across devices
highlights      (user_id, page, line) -> color  -- per-cell
rakat_markers   (user_id, page, line) -> number -- per-cell
```

Every primary key starts with `user_id`, which does real work: a sync becomes a
plain upsert with `on_conflict`, so replaying the same sync twice is a no-op and
no dedupe logic is needed anywhere.

**Row-per-item, not a JSON blob.** A single `jsonb` document per user would be
less code, but two devices editing different pages would clobber each other.
Per-row granularity makes concurrent edits merge without conflict.

**Which columns get CHECK constraints.** `theme`, `font_size` and highlight
`color` do — their domains live in code and change rarely. `lang` and `mushaf`
deliberately don't: both are data-driven (`app/i18n`, `data/quran-data.json`), and
a constraint would force a migration every time one is added.

---

## 4. Security model (RLS)

Row Level Security is what allows the browser to talk to Postgres directly with
the publishable key and **no API layer at all** — there are no `app/api/*` routes
for sync to write or secure.

```sql
alter table public.bookmarks enable row level security;

create policy "own rows" on public.bookmarks
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.bookmarks from anon;
```

The `with check` half matters as much as `using`: without it a client could
insert rows attributed to another user.

### Verified properties

Tested by simulating two authenticated users inside a rolled-back transaction
(`set local role authenticated` + `set local request.jwt.claims`):

| Property | Result |
|---|---|
| Anonymous read of any table | Rejected — `anon` holds no grants |
| User B reads A's rows | 0 rows |
| User B deletes A's row | `DELETE 0`; A's row intact |
| User B inserts a row owned by A | Rejected by `WITH CHECK` |
| `authenticated` retains its own grants | Confirmed (not over-revoked) |

When re-testing, note that a verifying `select` run **as B** is masked by RLS and
proves nothing — switch back to A to confirm a row survived.

### Where personal data lives

Two separate places, deliberately:

- **`auth.users`** (Supabase-managed) holds the email address.
- **The four app tables** hold only an opaque `user_id` UUID — no email, no name.

So "what page is this person reading" and "who is this person" are separated,
which is a good property for a Quran reader. Deleting a user cascades their
synced rows automatically.

---

## 5. Authentication

Supabase Auth, with two sign-in methods: **Google** and **emailed code**. No
passwords — deliberately. A password option would mean owning resets, forgotten
-password support, and users reusing a password from elsewhere, all to store a
list of bookmarks.

Auth is load-bearing in the schema (`references auth.users`, `auth.uid()` in
every policy), so switching identity providers later would mean rewriting all
four tables and every policy.

### Google flow

```
app  → supabase.auth.signInWithOAuth({ provider: 'google',
                                       redirectTo: <origin>/auth/callback })
     → https://<ref>.supabase.co/auth/v1/authorize
     → Google consent
     → https://<ref>.supabase.co/auth/v1/callback   (Google's redirect URI)
     → <origin>/auth/callback?code=...              (must be allowlisted)
     → exchangeCodeForSession(code) → session cookies → redirect to /
```

Two distinct callbacks, easily confused:

- **Google Cloud Console → Authorized redirect URI** = Supabase's callback,
  `https://<ref>.supabase.co/auth/v1/callback`. Google never sees your app's URL.
- **Supabase → Redirect URLs** = your app's `/auth/callback`.

**`redirectTo` carries no query string, on purpose.** Supabase matches it against
the project allowlist *including the query string*, so a `?next=...` fails to
match a plain allowlist entry — and Supabase does not error, it quietly redirects
to the Site URL and drops the code. Nothing is lost by omitting it: `/` re-reads
the current page from the `quran13-page` cookie (`app/page.tsx`), so the reader
returns exactly where it was.

### Email code flow

```
sendEmailCode(email)   → supabase.auth.signInWithOtp({ email })   → email sent
verifyEmailCode(email, token) → supabase.auth.verifyOtp({ type: 'email' })
```

**Codes, not magic links — this is the important decision.** A magic link opens
in the system default browser. For a home-screen-installed PWA that is a
different browsing context with a different cookie jar, so the user ends up
signed in *in Safari* while the installed app stays signed out. A typed code
never leaves the app. Omitting `emailRedirectTo` is what selects the code flow;
the email template must then render `{{ .Token }}` (see §6).

**Code length is not pinned in the app.** Supabase's OTP length is a project
setting (6–10). `AccountPanel` accepts the whole range (`OTP_MIN_LENGTH` /
`OTP_MAX_LENGTH`) and the copy avoids naming a number, so changing that dial
cannot lock users out of the form.

### Sign out

Settings → Sync across devices → Sign out. Calls `supabase.auth.signOut()`,
clears `quran13-sync-merged`, and nulls the sync baseline so writes stop going
up. **Local reader data is never deleted** — bookmarks and highlights stay on the
device.

The session row disappears from `auth.sessions` on sign-out while the synced rows
in `public.*` remain. `sessions=0` alongside populated tables therefore means
"signed out now", not "sync broken".

---

## 6. Email delivery

Supabase sends the mail, not the app. Resend is wired in as Supabase's SMTP
provider.

**Supabase's built-in email is development-only** — a few messages per hour from
a shared domain. Don't ship on it.

### SMTP settings

**Supabase → Project Settings → Authentication → SMTP Settings**

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` (the literal word, not your account email) |
| Password | Resend API key |
| Sender email | `noreply@mail.asrar.ca` |
| Sender name | `Quran 13` |

**The verified domain is the subdomain `mail.asrar.ca`. The apex `asrar.ca` is
not verified.** Sending as `noreply@asrar.ca` makes Resend reject with `403`,
which Supabase reports as an opaque `500 "Error sending magic link email"` on
`POST /auth/v1/otp` — with no mention of domains anywhere in the response.

Test the sender independently of Supabase before suspecting app code:

```bash
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" -H "Content-Type: application/json" \
  -d '{"from":"noreply@mail.asrar.ca","to":["you@example.com"],
       "subject":"probe","text":"probe"}'
```

`200` with an id means the sender is good; `403 validation_error` names the
unverified domain. Note a send-scoped Resend key returns `401` on
`GET /domains` — that is the key being correctly restricted, not a failure.

Deliverability matters more here than for ordinary mail: a sign-in code in a spam
folder is a user who cannot log in at all. Keep SPF, DKIM and DMARC in place on
the sending domain.

### Email template

**Supabase → Authentication → Emails → Magic Link template**

The stock template renders `{{ .ConfirmationURL }}` — a link. It must render
`{{ .Token }}` instead, and should contain **no** `ConfirmationURL`: offered
both, people tap the link and hit the PWA context problem above.

Subject (puts the code in the phone's notification preview, so the mail often
doesn't need opening):

```
{{ .Token }} is your Quran 13 sign-in code
```

Body — tables and inline styles are deliberate, since Gmail strips `<style>`
blocks and several clients ignore flexbox:

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="background:#f6f6f4;padding:32px 12px;margin:0;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:480px;background:#ffffff;border-radius:16px;
                    padding:36px 32px;font-family:-apple-system,BlinkMacSystemFont,
                    'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td style="font-size:18px;font-weight:600;color:#1a1a1a;padding-bottom:6px;">
            Quran 13
          </td>
        </tr>
        <tr>
          <td style="font-size:15px;line-height:1.55;color:#555555;padding-bottom:26px;">
            Enter this code in the app to sync your bookmarks across devices.
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-bottom:26px;">
            <!-- letter-spacing also adds space AFTER the last digit, which
                 shifts the code left; the asymmetric padding compensates. -->
            <div style="font-family:'SF Mono',Menlo,Consolas,monospace;
                        font-size:34px;font-weight:700;letter-spacing:10px;
                        color:#1a1a1a;background:#f2f2ef;border-radius:12px;
                        padding:18px 12px 18px 22px;">
              {{ .Token }}
            </div>
          </td>
        </tr>
        <tr>
          <td style="font-size:13px;line-height:1.55;color:#888888;">
            This code expires in one hour. If you didn't request it, you can safely
            ignore this email — nobody can access your saved pages without it.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

The one-hour wording tracks the default OTP lifetime; change it here too if you
change the setting.

---

## 7. How syncing works

### Writes: diffing at the existing seam

Reader state is held as whole objects and persisted by effects that rewrite the
entire record. Rather than instrumenting every mutation site, those effects
compare the new value against the **last synced baseline** and emit only the
delta:

```ts
useEffect(() => {
  if (!mounted) return;
  localStorage.setItem("quran13-bookmarks", JSON.stringify(bookmarks));
  const base = syncBaseline.current;
  if (base) {
    for (const op of diffBookmarks(base.bookmarks, bookmarks)) queueOp(op);
    base.bookmarks = bookmarks;
  }
}, [bookmarks, mounted]);
```

`syncBaseline` is `null` while signed out, which is what stops the initial
localStorage load from being mistaken for a burst of user edits.

**Ops, not whole state.** This is why a stale device cannot destroy another
device's data: a diff only emits a delete for a key that was in the baseline and
is now gone. A design that uploaded the full list on every change would let a
stale device erase newer remote entries.

### The queue

`queueOp` appends to `quran13-sync-queue` and attempts a flush. `flushQueue`
drains **in order** — a set followed by a delete of the same cell must not be
applied backwards — and stops at the first network failure, leaving the rest
queued. A row rejected by a *constraint* is dropped instead and logged as
`[sync] dropping op`, since retrying it forever would wedge every op behind it.

Callers never await it: the local write already happened and the UI is already
correct.

### First sign-in merge

On first sign-in for an account on a device, `mergeLocalIntoRemote` uploads local
state with `ignoreDuplicates` upserts (`ON CONFLICT DO NOTHING`), then pulls the
merged result. Rows the server already has are left untouched; rows it lacks are
inserted. Safe to run more than once.

Verified against the live database: a device signing in with page 42 already on
the server and page 77 only local kept the server's original `created_at` for 42
and added 77.

`quran13-sync-merged` records which user id has already been merged on this
device; afterwards sign-in takes the `pullSnapshot()` path instead.

### When a pull happens

Only on **app load** — the effect keys on `[mounted, userId]`. There is no
Realtime subscription, no polling, and no refetch on focus. See §11.

---

## 8. Dashboard setup checklist

None of this lives in the repo.

### Supabase → Authentication → URL Configuration

- **Site URL**: `https://quran13.asrar.ca`
- **Redirect URLs**:
  - `https://quran13.asrar.ca/auth/callback`
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3001/auth/callback`

**Mind the dev port.** `signInWithGoogle` builds the redirect from
`window.location.origin`. Port 3000 on this machine is usually taken by the
separate asrar.ca project, so Next falls back to **3001** — and `localhost:3001`
will not match an allowlist entry for `localhost:3000`. Check what the dev server
printed, or `lsof -nP -iTCP:3000,3001 -sTCP:LISTEN`. Listing both is the
low-effort fix.

### Google Cloud Console → Credentials → OAuth client ID (Web application)

- **Authorized redirect URI**: `https://bjyvvqqtcnnatxjfgksy.supabase.co/auth/v1/callback`

Copy the client ID and secret into **Supabase → Authentication → Providers →
Google** and enable it. Fill in the OAuth consent screen; while it is in
"testing" mode only listed accounts can sign in, so publish before launch.

### Email

SMTP settings and the `{{ .Token }}` template — see §6.

### Amplify → Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

`NEXT_PUBLIC_` values are inlined at build time, so they must exist during the
build. Amplify dashboard variables are exported into the build shell, so no
`amplify.yml` change is needed — unlike `ANTHROPIC_API_KEY`, which is written
into `.env.production` because it is read at runtime.

---

## 9. Troubleshooting

Every row here is a failure actually hit while building this.

| Symptom | Cause | Check / fix |
|---|---|---|
| **No "Sync across devices" row in Settings** | `NEXT_PUBLIC_SUPABASE_*` missing when the dev server booted — `syncConfigured` is evaluated at module load | Restart the dev server after any `.env.local` change |
| **Signed in with Google but tables stay empty** | Redirect URL not allowlisted (wrong port, or a query string on `redirectTo`). Supabase silently falls back to the Site URL and drops the code | `select count(*) from auth.sessions` — **user row but zero sessions** is the signature |
| **`POST /auth/v1/otp` → 500 `"Error sending magic link email"`** | SMTP failing. Usually the sender address is on an unverified domain | Probe Resend directly (§6). Also verify Username is the literal `resend` |
| **Email arrives with a link, not a code** | Template still renders `{{ .ConfirmationURL }}` | Switch it to `{{ .Token }}` (§6) |
| **Code in the email is longer than the input accepts** | Supabase OTP Length set above 6 | Already handled — input accepts 6–10. If it recurs, check `OTP_MIN/MAX_LENGTH` |
| **Signed in, but edits never reach the server** | Baseline never established, so writes skip sync | Console shows `[sync] signed in but could not reach the server` |
| **A single op never lands** | Constraint or permission rejection | Console shows `[sync] dropping op <type> <message>` |
| **Nothing syncs while offline** | Working as designed | Ops sit in `quran13-sync-queue` and flush on `online` |
| **Device B doesn't show Device A's new bookmark** | No pull while the app stays open | Reload B. See §11 |
| **`psql` cannot resolve `db.<ref>.supabase.co`** | That host is IPv6-only | Use `DB_POOLER_URL` (§10) |
| **`psql` auth fails oddly** | macOS `psql` on PATH may be ancient (9.3, pre-SCRAM) | Use `/usr/local/opt/libpq/bin/psql` |

Useful one-liner:

```bash
psql "$DB_POOLER_URL" -tAc "
select 'sessions=' || (select count(*) from auth.sessions)
    || ' users='    || (select count(*) from auth.users)
    || ' bookmarks='|| (select count(*) from public.bookmarks)
    || ' highlights='|| (select count(*) from public.highlights)
    || ' prefs='    || (select count(*) from public.reader_prefs);"
```

---

## 10. Operations

### Dependency pinning (do not "fix" these to `^` ranges)

```json
"@supabase/ssr": "0.12.0",
"@supabase/supabase-js": "2.109.0"
```

Both are pinned **exactly**, on purpose. The two packages are coupled through a
peer dependency, and the version matrix collides with the Node version:

| Package | Requires |
|---|---|
| `supabase-js@2.109.0` | Node ≥ 20 |
| `supabase-js@2.110.0`+ | **Node ≥ 22** |
| `ssr@0.12.0` | peer `supabase-js ^2.108.0` |
| `ssr@0.12.3` | peer `supabase-js ^2.110.5` |
| `ssr@0.12.5` | peer `supabase-js ^2.112.4` |

With caret ranges, npm resolves `ssr@0.12.5`, whose peer forces a `supabase-js`
that requires Node 22. On a Node 20 builder that produces a lock file npm
considers invalid, and `npm ci` fails the Amplify build with:

```
npm error `npm ci` can only install packages when your package.json and
package-lock.json are in sync.
npm error Invalid: lock file's @supabase/supabase-js@2.109.0
          does not satisfy @supabase/supabase-js@2.112.4
```

Note this fails **only under `npm ci`** — `npm install` downgrades the same peer
conflict to a warning, so local development looks fine while deploys break.

**To move to newer Supabase packages, upgrade Node to 22 first** (locally, and in
the Amplify build image), then raise both pins together. Raising one alone
reintroduces the conflict.

After any dependency change, validate the way Amplify will:

```bash
npm ci --cache .npm --prefer-offline --dry-run
```

### Migrations

```bash
npm run db:migrate
```

Applies `supabase/migrations/*.sql` in filename order. Idempotent — re-running is
safe.

### Database access

Two connection strings, same database:

- `DB_CONNECTION_STRING` — direct `db.<ref>.supabase.co`. **IPv6-only.** Fails to
  resolve on IPv4-only networks.
- `DB_POOLER_URL` — `aws-0-us-east-2.pooler.supabase.com:5432`, username
  `postgres.<ref>`. IPv4-reachable. **Use this one.**

The project region is `us-east-2`; the pooler hostname is region-scoped, so it
changes if the project ever moves.

macOS may have an ancient `psql` earlier on `PATH` (9.3 from a PHP install, which
predates SCRAM auth). `scripts/migrate.mjs` prefers Homebrew's libpq. For manual
queries use `/usr/local/opt/libpq/bin/psql`.

---

## 11. Known limitations

**No live pull while the app stays open.** A pull happens only on app load. If
Device B is already open and Device A adds a bookmark, B will not see it until
reloaded. Everything converges on the next load, and **no data is lost** — the
op-based design means a stale device cannot erase remote entries.

The intended fix is a pull on `visibilitychange`: when the app returns to the
foreground, `flushQueue()` then `pullSnapshot()` — flush first, or a pull could
overwrite state that hasn't been pushed yet. That matches how the app is used,
since reading on the other device requires foregrounding it. Supabase Realtime
would also work but is overkill: a persistent websocket and battery cost for a
scenario (two devices watched at once) that doesn't apply to a mushaf.

**Preference sync is last-write-wins** and does not currently push on change —
prefs are written at first-sign-in merge only. Bookmarks, highlights and rakat
markers are the fully live paths.

**Highlights and rakat use "server wins" on conflict** rather than newest-wins.
True newest-wins would need per-cell `updated_at` tracked client-side. Deferred
until there's evidence it matters.

**Cookies stay the first-paint path.** Theme, language and page are cookie-backed
so the first server-rendered frame is correct (`app/lib/reader-cookies.ts`).
Remote prefs must reconcile *after* hydration — making first paint wait on a
Supabase fetch would reintroduce the light→dark flash that design exists to
prevent.
