import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { DIFFICULTIES } from '../../scenarios/types';
import { TEMPLATES } from '../../scenarios/templates';
import { LESSONS } from '../../content/lessons';

export function HomePage() {
  const { data, update } = useStore();
  const nav = useNavigate();
  const played = data.history.length;
  const d = data.settings.difficulty;
  return (
    <div className="page home">
      <section className="hero-block">
        <h1>Make better poker decisions.</h1>
        <p className="lead">Play fresh No-Limit Hold’em spots, get an honest review of every decision, and study the ideas behind them. Everything is open — no levels to unlock.</p>
        <div className="start">
          <div className="seg" role="radiogroup" aria-label="Difficulty">
            {DIFFICULTIES.map((x) => (
              <button key={x} role="radio" aria-checked={d === x} className={d === x ? 'on' : ''} onClick={() => update((s) => ({ ...s, settings: { ...s.settings, difficulty: x } }))}>
                {x[0].toUpperCase() + x.slice(1)}
              </button>
            ))}
          </div>
          <button className="btn primary big" onClick={() => nav('/practice?start=1')}>
            Start practicing →
          </button>
        </div>
        {played > 0 && (
          <p className="note">
            {played} scenario{played === 1 ? '' : 's'} completed · <Link to="/progress">View progress</Link> · <Link to="/review">Review hands</Link>
          </p>
        )}
      </section>
      <section className="feature-grid">
        <Link to="/practice" className="feature">
          <span className="feature-icon" aria-hidden="true">♠</span>
          <h2>Practice</h2>
          <p>Unlimited hands — every deal is new — across {TEMPLATES.length} scenario types, preflop to river, cash and tournament.</p>
        </Link>
        <Link to="/learn" className="feature">
          <span className="feature-icon" aria-hidden="true">♦</span>
          <h2>Learn</h2>
          <p>{LESSONS.length} lessons from hand rankings to ICM, each with practice.</p>
        </Link>
        <Link to="/ranges" className="feature">
          <span className="feature-icon" aria-hidden="true">♣</span>
          <h2>Ranges</h2>
          <p>Explore, build and compare hand ranges, then test yourself.</p>
        </Link>
      </section>
    </div>
  );
}
