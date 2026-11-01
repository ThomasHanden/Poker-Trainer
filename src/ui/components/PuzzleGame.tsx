// The daily five and survival games on the home page. Guests play in the browser, as always.
// Signed-in players play ranked: the table server runs the run (src/puzzles/ranked.ts), times
// each answer and saves the result to the leaderboard. If the server cannot be reached they can
// still play unranked, here in the browser.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Card } from '../../engine/cards';
import { CardRow } from './Card';
import { LESSON_INDEX } from '../../content/lessons';
import { trackOnce } from '../analytics';
import {
  LIVES,
  Puzzle,
  PuzzleProgress,
  PuzzleRun,
  challengeKey,
  loadProgress,
  nextChallengeAt,
  pointsFor,
  puzzleSet,
  randomPuzzle,
  saveProgress,
  saveRun,
  shareText,
} from '../../puzzles/daily';
import { DAILY_QUESTIONS, personalRun, puzzleOf, type Attempt, type SaveState } from '../../puzzles/ranked';
import { RankedError, rankedCall, type RankedView } from '../leaderboards';

export type Mode = 'daily' | 'survival';

const fmtTime = (ms: number) => {
  const s = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const fmtDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
};
/** "5h 12m" until the next daily five (midnight UTC). */
export const untilNext = (now = Date.now()) => {
  const left = nextChallengeAt(now) - now;
  return `${Math.floor(left / 3600000)}h ${Math.floor((left % 3600000) / 60000)}m`;
};
const comboMult = (combo: number) => Math.min(2, 1 + 0.25 * (combo - 1));

interface GameProps {
  mode: Mode;
  /** the daily five's date (UTC), or 'survival' */
  setKey: string;
  /** today's result already in the personal history */
  existing?: PuzzleRun;
  runs: PuzzleRun[];
  onSaved: (r: PuzzleRun[]) => void;
  onSwitch: () => void;
  fourColor: boolean;
  /** signed in, with the table server and leaderboards available */
  ranked: boolean;
  /** a ranked run reached the leaderboard */
  onRanked?: () => void;
}

export function PuzzleGame(props: GameProps) {
  // a signed-in player whose ranked server could not be reached may choose to play unranked
  const [unranked, setUnranked] = useState(false);
  if (props.ranked && !unranked) return <RankedGame {...props} onUnranked={() => setUnranked(true)} />;
  return <LocalGame {...props} note={props.ranked ? 'Playing unranked: this result stays in your history but not on the leaderboard.' : null} />;
}

// ---------------- what both games show ----------------

function StartCard({ mode, onStart, busy, ranked, extra }: { mode: Mode; onStart: () => void; busy?: boolean; ranked: boolean; extra?: React.ReactNode }) {
  return (
    <div className="pz-card pz-start">
      <p className="pz-meta">
        {mode === 'daily' ? 'Daily five' : 'Survival'}
        {ranked && <span className="pz-ranked">Ranked</span>}
      </p>
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
      {ranked && (
        <p className="note pz-rank-note">
          {mode === 'daily'
            ? 'One ranked try per day: once you start, reloading or another tab carries on the same run, and the clock keeps running.'
            : 'Each finished run counts. Your best goes on the all-time and weekly leaderboards.'}
        </p>
      )}
      {extra}
      <button className="btn primary big" data-testid="pz-start" onClick={onStart} disabled={busy}>
        {busy ? 'Starting…' : mode === 'daily' ? 'Start today’s five' : 'Start survival'}
      </button>
    </div>
  );
}

interface QuestionProps {
  mode: Mode;
  index: number;
  puzzle: Puzzle;
  /** the option picked, once answered */
  pick: number | null;
  /** an answer on its way to the server */
  pending: number | null;
  lives: number;
  combo: number;
  total: number;
  lastPts: number;
  /** daily: each question's state, for the dots */
  dots?: ('ok' | 'no' | '')[];
  over: boolean;
  /** how long ago the question was first shown (a resumed run), to line up the timer bar */
  elapsedMs: number;
  onChoose: (k: number) => void;
  onNext: () => void;
  fourColor: boolean;
  problem?: React.ReactNode;
}

