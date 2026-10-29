import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { CardRow } from '../components/Card';
import { LESSON_INDEX } from '../../content/lessons';
import { PuzzleRun, loadRuns, puzzleSet, saveRun, streak, todayKey } from '../../puzzles/daily';

const fmtTime = (ms: number) => {
  const s = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const fmtDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

export function HomePage() {
  const { data } = useStore();
  const nav = useNavigate();
  const today = todayKey();
  const [runs, setRuns] = useState<PuzzleRun[]>(loadRuns);
  const doneToday = runs.find((r) => r.date === today);
  // extra sets are unranked practice; the daily set counts for the scoreboard
  const [extra, setExtra] = useState(0);
  const setKey = extra ? `${today}:extra:${extra}` : today;
  const puzzles = useMemo(() => puzzleSet(setKey), [setKey]);
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<(number | null)[]>(() => puzzles.map(() => null));
  const started = useRef(Date.now());
  const [finished, setFinished] = useState<{ score: number; ms: number } | null>(null);

  useEffect(() => {
    setI(0);
    setPicks(puzzles.map(() => null));
    setFinished(null);
    started.current = Date.now();
  }, [puzzles]);

  const ranked = extra === 0 && !doneToday;
  const p = puzzles[i];
  const pick = picks[i];
  const answered = pick !== null && pick !== undefined;
  const score = picks.filter((x, k) => x === puzzles[k].answer).length;

  const choose = (k: number) => {
    if (answered || finished) return;
    setPicks((old) => old.map((x, j) => (j === i ? k : x)));
  };
  const next = () => {
    if (i < puzzles.length - 1) {
      setI(i + 1);
      return;
    }
    const ms = Date.now() - started.current;
    setFinished({ score, ms });
    if (ranked) setRuns(saveRun({ date: today, score, total: puzzles.length, ms, at: Date.now() }));
  };

  // scoreboard
  const best = [...runs].sort((a, b) => b.score - a.score || a.ms - b.ms);
  const top = best.slice(0, 7);
  const st = streak(runs);
  const played = data.history.length;
  const scored = data.history.filter((h) => h.score !== null);
  const avg = scored.length ? Math.round(scored.reduce((a, h) => a + (h.score ?? 0), 0) / scored.length) : null;
  const showDone = !!doneToday && extra === 0 && !finished;

  return (
    <div className="page home">
      <section className="home-band">
        <div>
          <p className="eyebrow">No-Limit Hold’em trainer</p>
          <h1>Make the right play, and know why.</h1>
          <p className="lead">Warm up with today’s puzzles, then play full hands and spots with a review of every decision.</p>
        </div>
        <button className="btn primary big" onClick={() => nav('/practice')}>
          Go to practice →
        </button>
      </section>

      <div className="home-grid">
        <section className="puzzles" aria-labelledby="pz-title">
          <header className="pz-head">
            <div>
              <p className="eyebrow">{extra ? 'Extra puzzles · not ranked' : `Daily puzzles · ${fmtDate(today)}`}</p>
              <h2 id="pz-title">{extra ? 'More puzzles' : 'Today’s puzzles'}</h2>
            </div>
            {!showDone && (
              <ol className="pz-dots" aria-label="Progress">
                {puzzles.map((q, k) => (
                  <li key={q.id} className={`${k === i && !finished ? 'cur' : ''} ${picks[k] === null ? '' : picks[k] === q.answer ? 'ok' : 'no'}`} aria-label={`Puzzle ${k + 1}`} />
                ))}
              </ol>
            )}
          </header>

          {showDone ? (
            <div className="pz-result">
              <p className="pz-big">
                {doneToday!.score}
                <span>/{doneToday!.total}</span>
              </p>
              <p>
                You finished today’s puzzles in {fmtTime(doneToday!.ms)}. New ones appear tomorrow.
              </p>
              <div className="pz-actions">
                <button className="btn primary" onClick={() => setExtra(1)}>
                  Play extra puzzles
                </button>
                <button className="btn" onClick={() => nav('/practice')}>
                  Go to practice
                </button>
              </div>
            </div>
          ) : finished ? (
            <div className="pz-result">
              <p className="pz-big">
                {finished.score}
                <span>/{puzzles.length}</span>
              </p>
              <p>
                {finished.score === puzzles.length ? 'A perfect set.' : finished.score >= 3 ? 'Good set.' : 'Worth another look at the explanations.'} Time {fmtTime(finished.ms)}.
                {ranked ? ' Saved to your scoreboard.' : ' Extra sets are not ranked.'}
              </p>
              <div className="pz-actions">
                <button className="btn primary" onClick={() => setExtra((x) => x + 1)}>
                  Play extra puzzles
                </button>
                <button className="btn" onClick={() => nav('/practice')}>
                  Go to practice
                </button>
              </div>
            </div>
          ) : (
            <article className="pz-card">
              <p className="pz-meta">
                {i + 1} of {puzzles.length} · {p.topic}
              </p>
              <p className="pz-prompt">{p.prompt}</p>
              {(p.hero || p.board) && (
                <div className="pz-cards">
                  {p.board && (
                    <div>
                      <span className="pz-cl">Board</span>
                      <CardRow cards={p.board} size="md" fourColor={data.prefs.fourColor} />
                    </div>
                  )}
                  {p.hero && (
                    <div>
                      <span className="pz-cl">You</span>
                      <CardRow cards={p.hero} size="md" fourColor={data.prefs.fourColor} />
                    </div>
                  )}
                  {p.villain && (
                    <div>
                      <span className="pz-cl">Opponent</span>
                      <CardRow cards={p.villain} size="md" fourColor={data.prefs.fourColor} />
                    </div>
                  )}
                </div>
              )}
              <div className={`pz-options n${p.options.length}`}>
                {p.options.map((o, k) => (
                  <button
                    key={o}
                    className={`pz-opt ${answered ? (k === p.answer ? 'right' : k === pick ? 'wrong' : 'dim') : ''}`}
                    onClick={() => choose(k)}
                    disabled={answered}
                    data-testid="pz-option"
                  >
                    {o}
                  </button>
                ))}
              </div>
              {answered && (
                <div className={`pz-feedback ${pick === p.answer ? 'ok' : 'no'}`} role="status">
                  <p>
                    <strong>{pick === p.answer ? 'Correct.' : `Not quite — the answer is ${p.options[p.answer]}.`}</strong> {p.explain}
                  </p>
                  <div className="pz-foot">
                    {LESSON_INDEX[p.lesson] && <Link to={`/learn/${p.lesson}`}>Lesson: {LESSON_INDEX[p.lesson].title}</Link>}
                    <button className="btn primary" onClick={next} autoFocus>
                      {i < puzzles.length - 1 ? 'Next puzzle' : 'See result'}
                    </button>
                  </div>
                </div>
              )}
            </article>
          )}
        </section>

        <aside className="scoreboard" aria-labelledby="sb-title">
          <h2 id="sb-title">Your scoreboard</h2>
          <dl className="sb-stats">
            <div>
              <dt>Today</dt>
              <dd>{doneToday ? `${doneToday.score}/${doneToday.total}` : '—'}</dd>
            </div>
            <div>
              <dt>Streak</dt>
              <dd>
                {st} day{st === 1 ? '' : 's'}
              </dd>
            </div>
            <div>
              <dt>Best</dt>
              <dd>{best[0] ? `${best[0].score}/${best[0].total}` : '—'}</dd>
            </div>
          </dl>
          <h3>Best daily runs</h3>
          {top.length === 0 ? (
            <p className="note">Finish today’s puzzles to start your board. Ties are broken by time.</p>
          ) : (
            <table className="sb-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Day</th>
                  <th>Score</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {top.map((r, k) => (
                  <tr key={r.date} className={r.date === today ? 'me' : ''}>
                    <td>{k + 1}</td>
                    <td>{fmtDate(r.date)}</td>
                    <td>
                      {r.score}/{r.total}
                    </td>
                    <td>{fmtTime(r.ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3>Practice</h3>
          <p className="sb-line">
            {played ? (
              <>
                {played} hand{played === 1 ? '' : 's'} played{avg !== null ? `, average score ${avg}` : ''}. <Link to="/progress">Details</Link>
              </>
            ) : (
              <>No hands yet. <Link to="/practice">Play your first hand</Link></>
            )}
          </p>
          <p className="note">Scores are saved in this browser.</p>
        </aside>
      </div>
    </div>
  );
}
