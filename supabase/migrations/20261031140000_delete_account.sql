-- A signed-in user can delete their own account. Deleting the auth user removes, through the
-- foreign keys, their profile, progress, practice hands and puzzle results.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in to delete your account' using errcode = '42501';
  end if;
  delete from auth.users where id = me;
end
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
