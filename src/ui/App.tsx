import { HashRouter, NavLink, Route, Routes, Link, useLocation } from 'react-router-dom';
import { Component, ReactNode, useState } from 'react';
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react';
import { StoreProvider, useStore } from './store';
import { PracticePage } from './pages/Practice';
import { LearnPage, LessonPage } from './pages/Learn';
import { RangesPage } from './pages/Ranges';
import { ReviewListPage, ReviewDetailPage } from './pages/Review';
import { ProgressPage } from './pages/Progress';
import { HomePage } from './pages/Home';
import { PlayLobbyPage, PlayTablePage } from './pages/Play';
import { isPublicTable } from '../multiplayer/table';

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

function Shell() {
  const { storageWarning } = useStore();
  const [menu, setMenu] = useState(false);
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
      </header>
      {storageWarning && (
        <div className="banner warn" role="status">
          {storageWarning}
        </div>
      )}
      <main id="main">
        <ErrorBoundary>
          <Routes>
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
            <Route path="*" element={<div className="page"><h1>Not found</h1><Link to="/">Home</Link></div>} />
          </Routes>
        </ErrorBoundary>
      </main>
      <footer className="footer">
        <span className="foot-brand">Felt School</span>
        <span>Scores are teaching estimates, not solver output. Your progress is saved in this browser only.</span>
      </footer>
    </>
  );
}

/** Page path for analytics; private table codes are grouped so each table is not its own page. */
function analyticsPath(pathname: string): string {
  const table = pathname.match(/^\/play\/([^/]+)/)?.[1];
  return table && !isPublicTable(table) ? '/play/[private]' : pathname;
}

/** Report the hash route (#/practice) as the page, since Vercel Analytics only sees real paths. */
function withHashRoute(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  if (url.hash.startsWith('#/')) {
    url.pathname = analyticsPath(url.hash.slice(1).split('?')[0]);
    url.hash = '';
  }
  return { ...event, url: url.toString() };
}

/** Vercel Analytics ignores hash changes, so send a page view on each route change ourselves. */
function PageAnalytics() {
  const path = analyticsPath(useLocation().pathname);
  return <Analytics route={path} path={path} beforeSend={withHashRoute} />;
}

export function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Shell />
        <PageAnalytics />
      </HashRouter>
    </StoreProvider>
  );
}
