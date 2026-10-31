// Who is signed in, and the sign-in actions, for the whole site. Supabase does the work: Google
// sign-in, email and password (stored and checked by Supabase, never here), email confirmation,
// password resets and refreshing the session. Accounts are optional: guests can use everything
// that worked before.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AuthError, Session } from '@supabase/supabase-js';
import { fetchSignInMethods, supabase, type SignInMethods } from './supabase';
import { setLiveAccount } from '../ui/useLiveTable';
import { track } from '../ui/analytics';

export type AuthStatus = 'off' | 'loading' | 'signed-out' | 'signed-in';

export interface Account {
  /** the account's internal id: the key for everything it owns (never the email or name) */
  id: string;
  email: string | null;
  displayName: string;
  /** how they can sign in: "google", "email" */
  providers: string[];
}

export type AuthResult = { ok: true } | { ok: false; message: string };

interface AuthValue {
  status: AuthStatus;
  account: Account | null;
  /** something to tell the player wherever they are, e.g. that their session ended */
  notice: string | null;
  clearNotice(): void;
  /** they arrived from a password reset link and should choose a new password */
  recovering: boolean;
  /** the sign-in methods switched on in Supabase (null until known) */
  methods: SignInMethods | null;
  signInWithGoogle(next?: string): Promise<AuthResult>;
  signInWithPassword(email: string, password: string): Promise<AuthResult>;
  signUp(email: string, password: string, displayName: string): Promise<AuthResult & { confirm?: boolean }>;
  resendConfirmation(email: string): Promise<AuthResult>;
  sendPasswordReset(email: string): Promise<AuthResult>;
  updatePassword(password: string): Promise<AuthResult>;
  setDisplayName(name: string): Promise<AuthResult>;
  /** everywhere: also end the sessions on the player's other devices */
  signOut(everywhere?: boolean): Promise<void>;
  /** delete the account and everything saved in it, then sign out */
  deleteAccount(): Promise<AuthResult>;
  /** run before signing out (the store saves and forgets this device's copy) */
  beforeSignOut(fn: () => Promise<void>): () => void;
}

const Ctx = createContext<AuthValue | null>(null);

export const DISPLAY_NAME_MAX = 24;
export const PASSWORD_MIN = 8;
const NEXT_KEY = 'auth-next';

/** The name a player chose, tidied the way the database checks it; null if it cannot be used. */
export function cleanDisplayName(raw: string): string | null {
  const s = raw.replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim();
  return s && s.length <= DISPLAY_NAME_MAX ? s : null;
}

/** Supabase's errors in plain words. Never echoes passwords or tokens. */
export function authMessage(e: AuthError | Error | null | undefined): string {
  if (!e) return 'Something went wrong. Try again.';
  const code = (e as AuthError).code ?? '';
  const status = (e as AuthError).status;
  if (e.name === 'AuthRetryableFetchError' || /fetch|network|load failed/i.test(e.message)) return 'Could not reach the sign-in service. Check your connection and try again.';
  switch (code) {
    case 'invalid_credentials':
      return 'That email and password do not match an account.';
    case 'email_not_confirmed':
      return 'Confirm your email address first: open the link we sent you.';
    case 'user_already_exists':
    case 'email_exists':
      return 'There is already an account with this email. Sign in instead, or reset your password.';
    case 'weak_password':
      return `Choose a stronger password: at least ${PASSWORD_MIN} characters.`;
    case 'same_password':
      return 'Your new password must be different from your current one.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'reauthentication_needed':
      return 'For your security, change your password with a reset link instead (below).';
    case 'otp_expired':
    case 'flow_state_expired':
    case 'flow_state_not_found':
    case 'bad_code_verifier':
      return 'This link has expired or was already used. Request a new one.';
    case 'session_not_found':
    case 'session_expired':
    case 'refresh_token_not_found':
      return 'Your session has ended. Sign in again.';
    case 'validation_failed':
    case 'email_address_invalid':
      return 'That email address cannot be used. Check it and try again.';
    case 'email_address_not_authorized':
      // Supabase's built-in sender only mails the project's own team until an email service is set up
      return 'We cannot send email to that address yet. Sign in with Google instead, or try again later.';
  }
  if (status === 429) return 'Too many attempts. Wait a few minutes and try again.';
  return 'Something went wrong. Try again.';
}

