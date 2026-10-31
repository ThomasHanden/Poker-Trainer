// The account entry point in the top bar: "Sign in", or the player's name with a small menu.
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useStore } from '../store';

export function AuthMenu() {
  const { status, account, signOut, methods } = useAuth();
  const { unsaved } = useStore();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLAnchorElement>(null);
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>('.auth-menu-btn')?.focus();
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (status === 'off' || status === 'loading') return null;
  if (!account) {
    // nothing to offer if no sign-in method is switched on
    if (loc.pathname === '/login' || (methods && !methods.google && !methods.email)) return null;
    const next = `${loc.pathname}${loc.search}`;
    return (
      <Link className="btn small auth-signin" to={`/login?next=${encodeURIComponent(next)}`}>
        Sign in
      </Link>
    );
  }
  const leave = async () => {
    setOpen(false);
    if (unsaved && !confirm('Some of your latest progress has not reached your account yet. If you sign out now it will be lost from this device. Sign out anyway?')) return;
    await signOut();
    nav('/');
  };
  return (
    <div className="auth-menu" ref={root}>
      <button className="btn small auth-menu-btn" aria-haspopup="true" aria-expanded={open} aria-controls="account-menu" onClick={() => setOpen((o) => !o)}>
        <span className="auth-name">{account.displayName || 'Account'}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div id="account-menu" className="auth-dropdown" aria-label="Account">
          <Link ref={first} to="/account">
            Account
          </Link>
          <button type="button" onClick={leave}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