function QuestionCard(q: QuestionProps) {
  const p = q.puzzle;
  const answered = q.pick !== null;
  const cards: [string, Card[] | undefined][] = [
    ['Board', p.board],
    ['You', p.hero],
    ['Opponent', p.villain],
  ];
  return (
    <article className="pz-card" aria-live="polite">
      <div className="pz-top">
        <p className="pz-meta">
          {q.mode === 'daily' ? `${q.index + 1} of ${DAILY_QUESTIONS}` : `Question ${q.index + 1}`} · {p.topic}
        </p>
        <div className="pz-hud">
          {q.mode === 'survival' && (
            <span className="pz-lives" aria-label={`${q.lives} lives left`}>
              {Array.from({ length: LIVES }, (_, k) => (
                <span key={k} className={k < q.lives ? 'on' : ''} />
              ))}
            </span>
          )}
          {q.combo >= 2 && <span className="pz-combo">×{comboMult(q.combo).toFixed(2).replace(/0$/, '')} combo</span>}
          <span className="pz-total">{q.total} pts</span>
        </div>
      </div>
      {q.dots && (
        <ol className="pz-dots" aria-hidden="true">
          {q.dots.map((d, k) => (
            <li key={k} className={`${k === q.index ? 'cur' : ''} ${d}`} />
          ))}
        </ol>
      )}
      {!answered && <div className="pz-timer" key={q.index} aria-hidden="true" style={q.elapsedMs > 0 ? { animationDelay: `-${q.elapsedMs}ms` } : undefined} />}
      <h2 id="pz-title" className="pz-prompt">
        {p.prompt}
      </h2>
      {(p.hero || p.board) && (
        <div className="pz-cards">
          {cards.map(([label, c]) =>
            c ? (
              <div key={label}>
                <span className="pz-cl">{label}</span>
                <CardRow cards={c} size="md" fourColor={q.fourColor} />
              </div>
            ) : null,
          )}
        </div>
      )}
      <div className={`pz-options n${p.options.length}`}>
        {p.options.map((o, k) => (
          <button
            key={o}
            className={`pz-opt ${answered ? (k === p.answer ? 'right' : k === q.pick ? 'wrong' : 'dim') : k === q.pending ? 'pending' : ''}`}
            onClick={() => q.onChoose(k)}
            disabled={answered || q.pending !== null}
            data-testid="pz-option"
          >
            {o}
          </button>
        ))}
      </div>
      {q.problem}
      {answered && (
        <div className={`pz-feedback ${q.pick === p.answer ? 'ok' : 'no'}`} role="status">
          <p className="pz-verdict">
            {q.pick === p.answer ? (
              <>
                <strong>Correct</strong> <span className="pz-gain">+{q.lastPts}</span>
              </>
            ) : (
              <>
                <strong>Not quite</strong> — the answer is {p.options[p.answer]}.{q.mode === 'survival' && ` ${q.lives} ${q.lives === 1 ? 'life' : 'lives'} left.`}
              </>
            )}
          </p>
          <p>{p.explain}</p>
          <div className="pz-foot">
            <button className="btn primary pz-next" onClick={q.onNext} data-testid="pz-next">
              {q.over ? 'See your score' : 'Next question'}
            </button>
            {LESSON_INDEX[p.lesson] && <Link to={`/learn/${p.lesson}`}>Lesson: {LESSON_INDEX[p.lesson].title}</Link>}
          </div>
        </div>
      )}
    </article>
  );
}

