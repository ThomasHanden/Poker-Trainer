-- Felt School accounts: profiles and account-owned progress.
--
-- Every row is owned by a Supabase Auth user id (auth.users.id), never by an email address or a
-- display name. Row-level security lets a signed-in user read and write only their own rows;
-- signed-out visitors (the anon role) get nothing. Chips are not stored here: they stay on the
-- live-table server (party/server.ts), which checks the same sign-in itself.
--
-- Apply once: Supabase dashboard → SQL Editor → paste this file → Run (or `supabase db push`).

-- ---------------------------------------------------------------------------------------------
-- Profiles: the name a player chooses. Email stays in auth.users, which the app never exposes.
-- ---------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null constraint display_name_valid check (
    char_length(display_name) between 1 and 24
    and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]]'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A name from what the user typed at sign-up (or Google's first name), tidied; else "Player".
create function public.clean_display_name(raw text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(btrim(left(btrim(regexp_replace(coalesce(raw, ''), '[[:cntrl:][:space:]]+', ' ', 'g')), 24)), ''), 'Player')
$$;

-- Every new account gets a profile.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, public.clean_display_name(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'given_name')));
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
create policy "Users read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "Users rename themselves" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------------------------
-- Progress: lessons, saved ranges, practice settings and display preferences, as one document.
-- Saved only through save_progress, which refuses a write based on an out-of-date copy.
-- ---------------------------------------------------------------------------------------------

create table public.progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb constraint progress_data_valid check (
    jsonb_typeof(data) = 'object' and pg_column_size(data) <= 512000
  ),
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;
create policy "Users read their own progress" on public.progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own progress" on public.progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own progress" on public.progress
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Save the progress document if nobody has saved since `expected_revision`; otherwise return the
-- newer copy so the browser can merge its own changes into it and try again.
create function public.save_progress(expected_revision bigint, new_data jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  me uuid := auth.uid();
  cur public.progress;
begin
  if me is null then
    raise exception 'Sign in to save progress' using errcode = '42501';
  end if;
  insert into public.progress (user_id) values (me) on conflict (user_id) do nothing;
  select * into cur from public.progress where user_id = me for update;
  if cur.revision <> expected_revision then
    return jsonb_build_object('saved', false, 'revision', cur.revision, 'data', cur.data);
  end if;
  update public.progress set data = new_data, revision = cur.revision + 1, updated_at = now() where user_id = me;
  return jsonb_build_object('saved', true, 'revision', cur.revision + 1);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Practice hands: one row per finished hand, keyed by the hand's own id, so saving the same hand
-- twice (a retry, a second device, an import) never makes a second copy.
-- ---------------------------------------------------------------------------------------------

create table public.practice_hands (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null constraint hand_id_valid check (id ~ '^[A-Za-z0-9:_.-]{1,64}$'),
  record jsonb not null constraint hand_record_valid check (
    jsonb_typeof(record) = 'object' and record ->> 'id' = id and pg_column_size(record) <= 32000
  ),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

alter table public.practice_hands enable row level security;
create policy "Users read their own hands" on public.practice_hands
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users add their own hands" on public.practice_hands
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users change their own hands" on public.practice_hands
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their own hands" on public.practice_hands
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Add hands, or update a hand (a bookmark) only with a newer copy. `hands` is a JSON array of
-- {"record": <hand>, "updatedAt": <ms>}. Returns how many rows were written.
create function public.save_hands(hands jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  me uuid := auth.uid();
  written integer;
begin
  if me is null then
    raise exception 'Sign in to save progress' using errcode = '42501';
  end if;
  if jsonb_typeof(hands) <> 'array' or jsonb_array_length(hands) > 500 then
    raise exception 'Send up to 500 hands at a time' using errcode = '22023';
  end if;
  insert into public.practice_hands as h (user_id, id, record, created_at, updated_at)
  select me,
         x.value -> 'record' ->> 'id',
         x.value -> 'record',
         to_timestamp((x.value -> 'record' ->> 'createdAt')::bigint / 1000.0),
         to_timestamp((x.value ->> 'updatedAt')::bigint / 1000.0)
  from jsonb_array_elements(hands) as x
  on conflict (user_id, id) do update
    set record = excluded.record, updated_at = excluded.updated_at
    where h.updated_at < excluded.updated_at;
  get diagnostics written = row_count;
  if (select count(*) from public.practice_hands where user_id = me) > 20000 then
    raise exception 'Too many saved hands' using errcode = '54000';
  end if;
  return written;
end
$$;

-- The Progress page's "Reset": practice hands and the progress document (puzzle results stay,
-- as they do in the browser).
create function public.reset_practice_progress() returns void
language plpgsql security invoker set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in to reset progress' using errcode = '42501';
  end if;
  delete from public.practice_hands where user_id = me;
  insert into public.progress (user_id) values (me) on conflict (user_id) do nothing;
  update public.progress set data = '{}'::jsonb, revision = revision + 1, updated_at = now() where user_id = me;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Daily puzzle results: one row per run, keyed by the run's id ("daily:<date>" or
-- "survival:<start time>"). The first result saved for an id stays: replaying cannot improve it.
-- ---------------------------------------------------------------------------------------------

create table public.puzzle_runs (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null constraint run_id_valid check (id ~ '^[A-Za-z0-9:_.-]{1,64}$'),
  run jsonb not null constraint run_valid check (
    jsonb_typeof(run) = 'object' and run ->> 'id' = id and pg_column_size(run) <= 4000
  ),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.puzzle_runs enable row level security;
create policy "Users read their own puzzle runs" on public.puzzle_runs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users add their own puzzle runs" on public.puzzle_runs
  for insert to authenticated with check ((select auth.uid()) = user_id);

create function public.save_puzzle_runs(runs jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  me uuid := auth.uid();
  written integer;
begin
  if me is null then
    raise exception 'Sign in to save progress' using errcode = '42501';
  end if;
  if jsonb_typeof(runs) <> 'array' or jsonb_array_length(runs) > 500 then
    raise exception 'Send up to 500 runs at a time' using errcode = '22023';
  end if;
  insert into public.puzzle_runs (user_id, id, run)
  select me, x.value ->> 'id', x.value from jsonb_array_elements(runs) as x
  on conflict (user_id, id) do nothing;
  get diagnostics written = row_count;
  return written;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Who may do what: signed-in users, through the policies above; visitors, nothing.
-- ---------------------------------------------------------------------------------------------

revoke all on public.profiles, public.progress, public.practice_hands, public.puzzle_runs from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, update on public.progress to authenticated;
grant select, insert, update, delete on public.practice_hands to authenticated;
grant select, insert on public.puzzle_runs to authenticated;

revoke execute on function public.save_progress(bigint, jsonb), public.save_hands(jsonb), public.reset_practice_progress(),
  public.save_puzzle_runs(jsonb), public.handle_new_user(), public.clean_display_name(text), public.touch_updated_at() from public, anon;
grant execute on function public.save_progress(bigint, jsonb), public.save_hands(jsonb), public.reset_practice_progress(),
  public.save_puzzle_runs(jsonb) to authenticated;
