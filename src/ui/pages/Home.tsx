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
  const scored = data.history.filter((h) => h.score !== null);
  const avg = scored.length ? Math.round(scored.reduce((a, h) => a + (h.score ?? 0), 0) / scored.length) : null;
  return (
    <div className="page home">
      <section className="home-hero">
        <div className="hh-text">
          <p className="eyebrow">No-Limit Hold’em trainer</p>
          <h1>Play the hand. Then see what the best play was.</h1>
          <p className="lead">Felt School deals you real poker situations, grades each of your decisions, and shows the right play with the reasoning behind it.</p>
          <div className="hh-actions">
            <button className="btn primary big" onClick={() => nav('/practice?start=1')}>
              Start practicing
            </button>
            <button
              className="btn big"
              onClick={() => {
                update((s) => ({ ...s, settings: { ...s.settings, street: 'full', concepts: [] } }));
                nav('/practice?template=full-hand');
              }}
            >
              Play a full hand
            </button>
          </div>
          <label className="hh-level">
            <span>Level</span>
            <select value={d} onChange={(e) => update((s) => ({ ...s, settings: { ...s.settings, difficulty: e.target.value as typeof d } }))}>
              {DIFFICULTIES.map((x) => (
                <option key={x} value={x}>
                  {x[0].toUpperCase() + x.slice(1)}
                </option>
              ))}
            </select>
          </label>
          {played > 0 && (
            <p className="hh-progress">
              You have played {played} hand{played === 1 ? '' : 's'}
              {avg !== null ? `, averaging ${avg}` : ''}. <Link to="/progress">See progress</Link> or <Link to="/review">review hands</Link>.
            </p>
          )}
        </div>
        <ol className="hh-steps" aria-label="How it works">
          <li>
            <span className="step-n">1</span>
            <div>
              <h2>Play</h2>
              <p>A hand is dealt from a real situation: an open, a c-bet, a river decision, or a whole hand from preflop to showdown.</p>
            </div>
          </li>
          <li>
            <span className="step-n">2</span>
            <div>
              <h2>Review</h2>
              <p>Each decision gets a score, the best play with its exact size, and a short reason. Open the full explanation when you want more.</p>
            </div>
          </li>
          <li>
            <span className="step-n">3</span>
            <div>
              <h2>Study</h2>
              <p>Every review links to the lesson behind it, so you can read the idea and then practice that spot again.</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="home-paths" aria-label="Sections">
        <Link to="/practice" className="path">
          <span className="path-title">Practice</span>
          <span className="path-desc">Unlimited hands across {TEMPLATES.length} kinds of situation, cash and tournament.</span>
          <span className="path-go" aria-hidden="true">→</span>
        </Link>
        <Link to="/learn" className="path">
          <span className="path-title">Learn</span>
          <span className="path-desc">{LESSONS.length} lessons, from hand rankings to ICM, each with problems and a quiz.</span>
          <span className="path-go" aria-hidden="true">→</span>
        </Link>
        <Link to="/ranges" className="path">
          <span className="path-title">Ranges</span>
          <span className="path-desc">Opening and defending charts by seat, a range builder and an equity calculator.</span>
          <span className="path-go" aria-hidden="true">→</span>
        </Link>
      </section>
    </div>
  );
}
