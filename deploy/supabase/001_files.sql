-- The API's data dir (api/vfs.js): one row per file that used to live under DATA_DIR.
create table if not exists public.files (
  name       text primary key,
  body       text not null,
  version    integer not null default 1,
  updated_at timestamptz not null default now()
);
-- RLS on and no policy at all: only the service role, used server-side, can read or write.
alter table public.files enable row level security;
