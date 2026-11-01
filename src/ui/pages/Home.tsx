import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { useAuth } from '../../auth/AuthContext';
import { CardRow } from '../components/Card';
import { LESSON_INDEX, SEQUENCES } from '../../content/lessons';
import { CONCEPTS } from '../../content/concepts';
import { canPractise } from '../../scenarios/generator';
import { Suggestion, continuePlan } from '../../progress/insights';
import { PARTY_HOST, occupancy, usePublicTables } from '../useLiveTable';
import { PUBLIC_TABLES, buyInFor, fmtChips, stakesFor, tableLabel } from '../../multiplayer/table';
import { loadRun, newRunId, runDone } from '../../progress/conceptRun';
import { StartChoice, loadStartChoice, saveStartChoice, shouldAskStart } from '../startChoice';
import { track, trackOnce } from '../analytics';
import { progressKnown } from '../../persistence/accountSync';
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

/** Where someone new to poker starts: the first lesson of the First steps track. */
const FIRST_LESSON = SEQUENCES.find((s) => s.id === 'first-steps')?.lessons[0] ?? 'rules-rankings';

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
  const { data, owner, runsVersion, sync } = useStore();
  const { status } = useAuth();
  const today = todayKey();
  const [runs, setRuns] = useState<PuzzleRun[]>(loadRuns);
  // results arrive from the account after signing in
  useEffect(() => setRuns(loadRuns()), [owner, runsVersion]);
  const [mode, setMode] = useState<Mode>('daily');
  const dailyRun = runs.find((r) => r.id === `daily:${today}`);
  const [startChoice, setStartChoice] = useState<StartChoice | null>(loadStartChoice);
  // a signed-in account's progress is still on its way: decide nothing about it yet (no wrong suggestions
  // in the meantime). The page built ahead of time (scripts/prerender.tsx) shows neither card either.
  const settled = typeof window !== 'undefined' && progressKnown(status, owner, sync);
  const activity = { hands: data.history.length, lessons: Object.keys(data.lessons).length, puzzles: runs.length };
  const askStart = settled && shouldAskStart(startChoice, activity);
  const returning = settled && activity.hands + activity.lessons + activity.puzzles > 0;
  const remember = (c: StartChoice) => {
    saveStartChoice(c);
    setStartChoice(c);
  };

  const plan = useMemo(() => {
    if (!returning) return [];
    const r = loadRun();
    return continuePlan({
      history: data.history,
      lessons: data.lessons,
      canPractise: (c) => canPractise(data.settings, c),
      run: r && !runDone(r) ? { concept: r.concept, done: r.hands.length, total: r.total } : null,
    });
  }, [returning, data.history, data.lessons, data.settings]);

  const played = data.history.length;
  const scored = data.history.filter((h) => h.score !== null);
  const avg = scored.length ? Math.round(scored.reduce((a, h) => a + (h.score ?? 0), 0) / scored.length) : null;
  const board = [...runs].sort((a, b) => b.points - a.points || a.ms - b.ms).slice(0, 8);
  const dailyBest = runs.filter((r) => r.mode === 'daily').reduce((m, r) => Math.max(m, r.points), 0);
  const survivalBest = runs.filter((r) => r.mode === 'survival').reduce((m, r) => Math.max(m, r.points), 0);
  const st = streak(runs);

  return (
    <div className="page home">
      <section className="home-band">
        <div>
          <p className="eyebrow">Free play-money No-Limit Hold’em</p>
          <h1>Sit down at a live table.</h1>
          <p className="lead">Play real people, with bots filling the empty seats so a hand starts in seconds. Then sharpen your game with practice and today’s puzzles.</p>
          {!askStart && (
            <p className="home-new">
              New to poker? <Link to={`/learn/${FIRST_LESSON}`}>Start with the first lesson</Link>
            </p>
          )}
        </div>
        {!askStart && (
          <div className="home-actions">
            <Link className="btn primary big" to="/play" data-testid="home-play-live">
              Play live →
            </Link>
            <Link className="btn big" to="/practice">
              Practice
            </Link>
            <button
              className="btn big"
              onClick={() => document.getElementById('daily')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              data-testid="home-mini-games"
            >
              Mini games ↓
            </button>
          </div>
        )}
      </section>

      {askStart && (
        <section className="start-choice" aria-labelledby="start-title" data-testid="start-choice">
          <h2 id="start-title">Where would you like to start?</h2>
          <div className="start-options">
            <Link className="start-option" to={`/learn/${FIRST_LESSON}`} onClick={() => remember('new')}>
              <strong>New to poker</strong>
              <span>How a hand plays and which hands win, in short lessons.</span>
            </Link>
            <Link className="start-option" to="/practice?start=1&mode=guided" onClick={() => remember('rules')}>
              <strong>I know the rules</strong>
              <span>Play a practice hand with hints if you want them, then see the best play and why.</span>
            </Link>
            <Link className="start-option" to="/play" onClick={() => remember('game')}>
              <strong>Just want a game</strong>
              <span>Sit down at a live table with other players and bots. Play chips only, no real money.</span>
            </Link>
          </div>
          <button className="linklike start-skip" onClick={() => remember('skip')} data-testid="start-skip">
            Skip — I’ll look around
          </button>
        </section>
      )}

      {!askStart && PARTY_HOST && <LiveTables />}

      {returning && plan.length > 0 && <ContinueCard plan={plan} />}

      <div className="home-grid">
        <section className="puzzles" id="daily" aria-labelledby="pz-title">
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
            <PuzzleGame
              key={`daily:${today}`}
              mode="daily"
              setKey={today}
              existing={dailyRun}
              runs={runs}
              onSaved={setRuns}
              onSwitch={() => setMode('survival')}
            />
          ) : (
            <PuzzleGame key="survival" mode="survival" setKey="survival" runs={runs} onSaved={setRuns} onSwitch={() => setMode('daily')} />
          )}
        </section>

        <aside className="scoreboard" aria-labelledby="sb-title">
          <h2 id="sb-title">Personal bests</h2>
          <dl className="sb-stats">
            <div>
              <dt>Daily five</dt>
              <dd>{dailyBest || '—'}</dd>
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
          {board.length > 0 && <h3>Top runs</h3>}
          {board.length > 0 && (
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
          <p className="sb-line">
            <strong>Practice:</strong>{' '}
            {played ? (
              <>
                {played} hand{played === 1 ? '' : 's'}
                {avg !== null ? `, average ${avg}` : ''} · <Link to="/progress">Details</Link>
              </>
            ) : (
              <Link to="/practice">play your first hand</Link>
            )}
          </p>
        </aside>
      </div>
    </div>
  );
}

