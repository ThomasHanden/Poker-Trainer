-- Leaderboards: live-table chips, the daily five and survival.
--
-- Nothing here is written by a browser. The table server (party/server.ts) is the only writer: it
-- runs ranked puzzle runs question by question, holds everyone's chips, and calls the lb_record_* /
-- lb_sync_chips functions with the project's secret key (the service_role). Signed-in users and
-- visitors can only read, through the lb_* functions below, which show a display name and the
-- result, never an account id or an email address. Deleting an account removes its rows (foreign
-- keys), so it leaves every leaderboard at once.
--
-- Results from different rules (rules_version, see src/puzzles/ranked.ts) are kept apart.

-- ---------------------------------------------------------------------------------------------
-- The id an account plays under at the live tables: 'u' and part of a SHA-256 of its id. Same as
-- accountPlayerId() in src/multiplayer/accounts.ts (a test checks). The chip bank knows players
-- only by this id, so this is how its balances are matched to accounts.
-- ---------------------------------------------------------------------------------------------

create function public.account_player_id(id uuid) returns text
language sql immutable set search_path = '' as $$
  select 'u' || left(encode(sha256(convert_to('felt-account:' || id::text, 'UTF8')), 'hex'), 23)
$$;

create index profiles_player_id on public.profiles (public.account_player_id(id));

-- ---------------------------------------------------------------------------------------------
-- Live chips: each account's total, in table units (2 per chip): what is in its bank plus what it
-- has on live tables, so every chip counts once wherever it is. A copy of the bank's figures,
-- sent after each change; `version` only goes up, so a late or repeated copy changes nothing.
-- ---------------------------------------------------------------------------------------------

create table public.chip_standings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  bank bigint not null check (bank >= 0),
  at_tables bigint not null check (at_tables >= 0),
  chips bigint generated always as (bank + at_tables) stored,
  version bigint not null check (version >= 0),
  updated_at timestamptz not null default now()
);
create index chip_standings_rank on public.chip_standings (chips desc, user_id);

