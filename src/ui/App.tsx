import { BrowserRouter, NavLink, Route, Routes, Link, useLocation } from 'react-router-dom';
import { Component, ReactNode, useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { StoreProvider, useStore } from './store';
import { PracticePage } from './pages/Practice';
import { LearnPage, LessonPage } from './pages/Learn';
import { RangesPage } from './pages/Ranges';
import { ReviewListPage, ReviewDetailPage } from './pages/Review';
import { ProgressPage } from './pages/Progress';
import { HomePage } from './pages/Home';
import { PlayLobbyPage, PlayTablePage } from './pages/Play';
import { AccountPage, AuthCallbackPage, GuestImport, LoginPage, ResetPasswordPage } from './pages/Account';
import { AuthMenu } from './components/AuthMenu';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { isPublicTable } from '../multiplayer/table';
import { NOT_FOUND, pageMeta } from '../seo';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="page">
          <div className="error-box" role="alert">
            <h2>Something went wrong</h2>
            <p>{this.state.error.message}</p>
            <p>Your saved progress is not affected. Try reloading the page.</p>
            <button className="btn" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </div>
      );
    return this.props.children;
  }
}

/** Account messages for every page: a session that ended, progress that could not be saved, and guest progress to add. */
function AccountBanners() {
  const { notice, clearNotice, status } = useAuth();
  const { sync, retrySync } = useStore();
  const { pathname } = useLocation();
  const onAccountPages = ['/account', '/login', '/auth/callback', '/reset-password'].includes(pathname);
  return (
    <>
      {notice && status === 'signed-out' && (
        <div className="banner info" role="status">
          {notice} <Link to={`/login?next=${encodeURIComponent(pathname)}`}>Sign in</Link> ·{' '}
          <button className="linklike" onClick={clearNotice}>
            Dismiss
          </button>
        </div>
      )}
      {!onAccountPages && (sync?.phase === 'load-failed' || sync?.phase === 'save-failed') && (
        <div className="banner warn" role="alert">
          {sync.message} {sync.phase === 'load-failed' ? 'Your account’s progress is not loaded yet.' : 'Your latest progress is kept on this device for now.'}{' '}
          <button className="linklike" onClick={retrySync}>
            Try again
          </button>
        </div>
      )}
      {!onAccountPages && <GuestImport />}
    </>
  );
}

/** The page itself; the build also renders it to HTML for every public page (scripts/prerender.tsx). */
export function Shell() {
  const { storageWarning, owner, sync } = useStore();
  const { status } = useAuth();
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = (pageMeta(pathname) ?? NOT_FOUND).title;
  }, [pathname]);
  const links: [string, string][] = [
    ['/practice', 'Practice'],
    ['/learn', 'Learn'],
    ['/ranges', 'Ranges'],
    ['/review', 'Review'],
    ['/progress', 'Progress'],
    ['/play', 'Play live'],
  ];
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Felt School home">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" aria-hidden="true" className="brand-logo" /> Felt School
        </Link>
        <button className="menu-btn" aria-expanded={menu} aria-controls="mainnav" onClick={() => setMenu((m) => !m)}>
          Menu
        </button>
        <nav id="mainnav" className={menu ? 'open' : ''} aria-label="Main">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} onClick={() => setMenu(false)}>
              {label}
            </NavLink>
          ))}
        </nav>
        <AuthMenu />
      </header>
      {storageWarning && (
        <div className="banner warn" role="status">
          {storageWarning}
        </div>
      )}
      <AccountBanners />
      <main id="main">
        <ErrorBoundary>
          {/* a different account (or signing out) starts every page afresh, so nothing of the last one stays on screen */}
          <Routes key={owner ?? 'guest'}>
            <Route path="/" element={<HomePage />} />
            <Route path="/practice" element={<PracticePage />} />
            <Route path="/learn" element={<LearnPage />} />
            <Route path="/learn/:id" element={<LessonPage />} />
            <Route path="/ranges" element={<RangesPage />} />
            <Route path="/review" element={<ReviewListPage />} />
            <Route path="/review/:id" element={<ReviewDetailPage />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/play" element={<PlayLobbyPage />} />
            <Route path="/play/:room" element={<PlayTablePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <footer className="footer">
        <span className="foot-brand">Felt School</span>
        <span>
          Scores are teaching estimates, not solver output.{' '}
          {owner
            ? sync?.phase === 'load-failed' || sync?.phase === 'save-failed'
              ? 'Your progress is kept on this device until your account can be reached.'
              : 'Your progress is saved to your account.'
            : status === 'off'
              ? 'Your progress is saved in this browser only.'
              : 'Your progress is saved in this browser; sign in to keep it on every device.'}
        </span>
      </footer>
    </>
  );
}

function NotFound() {
  return (
    <div className="page">
      <h1>Page not found</h1>
      <p>
        There is no page at this address. Try the <Link to="/learn">lesson library</Link> or go <Link to="/">home</Link>.
      </p>
    </div>
  );
}

/** Page path for analytics: private table codes and saved hands are grouped, so none is its own page or leaks its code. */
function analyticsPath(pathname: string): string {
  const table = pathname.match(/^\/play\/([^/]+)/)?.[1];
  if (table && !isPublicTable(table)) return '/play/[private]';
  return /^\/review\/[^/]+/.test(pathname) ? '/review/[hand]' : pathname;
}

function PageAnalytics() {
  const path = analyticsPath(useLocation().pathname);
  return <Analytics route={path} path={path} beforeSend={(e) => ({ ...e, url: new URL(path, e.url).toString() })} />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <StoreProvider>
          <Shell />
          <PageAnalytics />
        </StoreProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
