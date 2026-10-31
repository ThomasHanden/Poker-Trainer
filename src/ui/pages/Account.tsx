// Sign in, create an account, reset a password, and the account page. Supabase checks passwords
// and sends the emails; these pages only collect what it needs and say what happened.
import { FormEvent, useEffect, useId, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { DISPLAY_NAME_MAX, PASSWORD_MIN, authMessage, cleanDisplayName, isSitePath, takeNextPath, useAuth } from '../../auth/AuthContext';
import { supabase } from '../../auth/supabase';
import { useStore } from '../store';
import { PARTY_HOST, fetchBankroll, fetchGuestBankroll, moveGuestChips, type Bankroll } from '../useLiveTable';
import { fmtChips } from '../../multiplayer/table';
import type { GuestSummary } from '../../persistence/accountSync';

/** Only a path on this site: never send someone elsewhere after signing in. */
const safeNext = (p: string | null) => (p && isSitePath(p) ? p : '/account');

function NotSetUp() {
  return (
    <div className="page auth-page">
      <h1>Accounts</h1>
      <p>Accounts are not switched on for this site yet. Everything still works without one: your progress is saved in this browser.</p>
    </div>
  );
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  hint,
  error,
  autoFocus,
  maxLength,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  hint?: string;
  error?: string | null;
  autoFocus?: boolean;
  maxLength?: number;
}) {
  const id = useId();
  const [show, setShow] = useState(false);
  const password = type === 'password';
  return (
    <div className="field auth-field">
      <label htmlFor={id}>{label}</label>
      <div className={password ? 'auth-pw' : undefined}>
        <input
          id={id}
          type={password && show ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          maxLength={maxLength}
          required
          aria-invalid={!!error}
          aria-describedby={[hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined}
        />
        {password && (
          <button type="button" className="btn small ghost" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {hint && (
        <span id={`${id}-hint`} className="note">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-err`} className="error">
          {error}
        </span>
      )}
    </div>
  );
}

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

type Mode = 'signin' | 'signup' | 'reset';

export function LoginPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'google' | 'form' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<'confirm' | 'reset' | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);

  useEffect(() => {
    if (auth.status === 'signed-in') nav(next, { replace: true });
  }, [auth.status, next, nav]);
  useEffect(() => {
    setError(null);
    setSent(null);
    setUnconfirmed(false);
  }, [mode]);

  if (auth.status === 'off') return <NotSetUp />;
  const methods = auth.methods;
  if (!methods)
    return (
      <div className="page auth-page">
        <p className="loading" role="status">
          Loading…
        </p>
      </div>
    );
  if (!methods.google && !methods.email)
    return (
      <div className="page auth-page">
        <h1>Sign in</h1>
        <p>Signing in is not available right now. Lessons, practice and live tables all work without an account.</p>
      </div>
    );
  // without email accounts there is only one way in, and it also creates the account
  const googleOnly = !methods.email;

  const google = async () => {
    setBusy('google');
    setError(null);
    const r = await auth.signInWithGoogle(next);
    // on success the browser is already on its way to Google
    if (!r.ok) {
      setError(r.message);
      setBusy(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setUnconfirmed(false);
    if (mode === 'signup' && password.length < PASSWORD_MIN) return setError(`Use at least ${PASSWORD_MIN} characters for your password.`);
    if (mode === 'signup' && name.trim() && !cleanDisplayName(name)) return setError(`Your name can be up to ${DISPLAY_NAME_MAX} characters.`);
    setBusy('form');
    try {
      if (mode === 'signin') {
        const r = await auth.signInWithPassword(email, password);
        if (!r.ok) {
          setError(r.message);
          setUnconfirmed(/confirm your email/i.test(r.message));
        }
      } else if (mode === 'signup') {
        const r = await auth.signUp(email, password, name);
        if (!r.ok) setError(r.message);
        else if (r.confirm) setSent('confirm');
      } else {
        const r = await auth.sendPasswordReset(email);
        if (!r.ok) setError(r.message);
        else setSent('reset');
      }
    } finally {
      setBusy(null);
    }
  };

  const resend = async () => {
    setBusy('form');
    const r = await auth.resendConfirmation(email);
    setBusy(null);
    setError(r.ok ? null : r.message);
    if (r.ok) setSent('confirm');
  };

  const title = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create an account' : 'Reset your password';
  return (
    <div className="page auth-page">
      <h1>{title}</h1>
      <p className="lead">
        {mode === 'reset'
          ? 'We will email you a link to choose a new password.'
          : 'Keep your lessons, practice hands, puzzle results, settings and chips on every device. Lessons, practice and live tables all work without an account too.'}
      </p>

      {sent === 'confirm' ? (
        <div className="auth-card" role="status">
          <h2>Check your email</h2>
          <p>
            We sent a link to <strong>{email.trim()}</strong>. Open it to finish creating your account. (If that email already has an account, the link signs you in
            instead.)
          </p>
          <p className="note">Open the link in this browser. Nothing in your inbox? Check spam, or</p>
          <button className="btn" onClick={resend} disabled={busy !== null}>
            {busy ? 'Sending…' : 'Send the link again'}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : sent === 'reset' ? (
        <div className="auth-card" role="status">
          <h2>Check your email</h2>
          <p>
            If an account uses <strong>{email.trim()}</strong>, we have sent it a link to choose a new password. Open the link in this browser; it works once and
            expires after an hour.
          </p>
          <button className="linklike" onClick={() => setMode('signin')}>
            Back to sign in
          </button>
        </div>
      ) : (
        <div className="auth-card">
          {mode !== 'reset' && methods.google && (
            <>
              <button className="btn auth-google" onClick={google} disabled={busy !== null}>
                <GoogleMark />
                {busy === 'google' ? 'Opening Google…' : googleOnly ? 'Continue with Google' : mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}
              </button>
              {googleOnly && <p className="note">No account yet? Continuing with Google creates one. We only get your name, email address and profile picture from Google.</p>}
              {error && googleOnly && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {!googleOnly && (
                <p className="auth-or">
                  <span>or with email</span>
                </p>
              )}
            </>
          )}
          {!googleOnly && (
            <form onSubmit={submit} noValidate>
              {mode === 'signup' && (
                <Field label="Display name (optional)" value={name} onChange={setName} autoComplete="nickname" maxLength={DISPLAY_NAME_MAX} hint="What other players see. You can change it later." />
              )}
              <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" autoFocus />
              {mode !== 'reset' && (
                <Field
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  hint={mode === 'signup' ? `At least ${PASSWORD_MIN} characters.` : undefined}
                />
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {unconfirmed && (
                <button type="button" className="linklike" onClick={resend}>
                  Send the confirmation link again
                </button>
              )}
              <button className="btn primary auth-submit" type="submit" disabled={busy !== null || !email.trim() || (mode !== 'reset' && !password)}>
                {busy === 'form' ? 'One moment…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Email me a reset link'}
              </button>
            </form>
          )}
          {!googleOnly && (
            <p className="auth-switch">
              {mode === 'signin' ? (
                <>
                  <button className="linklike" onClick={() => setMode('reset')}>
                    Forgot your password?
                  </button>
                  <span>
                    New here?{' '}
                    <button className="linklike" onClick={() => setMode('signup')}>
                      Create an account
                    </button>
                  </span>
                </>
              ) : (
                <span>
                  {mode === 'signup' ? 'Already have an account? ' : ''}
                  <button className="linklike" onClick={() => setMode('signin')}>
                    {mode === 'signup' ? 'Sign in' : 'Back to sign in'}
                  </button>
                </span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The error a provider or email link sent back in the address, if any. */
function errorFromAddress(search: string, hash: string): { code: string; description: string } | null {
  const q = new URLSearchParams(search);
  const h = new URLSearchParams(hash.replace(/^#/, ''));
  const code = q.get('error_code') ?? h.get('error_code') ?? q.get('error') ?? h.get('error');
  return code ? { code, description: q.get('error_description') ?? h.get('error_description') ?? '' } : null;
}

function linkMessage(e: { code: string; description: string }): string {
  if (e.code === 'access_denied' && !/expired|invalid/i.test(e.description)) return 'Google sign-in was cancelled. You can try again, or use your email.';
  if (/otp_expired|expired|invalid/i.test(`${e.code} ${e.description}`)) return 'This link has expired or was already used. Request a new one.';
  return 'Sign-in could not be completed. Try again.';
}

/** Back from Google or an email confirmation link: Supabase finishes signing in, then on to where they were going. */
export function AuthCallbackPage() {
  const { status } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [problem, setProblem] = useState<string | null>(() => {
    const e = errorFromAddress(loc.search, loc.hash);
    return e ? linkMessage(e) : null;
  });

  useEffect(() => {
    if (status === 'signed-in') nav(takeNextPath(), { replace: true });
  }, [status, nav]);
  useEffect(() => {
    if (!supabase || problem) return;
    let current = true;
    void supabase.auth.initialize().then(({ error }) => current && error && setProblem(authMessage(error)));
    const t = setTimeout(() => current && setProblem((p) => p ?? 'Sign-in could not be completed. If you just confirmed your email, it is confirmed: sign in below.'), 12_000);
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [problem]);

  if (status === 'off') return <NotSetUp />;
  return (
    <div className="page auth-page">
      {problem ? (
        <div className="auth-card" role="alert">
          <h1>Not signed in</h1>
          <p>{problem}</p>
          <Link className="btn primary" to="/login">
            Go to sign in
          </Link>
        </div>
      ) : (
        <p className="loading" role="status">
          Signing you in…
        </p>
      )}
    </div>
  );
}

/** From a password reset email: choose a new password. */
export function ResetPasswordPage() {
  const { status, recovering, updatePassword } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [problem, setProblem] = useState<string | null>(() => {
    const e = errorFromAddress(loc.search, loc.hash);
    return e ? linkMessage(e) : null;
  });
  const [checked, setChecked] = useState(!supabase);
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let current = true;
    void supabase.auth.initialize().then(({ error }) => {
      if (!current) return;
      // the reason in the link itself (expired, already used) is clearer than Supabase's own
      if (error) setProblem((p) => p ?? authMessage(error));
      setChecked(true);
    });
    return () => {
      current = false;
    };
  }, []);

  if (status === 'off') return <NotSetUp />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < PASSWORD_MIN) return setError(`Use at least ${PASSWORD_MIN} characters.`);
    if (pw !== again) return setError('The two passwords do not match.');
    setBusy(true);
    setError(null);
    const r = await updatePassword(pw);
    setBusy(false);
    if (r.ok) setDone(true);
    else setError(r.message);
  };
  const canChoose = status === 'signed-in' && (recovering || !problem);
  return (
    <div className="page auth-page">
      <h1>Choose a new password</h1>
      {done ? (
        <div className="auth-card" role="status">
          <p>Your password is changed, and you are signed in.</p>
          <button className="btn primary" onClick={() => nav('/account')}>
            Go to your account
          </button>
        </div>
      ) : !checked || status === 'loading' ? (
        <p className="loading" role="status">
          Checking your link…
        </p>
      ) : problem && !canChoose ? (
        <div className="auth-card" role="alert">
          <p>{problem}</p>
          <Link className="btn" to="/login">
            Request a new link
          </Link>
        </div>
      ) : canChoose ? (
        <form className="auth-card" onSubmit={submit} noValidate>
          <Field label="New password" type="password" value={pw} onChange={setPw} autoComplete="new-password" hint={`At least ${PASSWORD_MIN} characters.`} autoFocus />
          <Field label="New password again" type="password" value={again} onChange={setAgain} autoComplete="new-password" />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn primary auth-submit" type="submit" disabled={busy || !pw || !again}>
            {busy ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      ) : (
        <div className="auth-card">
          <p>Open this page from the link in your password reset email. Links work once, in the browser where you asked for them.</p>
          <Link className="btn" to="/login">
            Request a reset link
          </Link>
        </div>
      )}
    </div>
  );
}

/** What this browser has from before signing in, in words. */
export function guestDescription(g: GuestSummary): string {
  const parts = [
    g.hands && `${g.hands} practice ${g.hands === 1 ? 'hand' : 'hands'}`,
    g.lessons && `progress on ${g.lessons} ${g.lessons === 1 ? 'lesson' : 'lessons'}`,
    g.ranges && `${g.ranges} saved ${g.ranges === 1 ? 'range' : 'ranges'}`,
    g.puzzles && `${g.puzzles} puzzle ${g.puzzles === 1 ? 'result' : 'results'}`,
    g.settings && 'your settings',
  ].filter(Boolean) as string[];
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? 'nothing');
}

/** The offer to add this browser's guest progress to the account (shown after signing in). */
export function GuestImport({ compact = false }: { compact?: boolean }) {
  const { guest, importGuest, dismissGuest } = useStore();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'ok' | 'failed' | null>(null);
  if (result === 'ok')
    return (
      <div className="banner info" role="status">
        Your guest progress is now in your account.
      </div>
    );
  if (!guest) return null;
  const go = async () => {
    setBusy(true);
    const ok = await importGuest();
    setBusy(false);
    setResult(ok ? 'ok' : 'failed');
  };
  return (
    <section className={`banner info guest-import ${compact ? 'compact' : ''}`} aria-label="Progress from before you signed in">
      <p>
        <strong>This browser has progress from before you signed in:</strong> {guestDescription(guest)}. Add it to your account? Nothing is counted twice, and your
        account’s own settings are kept if it already has some.
      </p>
      {result === 'failed' && (
        <p className="error" role="alert">
          It could not be added just now. It is still saved in this browser; try again in a moment.
        </p>
      )}
      <div className="row">
        <button className="btn primary small" onClick={go} disabled={busy}>
          {busy ? 'Adding…' : 'Add to my account'}
        </button>
        <button className="btn ghost small" onClick={dismissGuest} disabled={busy}>
          Not now
        </button>
      </div>
    </section>
  );
}

/** Where this account's progress stands: saved, saving, or a problem (with a retry). */
export function SyncStatus() {
  const { sync, retrySync } = useStore();
  if (!sync) return null;
  if (sync.phase === 'loading')
    return (
      <p className="note sync-line" role="status">
        Loading your progress…
      </p>
    );
  if (sync.phase === 'ready')
    return (
      <p className="note sync-line" role="status">
        {sync.saving ? 'Saving…' : 'Your progress is saved to your account.'}
      </p>
    );
  return (
    <div className="banner warn" role="alert">
      {sync.phase === 'load-failed'
        ? `${sync.message} Your account’s progress is not loaded, so nothing is saved to it until it is.`
        : `${sync.message} Your latest progress is kept on this device and will be saved to your account when the connection is back.`}{' '}
      <button className="linklike" onClick={retrySync}>
        Try again
      </button>
    </div>
  );
}

/** Chips this browser won or claimed as a guest, offered once into the account (the server moves them). */
function GuestChips() {
  const { status } = useAuth();
  const [guest, setGuest] = useState<Bankroll | null>(null);
  const [mine, setMine] = useState<Bankroll | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!PARTY_HOST || status !== 'signed-in') return;
    void fetchGuestBankroll().then(setGuest);
    void fetchBankroll().then(setMine);
  }, [status]);
  if (!PARTY_HOST || !mine) return null;
  const canMove = !!guest && guest.balance > 0 && !guest.guestMoved && !mine.guestMoved;
  const move = async () => {
    setBusy(true);
    try {
      const r = await moveGuestChips();
      setMine(r.bank);
      setGuest((g) => g && { ...g, balance: 0, guestMoved: true });
      setMsg({ ok: true, text: `Moved ${fmtChips(r.moved)} chips into your account.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="auth-card" aria-labelledby="chips-title">
      <h2 id="chips-title">Live table chips</h2>
      <p>
        Your account has <strong>{fmtChips(mine.balance)}</strong> chips for live tables.
      </p>
      {canMove && (
        <>
          <p>
            This browser also has <strong>{fmtChips(guest!.balance)}</strong> chips from playing as a guest. You can move a guest’s chips into your account once;
            chips still on a table come back to the guest when you leave it.
          </p>
          <button className="btn primary" onClick={move} disabled={busy}>
            {busy ? 'Moving…' : `Move ${fmtChips(guest!.balance)} chips to my account`}
          </button>
        </>
      )}
      {msg && (
        <p className={msg.ok ? 'note' : 'error'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

/** Delete the account and everything in it, after a clear confirmation. */
function DeleteAccount() {
  const { deleteAccount } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    if (!confirm('Delete your account? Your profile, lesson progress, saved ranges, settings, practice hands and puzzle results will be deleted from every device. This cannot be undone.')) return;
    setBusy(true);
    setError(null);
    const r = await deleteAccount();
    setBusy(false);
    if (r.ok) nav('/', { replace: true });
    else setError(r.message);
  };
  return (
    <section className="auth-card" aria-labelledby="delete-title">
      <h2 id="delete-title">Delete account</h2>
      <p className="note">
        Deletes your account and everything saved in it, on every device, straight away. Live-table chips stay under an anonymous number that nobody can link to you
        any more. <Link to="/privacy">Privacy</Link>
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn danger" onClick={go} disabled={busy}>
          {busy ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
    </section>
  );
}

export function AccountPage() {
  const auth = useAuth();
  const { unsaved } = useStore();
  const [name, setName] = useState('');
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [pw, setPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const account = auth.account;
  useEffect(() => {
    if (account) setName(account.displayName);
  }, [account?.displayName]); // eslint-disable-line react-hooks/exhaustive-deps

  if (auth.status === 'off') return <NotSetUp />;
  if (auth.status === 'loading')
    return (
      <div className="page auth-page">
        <p className="loading" role="status">
          Loading…
        </p>
      </div>
    );
  if (!account)
    return (
      <div className="page auth-page">
        <h1>Your account</h1>
        <p>Sign in to see your account. Lessons, practice and live tables all work without one.</p>
        <Link className="btn primary" to="/login?next=/account">
          Sign in
        </Link>
      </div>
    );

  const hasPassword = account.providers.includes('email');
  const google = account.providers.includes('google');

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    const r = await auth.setDisplayName(name);
    setSavingName(false);
    setNameMsg(r.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: r.message });
  };
  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < PASSWORD_MIN) return setPwMsg({ ok: false, text: `Use at least ${PASSWORD_MIN} characters.` });
    setPwBusy(true);
    const r = await auth.updatePassword(pw);
    setPwBusy(false);
    setPw('');
    setPwMsg(r.ok ? { ok: true, text: 'Your password is changed.' } : { ok: false, text: r.message });
  };
  const emailReset = async () => {
    if (!account.email) return;
    const r = await auth.sendPasswordReset(account.email);
    setResetMsg(r.ok ? `We sent a link to ${account.email}. Open it in this browser.` : r.message);
  };
  const signOut = (everywhere: boolean) => {
    if (unsaved && !confirm('Some of your latest progress has not reached your account yet. If you sign out now it will be lost from this device. Sign out anyway?')) return;
    void auth.signOut(everywhere);
  };

  return (
    <div className="page auth-page account-page">
      <h1>Your account</h1>
      <SyncStatus />
      <GuestImport />

      <section className="auth-card" aria-labelledby="profile-title">
        <h2 id="profile-title">Profile</h2>
        <dl className="account-facts">
          <dt>Email</dt>
          <dd>{account.email ?? '—'}</dd>
          <dt>Signs in with</dt>
          <dd>{[google && 'Google', hasPassword && auth.methods?.email && 'email and password'].filter(Boolean).join(' and ') || '—'}</dd>
        </dl>
        <form onSubmit={saveName} noValidate>
          <Field
            label="Display name"
            value={name}
            onChange={(v) => {
              setName(v);
              setNameMsg(null);
            }}
            autoComplete="nickname"
            maxLength={DISPLAY_NAME_MAX}
            hint="Shown at live tables. Your email is never shown to other players."
            error={nameMsg && !nameMsg.ok ? nameMsg.text : null}
          />
          <div className="row">
            <button className="btn" type="submit" disabled={savingName || !account.displayName || !name.trim() || name.trim() === account.displayName}>
              {savingName ? 'Saving…' : 'Save name'}
            </button>
            {nameMsg?.ok && (
              <span className="note" role="status">
                {nameMsg.text}
              </span>
            )}
          </div>
        </form>
      </section>

      {auth.methods?.email && (
        <section className="auth-card" aria-labelledby="password-title">
          <h2 id="password-title">Password</h2>
          {hasPassword ? (
            <form onSubmit={changePw} noValidate>
              <Field
                label="New password"
                type="password"
                value={pw}
                onChange={(v) => {
                  setPw(v);
                  setPwMsg(null);
                }}
                autoComplete="new-password"
                hint={`At least ${PASSWORD_MIN} characters.`}
                error={pwMsg && !pwMsg.ok ? pwMsg.text : null}
              />
              <div className="row">
                <button className="btn" type="submit" disabled={pwBusy || !pw}>
                  {pwBusy ? 'Saving…' : 'Change password'}
                </button>
                {pwMsg?.ok && (
                  <span className="note" role="status">
                    {pwMsg.text}
                  </span>
                )}
              </div>
            </form>
          ) : (
            <p>You sign in with Google. To sign in with a password as well, ask for a link to set one.</p>
          )}
          <p>
            <button className="linklike" onClick={emailReset}>
              {hasPassword ? 'Email me a password reset link instead' : 'Email me a link to set a password'}
            </button>
          </p>
          {resetMsg && (
            <p className="note" role="status">
              {resetMsg}
            </p>
          )}
        </section>

      )}

      <GuestChips />

      <DeleteAccount />

      <section className="auth-card" aria-labelledby="signout-title">
        <h2 id="signout-title">Sign out</h2>
        <p className="note">Signing out removes your account’s progress from this browser (it stays in your account). On a shared computer, always sign out.</p>
        <div className="row">
          <button className="btn" onClick={() => signOut(false)}>
            Sign out
          </button>
          <button className="btn ghost" onClick={() => signOut(true)}>
            Sign out on all devices
          </button>
        </div>
      </section>
    </div>
  );
}
