import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { DIFFICULTIES } from '../../scenarios/types';
import { TEMPLATES } from '../../scenarios/templates';
import { LESSONS } from '../../content/lessons';

export function HomePage() {
  const { data, update } = useStore();
  const nav = useNavigate();
  const played = data.history.length;
  const start = (d: (typeof DIFFICULTIES)[number]) => {
    update((x) => ({ ...x, settings: { ...x.settings, difficulty: d } }));
    nav('/practice?start=1');
  };
  return (
    <div className="page home">
      <section className="hero-block">
        <h1>Learn to make better No-Limit Hold’em decisions</h1>
        <p className="lead">
          Play fresh, strategically varied scenarios; get an honest, mechanism-level review of each decision; study the theory behind it; and track where you improve. No levels or unlocks — practise anything, any time.
        </p>
        <div className="start-row" role="group" aria-label="Start practising">
          {DIFFICULTIES.map((d) => (
            <button key={d} className={`btn big ${d === data.settings.difficulty ? 'primary' : ''}`} onClick={() => start(d)}>
              Start · {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        {played > 0 && (
          <p className="note">
            You have completed {played} scenario{played === 1 ? '' : 's'}. <Link to="/progress">See your progress</Link> or <Link to="/review">review past hands</Link>.
          </p>
        )}
      </section>
      <section className="feature-grid">
        <Link to="/practice" className="feature">
          <h2>Practice</h2>
          <p>{TEMPLATES.length} validated scenario types across preflop, flop, turn and river, cash and tournament. Configure difficulty, format, table size, stacks, position, street, pot type and opponent tendencies.</p>
        </Link>
        <Link to="/learn" className="feature">
          <h2>Learn</h2>
          <p>{LESSONS.length} lessons from rules to ICM, each with an example, common mistakes, the math, assumptions, a knowledge check and related practice.</p>
        </Link>
        <Link to="/ranges" className="feature">
          <h2>Ranges</h2>
          <p>A 13×13 range explorer: presets with stated assumptions, weighted painting, combo counts, card removal, comparisons, import/export and range drills.</p>
        </Link>
        <Link to="/review" className="feature">
          <h2>Review</h2>
          <p>Every completed hand is saved. Revisit the street-by-street replay, recommendations, ranges and math for each decision.</p>
        </Link>
        <Link to="/progress" className="feature">
          <h2>Progress</h2>
          <p>Strengths and leaks by concept, street, position and difficulty — with assisted practice kept separate from assessments.</p>
        </Link>
        <Link to="/method" className="feature">
          <h2>How it evaluates</h2>
          <p>What is exact, what is simulated, what is heuristic — and what is not covered. Scores never depend on whether you won the pot.</p>
        </Link>
      </section>
    </div>
  );
}