/** The public tables, how full each one is, and a seat at any of them. */
function LiveTables() {
  const tables = usePublicTables();
  return (
    <section className="home-live live-card" aria-labelledby="home-live-title" data-testid="home-live">
      <div className="home-live-head">
        <h2 id="home-live-title">Live tables</h2>
        <Link to="/play">Private tables and your chips →</Link>
      </div>
      <ul className="live-tables">
        {PUBLIC_TABLES.map((room) => {
          const s = tables[room];
          const buyIn = buyInFor(stakesFor(room));
          const full = !!s && s.players >= s.maxSeats;
          return (
            <li key={room}>
              <span className="lt-name">{tableLabel(room)}</span>
              <span className="lt-count note">
                Buy-in {fmtChips(buyIn.min)}–{fmtChips(buyIn.max)} · {s === undefined ? '…' : s === null ? 'unavailable' : occupancy(s)}
              </span>
              <Link className={`btn small ${full ? '' : 'primary'}`} to={`/play/${room}`} aria-label={`${full ? 'Watch' : 'Join'} ${tableLabel(room)}`}>
                {full ? 'Watch' : 'Join'}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The home page's one suggested next step for someone who has been here before, with up to two smaller ones. */
function ContinueCard({ plan }: { plan: Suggestion[] }) {
  const [main, ...rest] = plan;
  const used = (s: Suggestion, place: 'main' | 'more') => track('Continue Card Used', { type: s.kind, place });
  const more = rest.slice(0, 2);
  const text = mainText(main);
  return (
    <section className="continue" aria-labelledby="continue-title" data-testid="continue">
      <p className="eyebrow">Continue</p>
      <h2 id="continue-title">{text.title}</h2>
      <p className="continue-why">{text.body}</p>
      <Link className="btn primary" to={href(main)} onClick={() => used(main, 'main')}>
        {text.action}
      </Link>
      {more.length > 0 && (
        <ul className="continue-more">
          {more.map((s) => (
            <li key={s.kind}>
              <Link className="linklike" to={href(s)} onClick={() => used(s, 'more')}>
                {moreText(s)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function href(s: Suggestion): string {
  switch (s.kind) {
    case 'concept':
      // carrying on keeps the run's id, so the hands already played count; a new run gets a new one
      return `/practice?concept=${s.concept}&run=${s.resume ? (loadRun()?.id ?? newRunId()) : newRunId()}`;
    case 'concept-lesson':
      return `/learn/${CONCEPTS[s.concept].lesson}`;
    case 'lesson':
      return `/learn/${s.lesson}`;
    case 'practice':
      return '/practice?start=1';
  }
}

function mainText(s: Suggestion): { title: string; body: string; action: string } {
  switch (s.kind) {
    case 'concept': {
      const name = CONCEPTS[s.concept].name;
      if (s.resume) return { title: `Carry on with ${name}`, body: `You have played ${s.resume.done} of your ${s.resume.total} hands on it.`, action: 'Continue' };
      return {
        title: `Work on ${name}`,
        body: `Your decisions on it average ${Math.round(s.avg)} over the last ${s.n}. Play five hands on it, then see how they went.`,
        action: 'Practise 5 hands',
      };
    }
    case 'concept-lesson': {
      const c = CONCEPTS[s.concept];
      return {
        title: `Brush up on ${c.name}`,
        body: `Your decisions on it average ${Math.round(s.avg)} over the last ${s.n}. Practice does not deal these spots with your current settings, so start with the lesson.`,
        action: `Read: ${LESSON_INDEX[c.lesson]?.title ?? c.name}`,
      };
    }
    case 'lesson':
      return { title: `Continue ${s.title}`, body: `${s.done} of ${s.total} lessons done. Next: ${LESSON_INDEX[s.lesson]?.title ?? s.lesson}.`, action: 'Read the next lesson' };
    case 'practice':
      return {
        title: 'Keep practising',
        body: 'Play a few more hands. Once a concept has five scored decisions, this will suggest what to work on.',
        action: 'Deal a hand',
      };
  }
}

function moreText(s: Suggestion): string {
  switch (s.kind) {
    case 'concept':
      return s.resume ? `Carry on: ${CONCEPTS[s.concept].name} (${s.resume.done} of ${s.resume.total})` : `Practise 5 hands on ${CONCEPTS[s.concept].name}`;
    case 'concept-lesson':
      return `Read: ${LESSON_INDEX[CONCEPTS[s.concept].lesson]?.title ?? CONCEPTS[s.concept].name}`;
    case 'lesson':
      return `Next in ${s.title}: ${LESSON_INDEX[s.lesson]?.title ?? s.lesson}`;
    case 'practice':
      return 'Deal a practice hand';
  }
}

function PuzzleGame({
  mode,
  setKey,
  existing,
  runs,
  onSaved,
  onSwitch,
  onProgress,
}: {
  mode: Mode;
  setKey: string;
  existing?: PuzzleRun;
  runs: PuzzleRun[];
  onSaved: (r: PuzzleRun[]) => void;
  onSwitch: () => void;
  onProgress?: () => void;
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

  useEffect(() => {
    saveProgress(progressKey, prog);
    onProgress?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressKey, prog]);
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
        <p className="pz-rules-line">
          <strong>100</strong> a right answer · up to <strong>+50</strong> for speed · <strong>×2</strong> combo for answers in a row
        </p>
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
    trackOnce(`puzzle:${run.id}`, 'Puzzle Completed', { mode: run.mode });
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
