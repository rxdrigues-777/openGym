-- Spike S6: accelerometer recordings sent by the watch spike app with the public (anon) key.
-- Throwaway, and capped so a leaked key cannot fill the free tier (which would make the project
-- read-only and stop every workout from saving): at most 100 rows of < 400 kB each (~40 MB).
-- Remove with: drop table public.s6_recordings; drop function public.s6_cap();
create table if not exists public.s6_recordings (
  id         bigint generated always as identity primary key,
  name       text not null,
  csv        text not null,
  created_at timestamptz not null default now()
);
alter table public.s6_recordings enable row level security;
drop policy if exists "s6 insert only" on public.s6_recordings;
create policy "s6 insert only" on public.s6_recordings
  for insert to anon with check (length(csv) < 400000);

-- Security definer: anon has no SELECT under RLS, so a plain count would always see zero rows.
create or replace function public.s6_cap() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.s6_recordings) >= 100 then
    raise exception 's6_recordings is capped at 100 rows';
  end if;
  return new;
end $$;
drop trigger if exists s6_cap on public.s6_recordings;
create trigger s6_cap before insert on public.s6_recordings
  for each row execute function public.s6_cap();
