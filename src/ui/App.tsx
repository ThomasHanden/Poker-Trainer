import { HashRouter, NavLink, Route, Routes, Link } from 'react-router-dom';
import { Component, ReactNode, useState } from 'react';
import { StoreProvider, useStore } from './store';
import { PracticePage } from './pages/Practice';
import { LearnPage, LessonPage } from './pages/Learn';
import { RangesPage } from './pages/Ranges';
import { ReviewListPage, ReviewDetailPage } from './pages/Review';
import { ProgressPage } from './pages/Progress';
import { CoveragePage } from './pages/Coverage';
import { HomePage } from './pages/Home';
import { MethodPage } from './pages/Method';

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
  ];
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Poker Decision Trainer home">
          <span aria-hidden="true">♠</span> Decision Trainer
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
          <NavLink to="/coverage" className="minor" onClick={() => setMenu(false)}>
            Coverage
          </NavLink>
          <NavLink to="/method" className="minor" onClick={() => setMenu(false)}>
            Method
          </NavLink>
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
            <Route path="/coverage" element={<CoveragePage />} />
            <Route path="/method" element={<MethodPage />} />
            <Route path="*" element={<div className="page"><h1>Not found</h1><Link to="/">Home</Link></div>} />
          </Routes>
        </ErrorBoundary>
      </main>
      <footer className="footer">
        Training tool. Recommendations are instructional — heuristics, illustrative charts, exact math and simulations against a stated opponent model — not solver output. <Link to="/method">How evaluation works</Link>.
      </footer>
    </>
  );
}

export function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </StoreProvider>
  );
}
