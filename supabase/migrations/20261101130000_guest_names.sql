-- Account names belong to their account everywhere: guests at the live tables cannot use one. The
-- table server asks name_is_taken() when a guest sits down (it learns yes or no, nothing more).
-- Guests who leave the name blank are "Player", "Player 2", "Player 3"…, so those names are kept
-- for guests: an account that needs a stand-in name gets four digits ("Player 4821").

-- any account still using a guest's name (none when this was written) gets a four-digit one
update public.profiles p
set display_name = 'Player ' || (1000 + floor(random() * 9000))::int
where display_name ~* '^player( [0-9]{1,3})?$';

alter table public.profiles add constraint display_name_not_guest check (display_name !~* '^player( [0-9]{1,3})?$');

-- Is this name an account's (ignoring capitals)? Callable by anyone, answers only yes or no.
create function public.name_is_taken(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where lower(display_name) = lower(btrim(name)))
$$;
revoke execute on function public.name_is_taken(text) from public;
grant execute on function public.name_is_taken(text) to anon, authenticated;

-- A new account's name: what it signed up with or Google's first name if that is allowed and
-- free; otherwise, or if taken, a number is added ("Player 4821" when there is no usable name).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  wanted text := public.clean_display_name(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'given_name'));
  usable boolean := public.name_is_allowed(wanted) and wanted !~* '^player( [0-9]{1,3})?$';
  base text := case when usable then wanted else 'Player' end;
  candidate text := case when usable then wanted else 'Player ' || (1000 + floor(random() * 9000))::int end;
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