-- rows: [{"player_id": "u…", "bank": n, "at_tables": n, "version": n}]. Players with no account
-- (guests) match no profile and are skipped. Returns how many rows changed.
create function public.lb_sync_chips(rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  written integer;
begin
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 1000 then
    raise exception 'Send up to 1000 rows at a time' using errcode = '22023';
  end if;
  insert into public.chip_standings as c (user_id, bank, at_tables, version)
  select distinct on (p.id) p.id, (x ->> 'bank')::bigint, (x ->> 'at_tables')::bigint, (x ->> 'version')::bigint
  from jsonb_array_elements(rows) as r(x)
  join public.profiles p on public.account_player_id(p.id) = x ->> 'player_id'
  order by p.id, (x ->> 'version')::bigint desc
  on conflict (user_id) do update
    set bank = excluded.bank, at_tables = excluded.at_tables, version = excluded.version, updated_at = now()
    where c.version < excluded.version;
  get diagnostics written = row_count;
  return written;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Daily five: one ranked result per account per challenge (date, UTC) and rules version. The first
-- one saved stays; a second (which the server never sends) changes nothing.
-- ---------------------------------------------------------------------------------------------

create table public.daily_results (
  user_id uuid not null references auth.users (id) on delete cascade,
  challenge_date date not null,
  rules_version integer not null check (rules_version > 0),
  attempt_id text not null unique check (attempt_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  points integer not null check (points >= 0),
  correct integer not null check (correct between 0 and 5),
  answered integer not null check (answered = 5),
  ms bigint not null check (ms >= 0),
  completed_at timestamptz not null,
  -- at most 300 points per right answer (150 for speed, doubled by the combo); none for a wrong one
  check (points <= 300 * correct),
  primary key (rules_version, challenge_date, user_id)
);
create index daily_results_rank on public.daily_results (rules_version, challenge_date, points desc, user_id);

create function public.lb_record_daily(
  p_user uuid, p_attempt text, p_day date, p_version integer,
  p_points integer, p_correct integer, p_answered integer, p_ms bigint, p_completed timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  mine public.daily_results;
begin
  insert into public.daily_results (user_id, challenge_date, rules_version, attempt_id, points, correct, answered, ms, completed_at)
  values (p_user, p_day, p_version, p_attempt, p_points, p_correct, p_answered, p_ms, p_completed)
  on conflict do nothing;
  select * into mine from public.daily_results where rules_version = p_version and challenge_date = p_day and user_id = p_user;
  if mine is null or mine.attempt_id <> p_attempt then
    return jsonb_build_object('saved', false, 'reason', 'another-result');
  end if;
  return jsonb_build_object(
    'saved', true,
    'points', mine.points,
    'rank', 1 + (select count(*) from public.daily_results d where d.rules_version = p_version and d.challenge_date = p_day and d.points > mine.points),
    'entries', (select count(*) from public.daily_results d where d.rules_version = p_version and d.challenge_date = p_day)
  );
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Survival: every finished run is kept (survival_runs), and each account's best per rules version,
-- all time and per week (survival_bests), is what the leaderboards rank. A best is replaced only
-- by a strictly higher score, so a worse run, or an equal later one, never overwrites it. Weeks
-- are ISO weeks in UTC (Monday 00:00 to Sunday 24:00), keyed like 2026-W44.
-- ---------------------------------------------------------------------------------------------

create table public.survival_runs (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{8,64}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  rules_version integer not null check (rules_version > 0),
  points integer not null check (points >= 0),
  correct integer not null check (correct >= 0),
  answered integer not null check (answered between 1 and 1000),
  ms bigint not null check (ms >= 0),
  week text not null check (week ~ '^[0-9]{4}-W[0-9]{2}$'),
  completed_at timestamptz not null,
  check (correct <= answered and points <= 300 * correct)
);
create index survival_runs_user on public.survival_runs (user_id, rules_version, completed_at);

create table public.survival_bests (
  rules_version integer not null,
  period text not null check (period = 'all' or period ~ '^[0-9]{4}-W[0-9]{2}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  run_id text not null references public.survival_runs (id) on delete cascade,
  points integer not null,
  correct integer not null,
  answered integer not null,
  completed_at timestamptz not null,
  primary key (rules_version, period, user_id)
);
create index survival_bests_rank on public.survival_bests (rules_version, period, points desc, user_id);

create function public.survival_week(at timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(at at time zone 'UTC', 'IYYY-"W"IW')
$$;

create function public.lb_record_survival(
  p_user uuid, p_run text, p_version integer,
  p_points integer, p_correct integer, p_answered integer, p_ms bigint, p_completed timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  wk text := public.survival_week(p_completed);
  owner uuid;
  prev integer;
  best public.survival_bests;
  wbest public.survival_bests;
  p_period text;
begin
  insert into public.survival_runs (id, user_id, rules_version, points, correct, answered, ms, week, completed_at)
  values (p_run, p_user, p_version, p_points, p_correct, p_answered, p_ms, wk, p_completed)
  on conflict (id) do nothing;
  select user_id into owner from public.survival_runs where id = p_run;
  if owner is distinct from p_user then
    return jsonb_build_object('saved', false, 'reason', 'another-run');
  end if;
  -- each upsert is atomic, so two runs saved at the same moment cannot both replace the old best
  foreach p_period in array array['all', wk] loop
    insert into public.survival_bests as b (rules_version, period, user_id, run_id, points, correct, answered, completed_at)
    values (p_version, p_period, p_user, p_run, p_points, p_correct, p_answered, p_completed)
    on conflict (rules_version, period, user_id) do update
      set run_id = excluded.run_id, points = excluded.points, correct = excluded.correct,
          answered = excluded.answered, completed_at = excluded.completed_at
      where b.points < excluded.points;
  end loop;
  -- the best before this run (asking again after a retry gives the same answer)
  select max(points) into prev from public.survival_runs
    where user_id = p_user and rules_version = p_version and id <> p_run and (completed_at, id) < (p_completed, p_run);
  select * into best from public.survival_bests where rules_version = p_version and period = 'all' and user_id = p_user;
  select * into wbest from public.survival_bests where rules_version = p_version and period = wk and user_id = p_user;
  return jsonb_build_object(
    'saved', true,
    'week', wk,
    'best', best.points,
    'previous_best', prev,
    'new_best', prev is null or p_points > prev,
    'rank', 1 + (select count(*) from public.survival_bests s where s.rules_version = p_version and s.period = 'all' and s.points > best.points),
    'entries', (select count(*) from public.survival_bests s where s.rules_version = p_version and s.period = 'all'),
    'week_rank', 1 + (select count(*) from public.survival_bests s where s.rules_version = p_version and s.period = wk and s.points > wbest.points)
  );
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Reading. Anyone may read the leaderboards. Equal scores share a rank (rank()); the order among
-- them (by an internal id) only keeps pages steady and means nothing. is_me marks the reader.
-- ---------------------------------------------------------------------------------------------

create function public.lb_chips(lim integer default 25, off integer default 0)
returns table (rank bigint, name text, chips bigint, bank bigint, at_tables bigint, is_me boolean, entries bigint)
language sql stable security definer set search_path = '' as $$
  with ranked as (
    select c.user_id, p.display_name, c.chips, c.bank, c.at_tables,
           rank() over (order by c.chips desc) as rank, count(*) over () as entries
    from public.chip_standings c join public.profiles p on p.id = c.user_id
    where c.chips > 0
  )
  select r.rank, r.display_name, r.chips, r.bank, r.at_tables, r.user_id = (select auth.uid()), r.entries
  from ranked r
  order by r.chips desc, r.user_id
  limit least(greatest(lim, 1), 100) offset greatest(off, 0)
$$;

create function public.lb_daily(day date, version integer, lim integer default 25, off integer default 0)
returns table (rank bigint, name text, points integer, correct integer, answered integer, is_me boolean, entries bigint)
language sql stable security definer set search_path = '' as $$
  with ranked as (
    select d.user_id, p.display_name, d.points, d.correct, d.answered,
           rank() over (order by d.points desc) as rank, count(*) over () as entries
    from public.daily_results d join public.profiles p on p.id = d.user_id
    where d.rules_version = version and d.challenge_date = day
  )
  select r.rank, r.display_name, r.points, r.correct, r.answered, r.user_id = (select auth.uid()), r.entries
  from ranked r
  order by r.points desc, r.user_id
  limit least(greatest(lim, 1), 100) offset greatest(off, 0)
$$;

-- period: 'all' or a week such as 2026-W44
create function public.lb_survival(period text, version integer, lim integer default 25, off integer default 0)
returns table (rank bigint, name text, points integer, correct integer, answered integer, completed_at timestamptz, is_me boolean, entries bigint)
language sql stable security definer set search_path = '' as $$
  with ranked as (
    select s.user_id, p.display_name, s.points, s.correct, s.answered, s.completed_at,
           rank() over (order by s.points desc) as rank, count(*) over () as entries
    from public.survival_bests s join public.profiles p on p.id = s.user_id
    where s.rules_version = version and s.period = lb_survival.period
  )
  select r.rank, r.display_name, r.points, r.correct, r.answered, r.completed_at, r.user_id = (select auth.uid()), r.entries
  from ranked r
  order by r.points desc, r.user_id
  limit least(greatest(lim, 1), 100) offset greatest(off, 0)
$$;

-- Challenge dates that have results, newest first, for looking back.
create function public.lb_daily_days(version integer, lim integer default 30)
returns table (day date, entries bigint)
language sql stable security definer set search_path = '' as $$
  select d.challenge_date, count(*) from public.daily_results d
  where d.rules_version = version
  group by d.challenge_date
  order by d.challenge_date desc
  limit least(greatest(lim, 1), 366)
$$;

-- The reader's own place on one board, wherever it is in the list (null: not on it, or signed out).
-- board: 'chips', 'daily' (period: the date) or 'survival' (period: 'all' or a week).
create function public.lb_standing(board text, period text default null, version integer default 1) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  out jsonb;
begin
  if me is null then
    return null;
  end if;
  if board = 'chips' then
    select jsonb_build_object('rank', 1 + (select count(*) from public.chip_standings o where o.chips > c.chips),
                              'entries', (select count(*) from public.chip_standings o where o.chips > 0),
                              'chips', c.chips, 'bank', c.bank, 'at_tables', c.at_tables)
      into out from public.chip_standings c where c.user_id = me and c.chips > 0;
  elsif board = 'daily' then
    select jsonb_build_object('rank', 1 + (select count(*) from public.daily_results o where o.rules_version = version and o.challenge_date = d.challenge_date and o.points > d.points),
                              'entries', (select count(*) from public.daily_results o where o.rules_version = version and o.challenge_date = d.challenge_date),
                              'points', d.points, 'correct', d.correct, 'answered', d.answered)
      into out from public.daily_results d where d.user_id = me and d.rules_version = version and d.challenge_date = period::date;
  elsif board = 'survival' then
    select jsonb_build_object('rank', 1 + (select count(*) from public.survival_bests o where o.rules_version = version and o.period = s.period and o.points > s.points),
                              'entries', (select count(*) from public.survival_bests o where o.rules_version = version and o.period = s.period),
                              'points', s.points, 'correct', s.correct, 'answered', s.answered, 'completed_at', s.completed_at)
      into out from public.survival_bests s where s.user_id = me and s.rules_version = version and s.period = lb_standing.period;
  end if;
  return out;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Who may do what: nobody touches the tables directly; anyone reads through lb_*; only the table
-- server (service_role) writes.
-- ---------------------------------------------------------------------------------------------

alter table public.chip_standings enable row level security;
alter table public.daily_results enable row level security;
alter table public.survival_runs enable row level security;
alter table public.survival_bests enable row level security;
revoke all on public.chip_standings, public.daily_results, public.survival_runs, public.survival_bests from anon, authenticated;

-- account_player_id stays callable: renaming yourself updates the index that uses it, and it only
-- hashes an id.
revoke execute on function
  public.survival_week(timestamptz),
  public.lb_sync_chips(jsonb),
  public.lb_record_daily(uuid, text, date, integer, integer, integer, integer, bigint, timestamptz),
  public.lb_record_survival(uuid, text, integer, integer, integer, integer, bigint, timestamptz)
from public, anon, authenticated;
grant execute on function
  public.lb_sync_chips(jsonb),
  public.lb_record_daily(uuid, text, date, integer, integer, integer, integer, bigint, timestamptz),
  public.lb_record_survival(uuid, text, integer, integer, integer, integer, bigint, timestamptz)
to service_role;

revoke execute on function
  public.lb_chips(integer, integer), public.lb_daily(date, integer, integer, integer),
  public.lb_survival(text, integer, integer, integer), public.lb_daily_days(integer, integer),
  public.lb_standing(text, text, integer)
from public;
grant execute on function
  public.lb_chips(integer, integer), public.lb_daily(date, integer, integer, integer),
  public.lb_survival(text, integer, integer, integer), public.lb_daily_days(integer, integer),
  public.lb_standing(text, text, integer)
to anon, authenticated;
