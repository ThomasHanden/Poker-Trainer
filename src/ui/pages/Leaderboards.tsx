// Leaderboards: live-table chips, the daily five and survival. Anyone can browse; signed-in
// players see where they stand, even beyond the first page. Lists load a page at a time from the
// database, which works out every rank (src/ui/leaderboards.ts).
import { KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { fmtChips } from '../../multiplayer/table';
import { challengeKey } from '../../puzzles/daily';
import { weekBounds, weekKey } from '../../puzzles/ranked';
import { PAGE_SIZE, fetchBoard, fetchDailyDays, fetchStanding, leaderboardsAvailable, type Board, type Row, type Standing } from '../leaderboards';
import { fmtDate, untilNext } from '../components/PuzzleGame';

const BOARDS: { id: Board; label: string }[] = [
  { id: 'live', label: 'Live Play' },
  { id: 'daily', label: 'Daily Five' },
  { id: 'survival', label: 'Survival' },
];
const isBoard = (b: string | null): b is Board => b === 'live' || b === 'daily' || b === 'survival';
/** How often the chip board refreshes while it is open: balances move as hands settle. */
const LIVE_REFRESH_MS = 30_000;

const utcDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const weekLabel = (now: number) => {
  const { start, end } = weekBounds(now);
  return `${utcDay(new Date(start).toISOString())} – ${utcDay(new Date(end - 1).toISOString())}`;
};

export function LeaderboardsPage() {
  const [params, setParams] = useSearchParams();
  const board: Board = isBoard(params.get('board')) ? (params.get('board') as Board) : 'live';
  const today = challengeKey();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.get('day') ?? '') ? params.get('day')! : today;
  const period = params.get('period') === 'week' ? 'week' : 'all';
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (b: Board, focus = false) => {
    setParams(b === 'live' ? {} : { board: b }, { replace: true });
    if (focus) tabs.current[BOARDS.findIndex((x) => x.id === b)]?.focus();
  };
  const onTabKey = (e: KeyboardEvent) => {
    const k = BOARDS.findIndex((x) => x.id === board);
    const to = e.key === 'ArrowRight' ? (k + 1) % 3 : e.key === 'ArrowLeft' ? (k + 2) % 3 : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : -1;
    if (to < 0) return;
    e.preventDefault();
    choose(BOARDS[to].id, true);
  };
  const set = (patch: Record<string, string>) => setParams({ board, ...(board === 'daily' ? { day } : {}), ...(board === 'survival' ? { period } : {}), ...patch }, { replace: true });

  return (
    <div className="page leaderboards">
      <header className="lb-head">
        <p className="eyebrow">Play money only</p>
        <h1>Leaderboards</h1>
        <p className="lead">Chips at the live tables and scores from the daily five and survival. Results count once a signed-in player’s hand settles or run finishes.</p>
      </header>

      {!leaderboardsAvailable() ? (
        <p className="error-box">Leaderboards need accounts, which are not set up on this site yet.</p>
      ) : (
        <>
          <div className="lb-tabs" role="tablist" aria-label="Leaderboard" onKeyDown={onTabKey}>
            {BOARDS.map((b, k) => (
              <button
                key={b.id}
                ref={(el) => (tabs.current[k] = el)}
                role="tab"
                id={`lb-tab-${b.id}`}
                aria-selected={board === b.id}
                aria-controls="lb-panel"
                tabIndex={board === b.id ? 0 : -1}
                className={board === b.id ? 'on' : ''}
                onClick={() => choose(b.id)}
              >
                {b.label}
              </button>
            ))}
          </div>
          <section id="lb-panel" role="tabpanel" aria-labelledby={`lb-tab-${board}`} className="lb-panel">
            {board === 'live' && <LiveIntro />}
            {board === 'daily' && <DailyIntro day={day} today={today} onDay={(d) => set({ day: d })} />}
            {board === 'survival' && <SurvivalIntro period={period} onPeriod={(p) => set({ period: p })} />}
            <BoardView key={`${board}:${day}:${period}`} board={board} period={board === 'daily' ? day : board === 'survival' ? (period === 'all' ? 'all' : weekKey(Date.now())) : ''} today={day === today} />
          </section>
        </>
      )}
    </div>
  );
}

function LiveIntro() {
  return (
    <div className="lb-intro">
      <p>
        <strong>Total chips</strong>: what is in your bank plus what you have on live tables right now, each chip counted once. Buying in or standing up only moves chips, so it
        never changes your total; winning and losing hands does.
      </p>
      <p className="note">
        Everyone can claim 50–200 free chips a day, so regular players build up more. There is no real money, and no way to buy chips.
      </p>
    </div>
  );
}

