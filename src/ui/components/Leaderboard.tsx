// The leaderboards, shown where they are played: the chip board on the Play live page, and the
// daily five and survival board beside the mini games on the home page. Anyone can look;
// signed-in players see where they stand, even beyond the first page. Lists load a page at a time
// from the database, which works out every rank (src/ui/leaderboards.ts).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { fmtChips } from '../../multiplayer/table';
import { challengeKey } from '../../puzzles/daily';
import { weekBounds, weekKey } from '../../puzzles/ranked';
import { PAGE_SIZE, fetchBoard, fetchDailyDays, fetchStanding, leaderboardsAvailable, type Board, type Row, type Standing } from '../leaderboards';
import { fmtDate, untilNext } from './PuzzleGame';

const LABEL: Record<Board, string> = { live: 'Chip', daily: 'Daily five', survival: 'Survival' };
/** How often the chip board refreshes while it is open: balances move as hands settle. */
const LIVE_REFRESH_MS = 30_000;

const utcDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const weekLabel = (now: number) => {
  const { start, end } = weekBounds(now);
  return `${utcDay(new Date(start).toISOString())} – ${utcDay(new Date(end - 1).toISOString())}`;
};

/** The chip leaderboard, for the Play live page. */
export function ChipLeaderboard() {
  if (!leaderboardsAvailable()) return null;
  return (
    <section className="live-card lb-card" id="chip-leaderboard" aria-labelledby="chip-lb-title">
      <h2 id="chip-lb-title">Chip leaderboard</h2>
      <p className="note">
        <strong>Total chips</strong>: your bank plus what you have on tables right now, each chip counted once. Buying in or standing up only moves chips; winning
        and losing hands changes the total. Everyone can claim free chips daily, so regular players build up more.
      </p>
      <BoardView board="live" period="" today />
    </section>
  );
}

/** The daily five or survival leaderboard (following the game picked beside it), for the home page. */
export function PuzzleLeaderboard({ mode, refresh }: { mode: 'daily' | 'survival'; refresh: number }) {
  const today = challengeKey();
  const [day, setDay] = useState(today);
  const [period, setPeriod] = useState<'all' | 'week'>('all');
  const [days, setDays] = useState<{ day: string; entries: number }[]>([]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (mode !== 'daily' || !leaderboardsAvailable()) return;
    fetchDailyDays().then(setDays, () => setDays([]));
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [mode, refresh]);
  if (!leaderboardsAvailable()) return null;
  const options = [today, ...days.map((d) => d.day).filter((d) => d !== today)];
  return (
    <section className="lb-card lb-side" id="leaderboard" aria-labelledby="pz-lb-title">
      <h2 id="pz-lb-title">{mode === 'daily' ? 'Daily five leaderboard' : 'Survival leaderboard'}</h2>
      {mode === 'daily' ? (
        <div className="lb-controls">
          <p className="note">
            {day === today ? (
              <>
                Today’s points. New five in <strong>{untilNext()}</strong> (midnight UTC).
              </>
            ) : (
              <>Points on {fmtDate(day)} (UTC).</>
            )}
          </p>
          {options.length > 1 && (
            <label className="lb-select">
              <span className="sr-only">Challenge day</span>
              <select value={day} onChange={(e) => setDay(e.target.value)}>
                {options.map((d) => (
                  <option key={d} value={d}>
                    {d === today ? 'Today' : fmtDate(d)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      ) : (
        <div className="lb-controls">
          <p className="note">{period === 'week' ? `Best run finished ${weekLabel(Date.now())} (Mon–Sun, UTC).` : 'Each player’s best run.'}</p>
          <div className="lb-seg" role="group" aria-label="Period">
            <button aria-pressed={period === 'all'} className={period === 'all' ? 'on' : ''} onClick={() => setPeriod('all')}>
              All time
            </button>
            <button aria-pressed={period === 'week'} className={period === 'week' ? 'on' : ''} onClick={() => setPeriod('week')}>
              This week
            </button>
          </div>
        </div>
      )}
      <BoardView
        key={`${mode}:${day}:${period}`}
        board={mode}
        period={mode === 'daily' ? day : period === 'all' ? 'all' : weekKey(Date.now())}
        today={day === today}
        refresh={refresh}
      />
    </section>
  );
}

function BoardView({ board, period, today, refresh = 0 }: { board: Board; period: string; today: boolean; refresh?: number }) {
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
  }, [load, refresh]);

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
          <ol className="lb-list" aria-label={`${LABEL[board]} leaderboard, ${entries} ${entries === 1 ? 'player' : 'players'}`}>
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
  let body: React.ReactNode;
  if (status === 'loading') body = <p className="note">Checking your sign-in…</p>;
  else if (status !== 'signed-in')
    body = (
      <>
        <p>
          <strong>Sign in to get on the leaderboards.</strong> Anyone can look; only signed-in players’ results are ranked.
        </p>
        <Link className="btn primary small" to={`/login?next=${encodeURIComponent(board === 'live' ? '/play' : '/')}`}>
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
      </>
    );
  else
    body = (
      <>
        <p>
          {board === 'live'
            ? 'You are not on this board yet. Claim your free daily chips above and sit down at a table: your total shows here once you have chips.'
            : board === 'daily'
              ? today
                ? 'You have not played today’s five yet. Finish it to get a rank.'
                : 'You did not play this day’s five.'
              : 'No finished ranked run here yet. Finish a survival run to get on the board.'}
        </p>
      </>
    );
  return (
    <div className="lb-standing" role="group" aria-label="Your standing">
      <h3>Your standing</h3>
      <div className="lb-standing-body">{body}</div>
    </div>
  );
}
