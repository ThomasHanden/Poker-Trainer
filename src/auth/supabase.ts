// The Supabase connection for accounts. Both settings are public (they are in every page anyway);
// what a signed-in user may read or change is enforced by the database's row-level security
// (supabase/migrations). Without them, accounts are simply off and the site works as before.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** null when accounts are not set up, and during the build (which renders pages without a browser). */
export const supabase: SupabaseClient | null =
  url && key && typeof window !== 'undefined'
    ? createClient(url, key, {
        auth: {
          // the code from Google or an email link is swapped for a session by this browser only
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const accountsEnabled = () => !!supabase;
