-- The API's data dir (api/vfs.js): one row per file that used to live under DATA_DIR.
create table if not exists public.files (
  name       text primary key,
  body       text not null,
  version    integer not null default 1,
  updated_at timestamptz not null default now()
);
-- RLS on and no policy at all: only the service role, used server-side, can read or write.
alter table public.files enable row level security;

-- Spike S6 (watch accelerometer recordings). Throwaway: drop once the rep counter is decided.
create table if not exists public.s6_recordings (
  id         bigint generated always as identity primary key,
  name       text not null,
  csv        text not null,
  created_at timestamptz not null default now()
);
alter table public.s6_recordings enable row level security;
create policy "s6 insert only" on public.s6_recordings
  for insert to anon with check (length(csv) < 2000000);
