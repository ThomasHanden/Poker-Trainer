-- Supabase grants signed-in users EXECUTE on every new function in public. The account helpers
-- below are used only inside the database (a trigger, a name tidy-up), so take that away; the
-- save_* and reset functions stay callable as intended.
revoke execute on function public.handle_new_user(), public.touch_updated_at(), public.clean_display_name(text) from authenticated;
