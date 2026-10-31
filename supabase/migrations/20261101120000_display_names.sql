-- Account names: each one used by only one account (ignoring capitals), no slurs (swearing is
-- allowed), and names like "Bot 3" stay for the live tables' bots. The site checks the same rules
-- (src/multiplayer/moderation.ts) to explain a refusal; these are the ones that cannot be skipped.

-- A name's letters only: lower case, accents removed, leetspeak read as letters ("N.1.g" → "nig").
-- Keep in step with nameLetters() in src/multiplayer/moderation.ts.
create function public.name_letters(name text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(translate(regexp_replace(normalize(lower(name), NFKD), '[̀-ͯ]', '', 'g'), '013457@$!|', 'oieastasii'), '[^a-z]', '', 'g')
$$;

-- Keep the list in step with NAME_TERMS in src/multiplayer/moderation.ts (a test checks).
create function public.name_is_allowed(name text) returns boolean
language sql immutable set search_path = '' as $$
  select name !~* '^bot\M'
     and not exists (
       select 1
       from unnest(array['nigger', 'nigga', 'faggot', 'tranny', 'retard', 'chingchong', 'wetback', 'raghead', 'towelhead', 'kike', 'spastic']) as t(term)
       where public.name_letters(name) like '%' || t.term || '%'
     )
$$;

alter table public.profiles add constraint display_name_allowed check (public.name_is_allowed(display_name));
create unique index profiles_display_name_unique on public.profiles (lower(display_name));

-- A new account's name: what it signed up with or Google's first name if that is allowed and free,
-- else "Player"; if taken (perhaps by someone signing up at the same moment), a number is added.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  wanted text := public.clean_display_name(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'given_name'));
  base text := case when public.name_is_allowed(wanted) then wanted else 'Player' end;
  candidate text := base;
begin
  for attempt in 1..30 loop
    begin
      insert into public.profiles (id, display_name) values (new.id, candidate);
      return new;
    exception when unique_violation then
      candidate := btrim(left(base, 19)) || ' ' || (1000 + floor(random() * 9000))::int;
    end;
  end loop;
  insert into public.profiles (id, display_name) values (new.id, 'Player ' || substr(md5(random()::text || new.id::text), 1, 8));
  return new;
end
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.name_letters(text), public.name_is_allowed(text) from public, anon;
