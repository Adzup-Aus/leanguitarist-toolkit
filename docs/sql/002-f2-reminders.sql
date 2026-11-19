-- F2: email practice reminders (Supabase project leanguitar, xoyatbnihfnbovnstewu).
-- Run once in the SQL editor. Safe to run again: it replaces the functions,
-- trigger and policies and leaves the rows alone.
--
-- One row per player. The app writes the settings and the "practised" time
-- (each player only their own row). The n8n job "LEA112 | App - practice
-- reminders (every 15 min)" calls public.claim_due_reminders() with the server
-- key every 15 minutes and writes back what happened with
-- public.finish_reminder().

create table if not exists public.reminders (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  remind_at time not null default '19:30',
  -- ISO weekdays: 1 Monday ... 7 Sunday
  days smallint[] not null default '{1,2,3,4,5,7}',
  time_zone text not null default 'UTC',
  skip_if_practised boolean not null default true,
  -- last time the player ticked a practice day or campfire skill, or started
  -- the practice timer (set to the server's clock by the trigger below)
  last_practised_at timestamptz,
  -- when the time, days, zone or switches last changed (server clock)
  settings_updated_at timestamptz not null default now(),
  -- written only by the n8n job (players have no write access to these)
  last_handled_on date,
  last_outcome text,
  last_handled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reminders_days_ok check (days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  constraint reminders_tz_len check (char_length(time_zone) between 1 and 64),
  constraint reminders_outcome_ok check (last_outcome is null or last_outcome in ('sending','sent','failed','skipped'))
);

alter table public.reminders enable row level security;

-- Players: read their own row, and write only the settings and the practised time.
-- (user_id is in the update list because an upsert names every column it sends;
-- the policies keep it equal to the player's own id.)
revoke all on public.reminders from anon, authenticated;
grant select, delete on public.reminders to authenticated;
grant insert (user_id, enabled, remind_at, days, time_zone, skip_if_practised, last_practised_at)
  on public.reminders to authenticated;
grant update (user_id, enabled, remind_at, days, time_zone, skip_if_practised, last_practised_at)
  on public.reminders to authenticated;
grant all on public.reminders to service_role;

drop policy if exists "reminders: read own row" on public.reminders;
drop policy if exists "reminders: insert own row" on public.reminders;
drop policy if exists "reminders: update own row" on public.reminders;
drop policy if exists "reminders: delete own row" on public.reminders;
create policy "reminders: read own row" on public.reminders
  for select to authenticated using (user_id = (select auth.uid()));
create policy "reminders: insert own row" on public.reminders
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "reminders: update own row" on public.reminders
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "reminders: delete own row" on public.reminders
  for delete to authenticated using (user_id = (select auth.uid()));

-- Server clock for the practised time and the settings time; reject an unknown time zone.
create or replace function public.reminders_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform now() at time zone new.time_zone;  -- raises for an unknown zone name
  if tg_op = 'INSERT' then
    if new.last_practised_at is not null then new.last_practised_at := now(); end if;
    new.settings_updated_at := now();
  else
    if new.last_practised_at is distinct from old.last_practised_at then
      new.last_practised_at := case when new.last_practised_at is null then old.last_practised_at else now() end;
    end if;
    if (new.enabled, new.remind_at, new.days, new.time_zone, new.skip_if_practised)
       is distinct from (old.enabled, old.remind_at, old.days, old.time_zone, old.skip_if_practised) then
      new.settings_updated_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists reminders_before_write on public.reminders;
create trigger reminders_before_write before insert or update on public.reminders
  for each row execute function public.reminders_before_write();

-- Finds every reminder due now in its player's own time zone and marks it handled
-- for that local day in the same statement, so two runs can never both send one.
-- Due means: switched on; today (in the player's zone) is one of the chosen days;
-- the chosen time has passed within the last window_minutes; the settings were
-- saved before that time (a time saved after it has passed starts tomorrow);
-- nothing was handled for this local day yet; and the email is still on the buyer list.
-- outcome 'skipped': the player asked to skip and practised earlier that local day.
create or replace function public.claim_due_reminders(window_minutes integer default 45)
returns table (
  user_id uuid, email text, first_name text, local_date date, remind_at time,
  time_zone text, outcome text, practice jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with due as (
    select r.user_id as uid, l.ld,
      case when r.skip_if_practised and r.last_practised_at is not null
             and (r.last_practised_at at time zone r.time_zone)::date = l.ld
           then 'skipped' else 'sending' end as oc
    from public.reminders r
    cross join lateral (select (now() at time zone r.time_zone)::date as ld) l
    cross join lateral (select ((l.ld + r.remind_at) at time zone r.time_zone) as slot) s
    join auth.users u on u.id = r.user_id
    join public.access a on a.email = lower(u.email)
    where r.enabled
      and extract(isodow from l.ld)::smallint = any (r.days)
      and s.slot <= now()
      and s.slot > now() - make_interval(mins => greatest(window_minutes, 1))
      and r.settings_updated_at <= s.slot
      and (r.last_handled_on is null or r.last_handled_on < l.ld)
    for update of r skip locked
  ), upd as (
    update public.reminders r
       set last_handled_on = d.ld, last_outcome = d.oc, last_handled_at = now()
      from due d
     where r.user_id = d.uid
    returning r.user_id, r.remind_at, r.time_zone, d.ld, d.oc
  )
  select upd.user_id, lower(u.email)::text, nullif(trim(a.first_name), '')::text, upd.ld,
         upd.remind_at, upd.time_zone, upd.oc, coalesce(p.data -> 'practice', '{}'::jsonb)
    from upd
    join auth.users u on u.id = upd.user_id
    join public.access a on a.email = lower(u.email)
    left join public.progress p on p.user_id = upd.user_id;
end $$;

-- Records how a claimed reminder ended ('sent' or 'failed').
create or replace function public.finish_reminder(p_user_id uuid, p_local_date date, p_outcome text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reminders
     set last_outcome = p_outcome, last_handled_at = now()
   where user_id = p_user_id and last_handled_on = p_local_date and p_outcome in ('sent','failed');
$$;

revoke all on function public.claim_due_reminders(integer) from public, anon, authenticated;
revoke all on function public.finish_reminder(uuid, date, text) from public, anon, authenticated;
revoke all on function public.reminders_before_write() from public, anon, authenticated;
grant execute on function public.claim_due_reminders(integer) to service_role;
grant execute on function public.finish_reminder(uuid, date, text) to service_role;
