import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { CardRow } from '../components/Card';
import { LESSON_INDEX } from '../../content/lessons';
import {
  Puzzle,
  PuzzleProgress,
  PuzzleRun,
  loadProgress,
  loadRuns,
  pointsFor,
  puzzleSet,
  randomPuzzle,
  saveProgress,
  saveRun,
  shareText,
  streak,
  todayKey,
} from '../../puzzles/daily';

const LIVES = 3;
const fmtTime = (ms: number) => {
  const s = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const fmtDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const untilMidnight = () => {
  const n = new Date();
  const m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
  const h = Math.floor((m.getTime() - n.getTime()) / 3600000);
  const min = Math.floor(((m.getTime() - n.getTime()) % 3600000) / 60000);
  return `${h}h ${min}m`;
};

type Mode = 'daily' | 'survival';

export function HomePage() {
  const { data } = useStore();
  const nav = useNavigate();
  const today = todayKey();
  const [runs, setRuns] = useState<PuzzleRun[]>(loadRuns);
  const [mode, setMode] = useState<Mode>('daily');
  const dailyRun = runs.find((r) => r.id === `daily:${today}`);

  const played = data.history.length;
  const scored = data.history.filter((h) => h.score !== null);
  const avg = scored.length ? Math.round(scored.reduce((a, h) => a + (h.score ?? 0), 0) / scored.length) : null;
  const board = [...runs].sort((a, b) => b.points - a.points || a.ms - b.ms).slice(0, 8);
  const survivalBest = runs.filter((r) => r.mode === 'survival').reduce((m, r) => Math.max(m, r.points), 0);
  const st = streak(runs);

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
          <div className="pz-modes" role="tablist" aria-label="Puzzle mode">
            <button role="tab" aria-selected={mode === 'daily'} className={mode === 'daily' ? 'on' : ''} onClick={() => setMode('daily')}>
              Daily five
              <span>{dailyRun ? `${dailyRun.points} pts today` : '5 questions · once a day'}</span>
            </button>
            <button role="tab" aria-selected={mode === 'survival'} className={mode === 'survival' ? 'on' : ''} onClick={() => setMode('survival')} data-testid="mode-survival">
              Survival
              <span>{survivalBest ? `Best ${survivalBest} pts` : `Keep going until ${LIVES} mistakes`}</span>
            </button>
          </div>
          {mode === 'daily' ? (
            <PuzzleGame key={`daily:${today}`} mode="daily" setKey={today} existing={dailyRun} runs={runs} onSaved={setRuns} onSwitch={() => setMode('survival')} />
          ) : (
            <PuzzleGame key="survival" mode="survival" setKey="survival" runs={runs} onSaved={setRuns} onSwitch={() => setMode('daily')} />
          )}
        </section>

        <aside className="scoreboard" aria-labelledby="sb-title">
          <h2 id="sb-title">Personal bests</h2>
          <dl className="sb-stats">
            <div>
              <dt>Daily five</dt>
              <dd>{dailyRun ? dailyRun.points : '—'}</dd>
            </div>
            <div>
              <dt>Streak</dt>
              <dd>
                {st}
                <small> day{st === 1 ? '' : 's'}</small>
              </dd>
            </div>
            <div>
              <dt>Survival</dt>
              <dd>{survivalBest || '—'}</dd>
            </div>
          </dl>
          <h3>Top runs</h3>
          {board.length === 0 ? (
            <p className="note">Finish a puzzle run to get on the board. Ties are broken by time.</p>
          ) : (
            <table className="sb-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Run</th>
                  <th>Points</th>
                  <th>Right</th>
                </tr>
              </thead>
              <tbody>
                {board.map((r, k) => (
                  <tr key={r.id} className={Date.now() - r.at < 60000 ? 'me' : ''}>
                    <td>{k + 1}</td>
                    <td>
                      {r.mode === 'daily' ? 'Daily' : 'Survival'} <span className="note">{fmtDate(r.date)}</span>
                    </td>
                    <td className="sb-pts">{r.points}</td>
                    <td>
                      {r.correct}/{r.total}
                    </td>
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
              <>
                No hands yet. <Link to="/practice">Play your first hand</Link>
              </>
            )}
          </p>
          <p className="note">Your best runs on this device.</p>
        </aside>
      </div>
    </div>
  );
}

function PuzzleGame({
  mode,
  setKey,
  existing,
  runs,
  onSaved,
  onSwitch,
}: {
  mode: Mode;
  setKey: string;
  existing?: PuzzleRun;
  runs: PuzzleRun[];
  onSaved: (r: PuzzleRun[]) => void;
  onSwitch: () => void;
}) {
  const { data } = useStore();
  const nav = useNavigate();
  const progressKey = `${mode}:${setKey}`;
  const fresh = (): PuzzleProgress => ({ key: progressKey, index: 0, picks: [], times: [], points: [], startedAt: Date.now(), lives: mode === 'survival' ? LIVES : undefined });
  const [prog, setProg] = useState<PuzzleProgress | null>(() => (existing ? null : loadProgress(progressKey)));
  const [survivalSeed, setSurvivalSeed] = useState(() => String(prog?.startedAt ?? Date.now()));
  const [shownAt, setShownAt] = useState(Date.now());
  const [result, setResult] = useState<PuzzleRun | null>(existing ?? null);
  const [copied, setCopied] = useState(false);

  const daily = useMemo(() => (mode === 'daily' ? puzzleSet(setKey) : []), [mode, setKey]);
  const puzzleAt = (k: number): Puzzle => (mode === 'daily' ? daily[k] : randomPuzzle(survivalSeed, k));

  useEffect(() => saveProgress(progressKey, prog), [progressKey, prog]);
  useEffect(() => setShownAt(Date.now()), [prog?.index]);

  // start screen for survival, or when nothing is in progress
  if (!prog && !result) {
    return (
      <div className="pz-card pz-start">
        <p className="pz-meta">{mode === 'daily' ? 'Daily five' : 'Survival'}</p>
        <h2 id="pz-title">{mode === 'daily' ? 'Five quick poker questions' : 'How long can you last?'}</h2>
        <p>
          {mode === 'daily'
            ? 'A preflop decision, some quick poker math, a hand to read and two surprises. Everyone gets the same five today.'
            : `Questions keep coming until you miss ${LIVES}. Any puzzle type can show up.`}
        </p>
        <ul className="pz-rules">
          <li>
            <strong>100</strong> points for a right answer
          </li>
          <li>
            up to <strong>+50</strong> more for answering fast
          </li>
          <li>
            a <strong>combo</strong> multiplier for answers in a row (up to ×2)
          </li>
        </ul>
        <button
          className="btn primary big"
          data-testid="pz-start"
          onClick={() => {
            const p = fresh();
            setSurvivalSeed(String(p.startedAt));
            setProg(p);
          }}
        >
          {mode === 'daily' ? 'Start today’s five' : 'Start survival'}
        </button>
      </div>
    );
  }

  if (result) {
    const sameMode = runs.filter((r) => r.mode === result.mode).sort((a, b) => b.points - a.points || a.ms - b.ms);
    const rank = sameMode.findIndex((r) => r.id === result.id) + 1;
    const isBest = rank === 1 && sameMode.length > 1;
    const label = result.mode === 'daily' ? fmtDate(result.date) : `${result.correct} right`;
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(shareText(result, label));
        setCopied(true);
      } catch {
        setCopied(false);
      }
    };
    return (
      <div className="pz-card pz-result" data-testid="pz-result">
        <p className="pz-meta">{result.mode === 'daily' ? `Daily five · ${fmtDate(result.date)}` : 'Survival · run over'}</p>
        <div className="pz-score">
          <span className="pz-big">{result.points}</span>
          <span className="pz-unit">points</span>
          {isBest && <span className="pz-best">New best</span>}
        </div>
        <p className="pz-marks" aria-label={`${result.correct} of ${result.total} correct`}>
          {[...result.marks].map((m, k) => (
            <span key={k} className={m === 'o' ? 'ok' : 'no'} />
          ))}
        </p>
        <p>
          {result.correct} of {result.total} right in {fmtTime(result.ms)}.{' '}
          {rank > 0 && `That is your #${rank} ${result.mode === 'daily' ? 'daily' : 'survival'} run.`}{' '}
          {result.mode === 'daily' && `New puzzles in ${untilMidnight()}.`}
        </p>
        <div className="pz-actions">
          <button className="btn" onClick={copy}>
            {copied ? 'Copied' : 'Copy result'}
          </button>
          {result.mode === 'daily' ? (
            <button className="btn primary" onClick={onSwitch}>
              Try survival
            </button>
          ) : (
            <button
              className="btn primary"
              onClick={() => {
                const p = fresh();
                setSurvivalSeed(String(p.startedAt));
                setResult(null);
                setProg(p);
              }}
            >
              Play again
            </button>
          )}
          <button className="btn ghost" onClick={() => nav('/practice')}>
            Go to practice
          </button>
        </div>
      </div>
    );
  }

  const p = puzzleAt(prog!.index);
  const pick = prog!.picks[prog!.index];
  const answered = pick !== null && pick !== undefined;
  const combo = (() => {
    let c = 0;
    for (let k = prog!.index - (answered ? 0 : 1); k >= 0; k--) {
      if (prog!.picks[k] === puzzleAt(k).answer) c++;
      else break;
    }
    return c;
  })();
  const total = prog!.points.reduce((a, b) => a + b, 0);
  const lives = prog!.lives ?? 0;

  const choose = (k: number) => {
    if (answered) return;
    const ms = Date.now() - shownAt;
    const correct = k === p.answer;
    const pts = pointsFor(correct, ms, correct ? combo + 1 : 0);
    setProg((old) => {
      if (!old) return old;
      const picks = [...old.picks];
      picks[old.index] = k;
      const times = [...old.times];
      times[old.index] = ms;
      const points = [...old.points];
      points[old.index] = pts;
      return { ...old, picks, times, points, lives: old.lives !== undefined && !correct ? old.lives - 1 : old.lives };
    });
  };

  const over = mode === 'daily' ? prog!.index >= daily.length - 1 : lives <= 0;
  const next = () => {
    if (!answered) return;
    if (!over) {
      setProg((old) => (old ? { ...old, index: old.index + 1 } : old));
      return;
    }
    // finished: save first, then show the result
    const n = prog!.index + 1;
    const marks = Array.from({ length: n }, (_, k) => (prog!.picks[k] === puzzleAt(k).answer ? 'o' : 'x')).join('');
    const run: PuzzleRun = {
      id: mode === 'daily' ? `daily:${setKey}` : `survival:${prog!.startedAt}`,
      mode,
      date: todayKey(),
      points: total,
      correct: [...marks].filter((m) => m === 'o').length,
      total: n,
      ms: prog!.times.slice(0, n).reduce((a, b) => a + (b ?? 0), 0),
      at: Date.now(),
      marks,
    };
    onSaved(saveRun(run));
    setResult(run);
    setProg(null);
  };

  const lastPts = answered ? prog!.points[prog!.index] : 0;
  return (
    <article className="pz-card" aria-live="polite">
      <div className="pz-top">
        <p className="pz-meta">
          {mode === 'daily' ? `${prog!.index + 1} of ${daily.length}` : `Question ${prog!.index + 1}`} · {p.topic}
        </p>
        <div className="pz-hud">
          {mode === 'survival' && (
            <span className="pz-lives" aria-label={`${lives} lives left`}>
              {Array.from({ length: LIVES }, (_, k) => (
                <span key={k} className={k < lives ? 'on' : ''} />
              ))}
            </span>
          )}
          {combo >= 2 && <span className="pz-combo">×{Math.min(2, 1 + 0.25 * (combo - 1)).toFixed(2).replace(/0$/, '')} combo</span>}
          <span className="pz-total">{total} pts</span>
        </div>
      </div>
      {mode === 'daily' && (
        <ol className="pz-dots" aria-hidden="true">
          {daily.map((q, k) => (
            <li key={q.id} className={`${k === prog!.index ? 'cur' : ''} ${prog!.picks[k] === undefined || prog!.picks[k] === null ? '' : prog!.picks[k] === q.answer ? 'ok' : 'no'}`} />
          ))}
        </ol>
      )}
      {!answered && <div className="pz-timer" key={prog!.index} aria-hidden="true" />}
      <h2 id="pz-title" className="pz-prompt">
        {p.prompt}
      </h2>
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
          <button key={o} className={`pz-opt ${answered ? (k === p.answer ? 'right' : k === pick ? 'wrong' : 'dim') : ''}`} onClick={() => choose(k)} disabled={answered} data-testid="pz-option">
            {o}
          </button>
        ))}
      </div>
      {answered && (
        <div className={`pz-feedback ${pick === p.answer ? 'ok' : 'no'}`} role="status">
          <p className="pz-verdict">
            {pick === p.answer ? (
              <>
                <strong>Correct</strong> <span className="pz-gain">+{lastPts}</span>
              </>
            ) : (
              <>
                <strong>Not quite</strong> — the answer is {p.options[p.answer]}.{mode === 'survival' && ` ${lives} ${lives === 1 ? 'life' : 'lives'} left.`}
              </>
            )}
          </p>
          <p>{p.explain}</p>
          <div className="pz-foot">
            <button className="btn primary pz-next" onClick={next} data-testid="pz-next">
              {over ? 'See your score' : 'Next question'}
            </button>
            {LESSON_INDEX[p.lesson] && <Link to={`/learn/${p.lesson}`}>Lesson: {LESSON_INDEX[p.lesson].title}</Link>}
          </div>
        </div>
      )}
    </article>
  );
}