const fail = (e: AuthError | Error | null): AuthResult => ({ ok: false, message: authMessage(e) });
// layout effects run before any page's own effects, so pages connect as the right player; the
// build renders without a browser, where it is a plain effect
const useEarlyEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
const origin = () => window.location.origin;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(supabase ? 'loading' : 'off');
  const [session, setSession] = useState<Session | null>(null);
  const [displayName, setName] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [methods, setMethods] = useState<SignInMethods | null>(null);
  const leaving = useRef(false);
  const hooks = useRef(new Set<() => Promise<void>>());
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    const { data } = sb.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') {
        setRecovering(false);
        // signed out without asking (the session ran out, or was ended elsewhere)
        if (!leaving.current) setNotice('Your session has ended. Sign in again to keep saving your progress to your account.');
        leaving.current = false;
      }
      setSession(next);
      setStatus(next ? 'signed-in' : 'signed-out');
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // only offer the sign-in methods that are switched on (Google only, for now); if the settings
  // cannot be read, Google is the one that is set up
  useEffect(() => {
    if (!supabase) return;
    let current = true;
    void fetchSignInMethods().then((m) => current && setMethods(m ?? { google: true, email: false }));
    return () => {
      current = false;
    };
  }, []);

  // the display name lives in the profile (the database checks it); reload it for each account
  useEffect(() => {
    setName(null);
    if (!supabase || !userId) return;
    let current = true;
    supabase
      .from('profiles')
      .select('display_name')
      .maybeSingle()
      .then(({ data }) => current && setName((data?.display_name as string | undefined) ?? 'Player'), () => current && setName('Player'));
    return () => {
      current = false;
    };
  }, [userId]);

  // live tables play signed-in players under their account (the server checks the token)
  useEarlyEffect(() => {
    setLiveAccount(userId && supabase ? { id: userId, token: async () => (await supabase!.auth.getSession()).data.session?.access_token ?? null } : null);
  }, [userId]);

  useEffect(() => {
    if (status === 'signed-in' && sessionStorage.getItem('auth-started')) {
      sessionStorage.removeItem('auth-started');
      track('Sign In Completed');
    }
  }, [status]);

  const account = useMemo<Account | null>(() => {
    if (!session) return null;
    const u = session.user;
    const providers = Array.isArray(u.app_metadata?.providers) ? (u.app_metadata.providers as string[]) : u.app_metadata?.provider ? [u.app_metadata.provider as string] : [];
    // '' until the profile has loaded
    return { id: u.id, email: u.email ?? null, displayName: displayName ?? '', providers };
  }, [session, displayName]);

  const started = () => {
    try {
      sessionStorage.setItem('auth-started', '1');
    } catch {
      /* only analytics */
    }
    track('Sign In Started');
  };

  const signInWithGoogle = useCallback(async (next = '/account') => {
    if (!supabase) return fail(null);
    try {
      sessionStorage.setItem(NEXT_KEY, next);
    } catch {
      /* back to the account page instead */
    }
    started();
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${origin()}/auth/callback` } });
    return error ? fail(error) : { ok: true as const };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) return fail(null);
    started();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? fail(error) : { ok: true as const };
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    if (!supabase) return fail(null);
    started();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${origin()}/auth/callback`, data: { display_name: cleanDisplayName(name) ?? undefined } },
    });
    if (error) return fail(error);
    // with email confirmation on (it should be), there is no session until the link is opened;
    // Supabase answers the same way when the email already has an account, so nobody can probe
    return { ok: true as const, confirm: !data.session };
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    if (!supabase) return fail(null);
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${origin()}/auth/callback` } });
    return error ? fail(error) : { ok: true as const };
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!supabase) return fail(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origin()}/reset-password` });
    return error ? fail(error) : { ok: true as const };
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) return fail(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return fail(error);
    setRecovering(false);
    return { ok: true as const };
  }, []);

  const setDisplayName = useCallback(
    async (raw: string) => {
      const name = cleanDisplayName(raw);
      if (!name) return { ok: false as const, message: `Use 1 to ${DISPLAY_NAME_MAX} characters.` };
      if (!supabase || !userId) return fail(null);
      const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', userId);
      if (error) return { ok: false as const, message: /fetch|network/i.test(error.message) ? 'Could not reach your account. Try again.' : 'That name could not be saved.' };
      setName(name);
      return { ok: true as const };
    },
    [userId],
  );

  const signOut = useCallback(async (everywhere = false) => {
    if (!supabase) return;
    for (const fn of hooks.current) await fn().catch(() => undefined);
    leaving.current = true;
    setNotice(null);
    const { error } = await supabase.auth.signOut({ scope: everywhere ? 'global' : 'local' });
    // signing out everywhere needs the server; if it cannot be reached, still sign out here
    if (error && everywhere) await supabase.auth.signOut({ scope: 'local' });
  }, []);

  const deleteAccount = useCallback(async () => {
    if (!supabase) return fail(null);
    const { error } = await supabase.rpc('delete_my_account');
    if (error) return { ok: false as const, message: /fetch|network/i.test(error.message) ? 'Could not reach your account. Try again.' : 'Your account could not be deleted. Try again.' };
    // the account is gone: forget this device's copy and the session
    await signOut();
    return { ok: true as const };
  }, [signOut]);

  const beforeSignOut = useCallback((fn: () => Promise<void>) => {
    hooks.current.add(fn);
    return () => void hooks.current.delete(fn);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      account,
      notice,
      clearNotice: () => setNotice(null),
      recovering,
      methods,
      signInWithGoogle,
      signInWithPassword,
      signUp,
      resendConfirmation,
      sendPasswordReset,
      updatePassword,
      setDisplayName,
      signOut,
      deleteAccount,
      beforeSignOut,
    }),
    [status, account, notice, recovering, methods, signInWithGoogle, signInWithPassword, signUp, resendConfirmation, sendPasswordReset, updatePassword, setDisplayName, signOut, deleteAccount, beforeSignOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider missing');
  return v;
}

/** A path on this site; "//x" and "/\\x" are read by browsers as other sites, so they are refused. */
export const isSitePath = (p: string) => /^\/(?![/\\])/.test(p);

/** Where to go after signing in through Google or an email link (set before leaving the site). */
export function takeNextPath(): string {
  try {
    const next = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
    // only a path on this site, never somewhere else
    return next && isSitePath(next) ? next : '/account';
  } catch {
    return '/account';
  }
}
