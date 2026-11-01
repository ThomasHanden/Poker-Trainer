import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { useAuth } from '../../auth/AuthContext';
import { LESSON_INDEX, SEQUENCES } from '../../content/lessons';
import { CONCEPTS } from '../../content/concepts';
import { canPractise } from '../../scenarios/generator';
import { Suggestion, continuePlan } from '../../progress/insights';
import { PARTY_HOST, occupancy, usePublicTables } from '../useLiveTable';
import { PUBLIC_TABLES, buyInFor, fmtChips, stakesFor, tableLabel } from '../../multiplayer/table';
import { loadRun, newRunId, runDone } from '../../progress/conceptRun';
import { StartChoice, loadStartChoice, saveStartChoice, shouldAskStart } from '../startChoice';
import { track } from '../analytics';
import { progressKnown } from '../../persistence/accountSync';
import { LIVES, PuzzleRun, challengeKey, loadRuns, streak } from '../../puzzles/daily';
import { PuzzleGame, fmtDate, type Mode } from '../components/PuzzleGame';
import { rankedAvailable } from '../leaderboards';

/** Where someone new to poker starts: the first lesson of the First steps track. */
const FIRST_LESSON = SEQUENCES.find((s) => s.id === 'first-steps')?.lessons[0] ?? 'rules-rankings';

export function HomePage() {
  const { data, owner, runsVersion, sync } = useStore();
  const { status } = useAuth();
  const today = challengeKey();
  const ranked = rankedAvailable(status === 'signed-in');
  const [runs, setRuns] = useState<PuzzleRun[]>(loadRuns);
  // results arrive from the account after signing in
  useEffect(() => setRuns(loadRuns()), [owner, runsVersion]);
  const [params] = useSearchParams();
  const { hash } = useLocation();
  // links from the leaderboards: /?play=survival#daily
  const [mode, setMode] = useState<Mode>(params.get('play') === 'survival' ? 'survival' : 'daily');
  useEffect(() => {
    if (hash === '#daily') document.getElementById('daily')?.scrollIntoView({ block: 'start' });
  }, [hash]);
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
              key={`daily:${today}:${ranked}`}
              mode="daily"
              setKey={today}
              existing={dailyRun}
              runs={runs}
              onSaved={setRuns}
              onSwitch={() => setMode('survival')}
              fourColor={data.prefs.fourColor}
              ranked={ranked}
            />
          ) : (
            <PuzzleGame
              key={`survival:${ranked}`}
              mode="survival"
              setKey="survival"
              runs={runs}
              onSaved={setRuns}
              onSwitch={() => setMode('daily')}
              fourColor={data.prefs.fourColor}
              ranked={ranked}
            />
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
          <p className="note">{owner ? 'Bests, runs and practice stats are saved to your account.' : 'Bests, runs and practice stats are saved in this browser.'}</p>
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
