-- Reader sync: cross-device storage for bookmarks, highlights, rakat markers
-- and reader preferences.
--
-- Page numbers are stored INTERNAL (0-based, Al-Fatihah = 1 in app state), the
-- same values held in localStorage/cookies. The UI displays page + 1; do not
-- store the displayed number. See app/lib/reader-cookies.ts.
--
-- Line numbers are 1-based (1..13), matching data/quran-data.json lineCoordinates.
--
-- Every table is keyed on (user_id, ...) so a sync is a plain upsert with
-- on_conflict — replaying the same sync twice is a no-op.

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- reader_prefs — singleton row per user, last-write-wins
-- ---------------------------------------------------------------------------
-- theme/font_size carry CHECK constraints because their domains live in code
-- (app/lib/reader-cookies.ts) and change rarely. lang and mushaf are left free
-- text on purpose: both are data-driven (app/i18n, data/quran-data.json) and a
-- CHECK would force a migration every time one is added.
create table if not exists public.reader_prefs (
  user_id    uuid primary key references auth.users on delete cascade,
  theme      text check (theme in ('light', 'dark', 'dark-invert')),
  lang       text,
  mushaf     text,
  font_size  text check (font_size in ('small', 'medium', 'large')),
  last_page  int  check (last_page >= 0),
  translation_editions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on column public.reader_prefs.last_page is
  'Internal 0-based page number, as stored in the quran13-page cookie.';

-- ---------------------------------------------------------------------------
-- bookmarks — additive; merges across devices as a union
-- ---------------------------------------------------------------------------
create table if not exists public.bookmarks (
  user_id    uuid not null references auth.users on delete cascade,
  page       int  not null check (page >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, page)
);

-- ---------------------------------------------------------------------------
-- highlights — one row per highlighted line
-- ---------------------------------------------------------------------------
create table if not exists public.highlights (
  user_id    uuid not null references auth.users on delete cascade,
  page       int  not null check (page >= 0),
  line       int  not null check (line >= 1),
  color      text not null check (color in ('yellow', 'green', 'red', 'blue')),
  updated_at timestamptz not null default now(),
  primary key (user_id, page, line)
);

-- ---------------------------------------------------------------------------
-- rakat_markers — numbered circles (1-20) for Taraweh breaks
-- ---------------------------------------------------------------------------
create table if not exists public.rakat_markers (
  user_id    uuid not null references auth.users on delete cascade,
  page       int  not null check (page >= 0),
  line       int  not null check (line >= 1),
  number     int  not null check (number between 1 and 20),
  updated_at timestamptz not null default now(),
  primary key (user_id, page, line)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists reader_prefs_touch on public.reader_prefs;
create trigger reader_prefs_touch before update on public.reader_prefs
  for each row execute function public.touch_updated_at();

drop trigger if exists highlights_touch on public.highlights;
create trigger highlights_touch before update on public.highlights
  for each row execute function public.touch_updated_at();

drop trigger if exists rakat_markers_touch on public.rakat_markers;
create trigger rakat_markers_touch before update on public.rakat_markers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- These policies are what let the browser talk to Postgres directly with the
-- publishable key and no API layer. The `with check` half is as important as
-- `using`: without it a client could insert rows attributed to another user.
alter table public.reader_prefs  enable row level security;
alter table public.bookmarks     enable row level security;
alter table public.highlights    enable row level security;
alter table public.rakat_markers enable row level security;

drop policy if exists "own rows" on public.reader_prefs;
create policy "own rows" on public.reader_prefs
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.bookmarks;
create policy "own rows" on public.bookmarks
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.highlights;
create policy "own rows" on public.highlights
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.rakat_markers;
create policy "own rows" on public.rakat_markers
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- anon holds no grants on these tables; only authenticated sessions reach them.
revoke all on public.reader_prefs, public.bookmarks, public.highlights, public.rakat_markers from anon;