function DailyIntro({ day, today, onDay }: { day: string; today: string; onDay: (d: string) => void }) {
  const [days, setDays] = useState<{ day: string; entries: number }[]>([]);
  const [, tick] = useState(0);
  useEffect(() => {
    fetchDailyDays().then(setDays, () => setDays([]));
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const options = [today, ...days.map((d) => d.day).filter((d) => d !== today)];
  if (!options.includes(day)) options.push(day);
  return (
    <div className="lb-intro lb-controls">
      <div>
        <p>
          Ranked by the day’s <strong>points</strong>, scored as in the game: 100 a right answer, up to 50 more for speed, and a combo for answers in a row. One ranked try a
          day for each player.
        </p>
        <p className="note">
          {day === today ? (
            <>
              Today’s challenge ({fmtDate(day)}, UTC). The next one starts at midnight UTC, in <strong>{untilNext()}</strong>.
            </>
          ) : (
            <>Challenge of {fmtDate(day)} (UTC), now closed.</>
          )}
        </p>
      </div>
      <label className="lb-select">
        <span>Challenge</span>
        <select value={day} onChange={(e) => onDay(e.target.value)}>
          {options.map((d) => (
            <option key={d} value={d}>
              {d === today ? `Today, ${fmtDate(d)}` : fmtDate(d)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function SurvivalIntro({ period, onPeriod }: { period: 'all' | 'week'; onPeriod: (p: 'all' | 'week') => void }) {
  return (
    <div className="lb-intro lb-controls">
      <div>
        <p>
          Each player’s <strong>best run</strong>, by points, scored as in the game. A run ends at the third wrong answer; a worse run never replaces a best.
        </p>
        <p className="note">{period === 'week' ? `This week: ${weekLabel(Date.now())}, Monday to Sunday (UTC). Runs finished this week only.` : 'Every ranked run since leaderboards began.'}</p>
      </div>
      <div className="lb-seg" role="group" aria-label="Period">
        <button aria-pressed={period === 'week'} className={period === 'week' ? 'on' : ''} onClick={() => onPeriod('week')}>
          This week
        </button>
        <button aria-pressed={period === 'all'} className={period === 'all' ? 'on' : ''} onClick={() => onPeriod('all')}>
          All time
        </button>
      </div>
    </div>
  );
}

function BoardView({ board, period, today }: { board: Board; period: string; today: boolean }) {
  const { status } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState<'idle' | 'loading' | 'error'>('idle');
  const [standing, setStanding] = useState<Standing | null | undefined>(undefined);
  const [standingError, setStandingError] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchBoard(board, period, 0));
    } catch (e) {
      setError((e as Error).message);
    }
    if (status === 'signed-in') {
      setStandingError(false);
      try {
        setStanding(await fetchStanding(board, period));
      } catch {
        setStandingError(true);
      }
    }
  }, [board, period, status]);
  useEffect(() => {
    void load();
  }, [load]);

  // chips move as hands settle: refresh the chip board while it is on screen
  useEffect(() => {
    if (board !== 'live') return;
    const refresh = () => document.visibilityState === 'visible' && void load();
    const t = setInterval(refresh, LIVE_REFRESH_MS);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', refresh);
    };
  }, [board, load]);

  const loadMore = async () => {
    if (!rows) return;
    setMore('loading');
    try {
      const next = await fetchBoard(board, period, rows.length);
      setRows([...rows, ...next]);
      setMore('idle');
    } catch {
      setMore('error');
    }
  };

  const entries = rows?.[0]?.entries ?? 0;
  return (
    <>
      <YourStanding board={board} today={today} status={status} standing={standing} failed={standingError} onRetry={() => void load()} />
      {error ? (
        <div className="lb-state" role="alert">
          <p>{error}</p>
          <button className="btn small" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : !rows ? (
        <ol className="lb-list" aria-busy="true" aria-label="Loading leaderboard">
          {Array.from({ length: 6 }, (_, k) => (
            <li key={k} className="lb-row lb-skel" aria-hidden="true">
              <span className="lb-rank" />
              <span className="lb-avatar" />
              <span className="lb-who" />
              <span className="lb-score" />
            </li>
          ))}
        </ol>
      ) : rows.length === 0 ? (
        <div className="lb-state">
          <p>{board === 'live' ? 'Nobody with an account has chips yet.' : board === 'daily' ? 'No ranked results for this day yet.' : 'No ranked runs in this period yet.'}</p>
        </div>
      ) : (
        <>
          <div className="lb-colhead" aria-hidden="true">
            <span>Rank</span>
            <span>Player</span>
            <span>{board === 'live' ? 'Chips' : 'Points'}</span>
          </div>
          <ol className="lb-list" aria-label={`${BOARDS.find((b) => b.id === board)!.label} leaderboard, ${entries} ${entries === 1 ? 'player' : 'players'}`}>
            {rows.map((r, k) => (
              <LbRow key={`${r.name}:${k}`} board={board} row={r} />
            ))}
          </ol>
          <div className="lb-foot">
            <span className="note">
              Showing {rows.length} of {entries}. Equal scores share a rank.
            </span>
            {rows.length < entries && (
              <button className="btn small" onClick={() => void loadMore()} disabled={more === 'loading'}>
                {more === 'loading' ? 'Loading…' : more === 'error' ? 'Could not load. Try again' : `Load ${Math.min(PAGE_SIZE, entries - rows.length)} more`}
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}

function detail(board: Board, r: { chips?: { bank: number; atTables: number }; correct?: number; answered?: number; completedAt?: string }): string {
  if (board === 'live') return r.chips && r.chips.atTables > 0 ? `${fmtChips(r.chips.bank)} in the bank · ${fmtChips(r.chips.atTables)} on tables` : 'All in the bank';
  if (board === 'daily') return `${r.correct ?? 0} of 5 right`;
  return `${r.correct ?? 0} right of ${r.answered ?? 0}${r.completedAt ? ` · ${utcDay(r.completedAt)}` : ''}`;
}
const scoreText = (board: Board, score: number) => (board === 'live' ? fmtChips(score) : score.toLocaleString());

function LbRow({ board, row }: { board: Board; row: Row }) {
  const top = row.rank <= 3 ? ` top${row.rank}` : '';
  return (
    <li className={`lb-row${top}${row.is_me ? ' me' : ''}`}>
      <span className="lb-rank" aria-label={`Rank ${row.rank}`}>
        {row.rank}
      </span>
      <span className="lb-avatar" aria-hidden="true" style={{ '--hue': hueOf(row.name) } as React.CSSProperties}>
        {[...row.name][0]?.toUpperCase()}
      </span>
      <span className="lb-who">
        <span className="lb-name">
          {row.name}
          {row.is_me && <span className="lb-you">You</span>}
        </span>
        <span className="lb-detail">{detail(board, row)}</span>
      </span>
      <span className="lb-score">
        {scoreText(board, row.score)}
        <span className="sr-only">{board === 'live' ? ' chips' : ' points'}</span>
      </span>
    </li>
  );
}

function hueOf(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 360;
}

function YourStanding({
  board,
  today,
  status,
  standing,
  failed,
  onRetry,
}: {
  board: Board;
  today: boolean;
  status: string;
  standing: Standing | null | undefined;
  failed: boolean;
  onRetry: () => void;
}) {
  const play =
    board === 'live' ? (
      <Link className="btn primary small" to="/play">
        Play live
      </Link>
    ) : (
      <Link className="btn primary small" to={`/?play=${board}#daily`}>
        {board === 'daily' ? 'Play today’s five' : 'Play survival'}
      </Link>
    );
  let body: React.ReactNode;
  if (status === 'loading') body = <p className="note">Checking your sign-in…</p>;
  else if (status !== 'signed-in')
    body = (
      <>
        <p>
          <strong>Sign in to get on the leaderboards.</strong> Anyone can look; only signed-in players’ results are ranked.
        </p>
        <Link className="btn primary small" to="/login?next=%2Fleaderboards">
          Sign in
        </Link>
      </>
    );
  else if (failed)
    body = (
      <>
        <p>Your place could not be loaded.</p>
        <button className="btn small" onClick={onRetry}>
          Try again
        </button>
      </>
    );
  else if (standing === undefined) body = <p className="note">Finding your place…</p>;
  else if (standing)
    body = (
      <>
        <p className="lb-me-line">
          <span className="lb-me-rank">#{standing.rank}</span>
          <span>
            of {standing.entries} · <strong>{scoreText(board, standing.score)}</strong> {board === 'live' ? 'chips' : 'points'}
            <span className="lb-detail">{detail(board, standing)}</span>
          </span>
        </p>
        {board !== 'daily' && play}
      </>
    );
  else
    body = (
      <>
        <p>
          {board === 'live'
            ? 'You are not on this board yet. Claim your free daily chips and sit down at a live table: your total shows here once you have chips.'
            : board === 'daily'
              ? today
                ? 'You have not played today’s five yet. Finish it to get a rank.'
                : 'You did not play this day’s five.'
              : 'No finished ranked run here yet. Finish a survival run to get on the board.'}
        </p>
        {(board !== 'daily' || today) && play}
      </>
    );
  return (
    <aside className="lb-standing" aria-label="Your standing">
      <h2>Your standing</h2>
      <div className="lb-standing-body">{body}</div>
    </aside>
  );
}
