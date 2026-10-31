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

/** Which sign-in methods the project has switched on. */
export interface SignInMethods {
  google: boolean;
  email: boolean;
}

/** Read Supabase's public settings (the same switches as in its dashboard). */
export function methodsFrom(settings: unknown): SignInMethods {
  const ext = (settings as { external?: Record<string, unknown> } | null)?.external ?? {};
  return { google: ext.google === true, email: ext.email === true };
}

/** The sign-in methods on offer, from the project itself, so the site never shows one that is switched off. */
export async function fetchSignInMethods(): Promise<SignInMethods | null> {
  if (!url || !key) return null;
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    return r.ok ? methodsFrom(await r.json()) : null;
  } catch {
    return null;
  }
}