function ResultCard({ result, runs, onAgain, onSwitch, ranking }: { result: PuzzleRun; runs: PuzzleRun[]; onAgain: () => void; onSwitch: () => void; ranking: React.ReactNode }) {
  const nav = useNavigate();
  const [copied, setCopied] = useState(false);
  const sameMode = runs.filter((r) => r.mode === result.mode).sort((a, b) => b.points - a.points || a.ms - b.ms);
  const mine = sameMode.findIndex((r) => r.id === result.id) + 1;
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
      </div>
      <p className="pz-marks" aria-label={`${result.correct} of ${result.total} correct`}>
        {[...result.marks].map((m, k) => (
          <span key={k} className={m === 'o' ? 'ok' : 'no'} />
        ))}
      </p>
      <p>
        {result.correct} of {result.total} right in {fmtTime(result.ms)}.{' '}
        {mine > 0 && sameMode.length > 1 && `That is your #${mine} ${result.mode === 'daily' ? 'daily' : 'survival'} run.`}{' '}
        {result.mode === 'daily' && `New puzzles in ${untilNext()}.`}
      </p>
      {ranking}
      <div className="pz-actions">
        <button className="btn" onClick={copy}>
          {copied ? 'Copied' : 'Copy result'}
        </button>
        {result.mode === 'daily' ? (
          <button className="btn primary" onClick={onSwitch}>
            Try survival
          </button>
        ) : (
          <button className="btn primary" onClick={onAgain}>
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

/** The leaderboard sits beside the game (below it on phones). */
const toBoard = () => document.getElementById('leaderboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// ---------------- guests (and unranked play): in the browser ----------------

function LocalGame({ mode, setKey, existing, runs, onSaved, onSwitch, fourColor, note }: GameProps & { note: string | null }) {
  const progressKey = `${mode}:${setKey}`;
  const fresh = (): PuzzleProgress => ({ key: progressKey, index: 0, picks: [], times: [], points: [], startedAt: Date.now(), lives: mode === 'survival' ? LIVES : undefined });
  const [prog, setProg] = useState<PuzzleProgress | null>(() => (existing ? null : loadProgress(progressKey)));
  const [survivalSeed, setSurvivalSeed] = useState(() => String(prog?.startedAt ?? Date.now()));
  const [shownAt, setShownAt] = useState(Date.now());
  const [result, setResult] = useState<PuzzleRun | null>(existing ?? null);

  const daily = useMemo(() => (mode === 'daily' ? puzzleSet(setKey) : []), [mode, setKey]);
  const puzzleAt = (k: number): Puzzle => (mode === 'daily' ? daily[k] : randomPuzzle(survivalSeed, k));

  useEffect(() => {
    saveProgress(progressKey, prog);
  }, [progressKey, prog]);
  useEffect(() => setShownAt(Date.now()), [prog?.index]);

  const begin = () => {
    const p = fresh();
    setSurvivalSeed(String(p.startedAt));
    setResult(null);
    setProg(p);
  };
  const signInNote = (
    <p className="pz-rank-line note">
      {note ?? (
        <>
          <Link to="/login?next=%2F">Sign in</Link> to put your results on the{' '}
          <button className="linklike" onClick={toBoard}>
            leaderboard
          </button>
          .
        </>
      )}
    </p>
  );

  if (!prog && !result) return <StartCard mode={mode} onStart={begin} ranked={false} extra={signInNote} />;
  if (result) return <ResultCard result={result} runs={runs} onAgain={begin} onSwitch={onSwitch} ranking={signInNote} />;

  const pick = prog!.picks[prog!.index];
  const answered = pick !== null && pick !== undefined;
  const p = puzzleAt(prog!.index);
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
  const over = mode === 'daily' ? prog!.index >= daily.length - 1 : lives <= 0;

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
      date: mode === 'daily' ? setKey : challengeKey(),
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

  return (
    <QuestionCard
      mode={mode}
      index={prog!.index}
      puzzle={p}
      pick={answered ? pick : null}
      pending={null}
      lives={lives}
      combo={combo}
      total={total}
      lastPts={answered ? prog!.points[prog!.index] : 0}
      dots={mode === 'daily' ? daily.map((q, k) => (prog!.picks[k] === undefined || prog!.picks[k] === null ? '' : prog!.picks[k] === q.answer ? 'ok' : 'no')) : undefined}
      over={over}
      elapsedMs={0}
      onChoose={choose}
      onNext={next}
      fourColor={fourColor}
    />
  );
}

// ---------------- signed in: ranked, through the table server ----------------

function RankedGame({ mode, existing, runs, onSaved, onSwitch, fourColor, onUnranked, onRanked }: GameProps & { onUnranked: () => void }) {
  const [view, setView] = useState<RankedView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** the question on screen; it stays up with its feedback after it is answered, until Next */
  const [shown, setShown] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [problem, setProblem] = useState<{ message: string; retry?: () => void } | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  /** server clock minus this browser's, so a resumed question's timer bar lines up */
  const skew = useRef(0);
  const a: Attempt | null = view?.attempt ?? null;

  const apply = useCallback((v: RankedView) => {
    skew.current = v.now - Date.now();
    setView(v);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const v = await rankedCall('state', mode);
      apply(v);
      if (v.attempt?.status === 'done') setShowResult(true);
      else if (v.attempt) setShown(v.attempt.picks.length);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [mode, apply]);
  useEffect(() => {
    void load();
  }, [load]);

  // a finished run goes into the personal history too (once), like an unranked one
  useEffect(() => {
    if (a?.status !== 'done') return;
    const run = personalRun(a);
    if (!runs.some((r) => r.id === run.id)) {
      onSaved(saveRun(run));
      trackOnce(`puzzle:${run.id}`, 'Puzzle Completed', { mode: run.mode, ranked: true });
    }
  }, [a, runs, onSaved]);

  // once the run is on the leaderboard, the board beside the game shows it
  const saved = view?.save?.state === 'saved' ? view.attempt?.id : null;
  useEffect(() => {
    if (saved) onRanked?.();
  }, [saved, onRanked]);

  // the question on screen has to be shown by the server first: that starts its clock
  const serving = useRef(false);
  useEffect(() => {
    if (!a || a.status !== 'active' || shown === null || shown !== a.picks.length || a.servedAt[shown] != null || serving.current) return;
    serving.current = true;
    rankedCall('serve', mode, { id: a.id, index: shown })
      .then(apply, (e: RankedError) => {
        if (e.view) apply(e.view);
        setProblem({ message: e.message, retry: e.network ? () => setProblem(null) : undefined });
      })
      .finally(() => {
        serving.current = false;
      });
  }, [a, shown, mode, apply, problem]);

  const start = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const v = await rankedCall('start', mode);
      apply(v);
      setShowResult(v.attempt?.status === 'done');
      setShown(v.attempt?.picks.length ?? 0);
    } catch (e) {
      setProblem({ message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const choose = async (k: number) => {
    if (!a || shown === null || pending !== null) return;
    setPending(k);
    setProblem(null);
    try {
      apply(await rankedCall('answer', mode, { id: a.id, index: shown, pick: k }));
    } catch (e) {
      const err = e as RankedError;
      if (err.view) apply(err.view);
      setProblem({ message: err.message, retry: err.network ? () => void choose(k) : undefined });
    } finally {
      setPending(null);
    }
  };

  const retrySave = async () => {
    if (!a) return;
    setView((v) => (v ? { ...v, save: { state: 'saving' } } : v));
    try {
      apply(await rankedCall('save', mode, { id: a.id }));
    } catch (e) {
      setView((v) => (v ? { ...v, save: { state: 'failed', message: (e as Error).message } } : v));
    }
  };

  if (!view) {
    return (
      <div className="pz-card pz-start" aria-busy={!loadError}>
        <p className="pz-meta">
          {mode === 'daily' ? 'Daily five' : 'Survival'} <span className="pz-ranked">Ranked</span>
        </p>
        {loadError ? (
          <>
            <h2 id="pz-title">The leaderboard server can’t be reached</h2>
            <p>{loadError} You can try again, or play now without ranking.</p>
            <div className="pz-actions">
              <button className="btn primary" onClick={() => void load()}>
                Try again
              </button>
              <button className="btn" onClick={onUnranked}>
                Play unranked
              </button>
            </div>
          </>
        ) : (
          <p className="note">Loading your run…</p>
        )}
      </div>
    );
  }

  const problemBox = problem && (
    <p className="pz-problem" role="alert">
      {problem.message}{' '}
      {problem.retry && (
        <button className="linklike" onClick={problem.retry}>
          Try again
        </button>
      )}
    </p>
  );

  // nothing started yet (or, in survival, a new run after the last one)
  if (!a || (a.status === 'done' && !showResult)) {
    // today's five was already played here before signing in: the answers have been seen
    if (mode === 'daily' && existing && !a) {
      return (
        <ResultCard
          result={existing}
          runs={runs}
          onAgain={() => undefined}
          onSwitch={onSwitch}
          ranking={<p className="pz-rank-line note">You played today’s five before signing in, so it is not ranked. A new one starts in {untilNext()}.</p>}
        />
      );
    }
    return <StartCard mode={mode} onStart={() => void start()} busy={busy} ranked extra={problemBox} />;
  }

  if (a.status === 'done' && (showResult || shown === null)) {
    return (
      <ResultCard
        result={personalRun(a)}
        runs={runs}
        onAgain={() => {
          setShowResult(false);
          void start();
        }}
        onSwitch={onSwitch}
        ranking={<RankingLine mode={mode} save={view.save} onRetry={() => void retrySave()} />}
      />
    );
  }

  if (view.lapsed) {
    return (
      <div className="pz-card pz-start">
        <p className="pz-meta">Daily five</p>
        <h2 id="pz-title">That daily five has ended</h2>
        <p>It wasn’t finished before midnight UTC, so it isn’t ranked. Today’s five is ready.</p>
        <button className="btn primary" onClick={() => window.location.reload()}>
          Load today’s five
        </button>
      </div>
    );
  }

  const index = shown ?? a.picks.length;
  const puzzle = puzzleOf(a, index);
  const answered = index < a.picks.length;
  if (!answered && a.servedAt[index] == null) {
    return (
      <div className="pz-card pz-start" aria-busy={!problem}>
        <p className="pz-meta">
          {mode === 'daily' ? `${index + 1} of ${DAILY_QUESTIONS}` : `Question ${index + 1}`} <span className="pz-ranked">Ranked</span>
        </p>
        {problemBox ?? <p className="note">Getting the question…</p>}
      </div>
    );
  }
  const pickHere = answered ? a.picks[index] : null;
  let combo = 0;
  for (let k = index - (answered ? 0 : 1); k >= 0 && a.picks[k] === puzzleOf(a, k).answer; k--) combo++;
  const total = a.points.slice(0, answered ? index + 1 : index).reduce((x, y) => x + y, 0);
  const servedAt = a.servedAt[index] ?? Date.now() + skew.current;
  return (
    <QuestionCard
      mode={mode}
      index={index}
      puzzle={puzzle}
      pick={pickHere}
      pending={pending}
      lives={a.lives ?? 0}
      combo={combo}
      total={total}
      lastPts={answered ? a.points[index] : 0}
      dots={mode === 'daily' ? Array.from({ length: DAILY_QUESTIONS }, (_, k) => (k >= a.picks.length ? '' : a.picks[k] === puzzleOf(a, k).answer ? 'ok' : 'no')) : undefined}
      over={answered && a.status === 'done'}
      elapsedMs={Math.max(0, Date.now() + skew.current - servedAt)}
      onChoose={(k) => void choose(k)}
      onNext={() => {
        if (a.status === 'done') setShowResult(true);
        else setShown(index + 1);
      }}
      fourColor={fourColor}
      problem={problemBox}
    />
  );
}

/** Where a finished ranked run stands: saving, saved (with its rank), or not saved yet. */
function RankingLine({ mode, save, onRetry }: { mode: Mode; save: SaveState | null; onRetry: () => void }) {
  const link = (
    <button className="btn small" onClick={toBoard}>
      See the leaderboard
    </button>
  );
  if (!save || save.state === 'saving') {
    return (
      <div className="pz-ranking" role="status">
        <p>Saving to the leaderboard…</p>
      </div>
    );
  }
  if (save.state === 'failed') {
    return (
      <div className="pz-ranking bad" role="alert">
        <p>
          <strong>Not on the leaderboard yet.</strong> {save.message}
        </p>
        <div className="pz-actions">
          <button className="btn small" onClick={onRetry}>
            Try again
          </button>
          {link}
        </div>
      </div>
    );
  }
  return (
    <div className="pz-ranking ok" role="status">
      <p>
        <strong>Ranked{save.rank ? ` #${save.rank}` : ''}</strong>
        {mode === 'daily' ? ` of ${save.entries} today.` : ` of ${save.entries} all time${save.weekRank ? `, #${save.weekRank} this week` : ''}.`}{' '}
        {mode === 'survival' &&
          (save.newBest ? (
            <span className="pz-best">{save.previousBest == null ? 'First ranked run' : 'New personal best'}</span>
          ) : (
            save.best != null && `Your best is ${save.best}.`
          ))}
      </p>
      {link}
    </div>
  );
}
