-- F3: the practice log (Supabase project leanguitar, xoyatbnihfnbovnstewu).
-- Run once in the SQL editor. Safe to run again: it replaces the trigger,
-- function and policies and leaves the rows alone.
--
-- One row per practice entry: a run of the practice timer (seconds), or a tick
-- of a 21-day plan day (seconds 0, with its routine day). The app makes each
-- row's id on the device, so an entry sent twice (a retry after a dropped
-- connection) is stored once. The streak and the campfire-ready score are
-- worked out in the app from these rows (rules: docs/001-app-next-version-prd.md,
-- section 5a). Players on the buyer list read and add only their own rows;
-- rows are never changed after they are written.

create table if not exists public.practice_log (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- the player's own calendar day (their device's date) the practice was on
  day date not null,
  -- timer: the practice timer; tick: a 21-day plan day ticked done; the others are
  -- for the tools that log their own sessions later (F5 to F7)
  kind text not null,
  seconds integer not null default 0,
  -- 1 to 21: the day of the 21-day plan, when the entry is a tick
  routine_day smallint,
  -- when the device recorded it, and when the server received it
  logged_at timestamptz,
  created_at timestamptz not null default now(),
  constraint practice_log_kind_ok check (kind in ('timer','tick','routine','drill','metronome','playalong','tuner','song')),
  constraint practice_log_seconds_ok check (seconds between 0 and 21600),
  constraint practice_log_day_ok check (routine_day is null or routine_day between 1 and 21)
);

create index if not exists practice_log_user_day on public.practice_log (user_id, day);

alter table public.practice_log enable row level security;

revoke all on public.practice_log from anon, authenticated;
grant select on public.practice_log to authenticated;
grant insert (id, user_id, day, kind, seconds, routine_day, logged_at) on public.practice_log to authenticated;
grant all on public.practice_log to service_role;

drop policy if exists "practice_log: read own rows" on public.practice_log;
drop policy if exists "practice_log: insert own rows" on public.practice_log;
create policy "practice_log: read own rows" on public.practice_log
  for select to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.access a where a.email = lower((select auth.jwt()) ->> 'email')));
create policy "practice_log: insert own rows" on public.practice_log
  for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.access a where a.email = lower((select auth.jwt()) ->> 'email')));

-- Keeps every row honest: the player's own id (the app sends it with every row), a day no more than 60 days back
-- or 1 day ahead of the server's date (a phone offline for weeks still sends
-- its entries; time zones are up to a day apart), and the device time no later
-- than the server's.
create or replace function public.practice_log_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- a row for another account is refused, never moved to the signed-in one
  if auth.role() = 'authenticated' and new.user_id is distinct from auth.uid() then
    raise exception 'practice_log: row belongs to another account' using errcode = '42501';
  end if;
  if new.day < (now() at time zone 'utc')::date - 60 or new.day > (now() at time zone 'utc')::date + 1 then
    raise exception 'practice_log: day % is out of range', new.day using errcode = '22008';
  end if;
  if new.logged_at is null or new.logged_at > now() then
    new.logged_at := now();
  end if;
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.practice_log_before_insert() from public, anon, authenticated;

drop trigger if exists practice_log_before_insert on public.practice_log;
create trigger practice_log_before_insert before insert on public.practice_log
  for each row execute function public.practice_log_before_insert();
