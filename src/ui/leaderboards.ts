// The browser's side of the leaderboards. Reading is open to everyone and goes straight to the
// database's read-only lb_* functions (supabase/migrations/…_leaderboards.sql). Ranked puzzle runs
// are played through the table server (POST /puzzles), which keeps the run and saves the result;
// this page never sends a score.

import { supabase } from '../auth/supabase';
import { PARTY_HOST, accountToken } from './useLiveTable';
import { RULES_VERSION, type AnswerOutcome, type Attempt, type RankedMode, type SaveState } from '../puzzles/ranked';

export const PAGE_SIZE = 25;
export type Board = 'live' | 'daily' | 'survival';

export interface Row {
  rank: number;
  name: string;
  is_me: boolean;
  entries: number;
  /** what is ranked: chips (table units), or points */
  score: number;
  chips?: { bank: number; atTables: number };
  correct?: number;
  answered?: number;
  completedAt?: string;
}

export interface Standing {
  rank: number;
  entries: number;
  score: number;
  correct?: number;
  answered?: number;
  completedAt?: string;
  chips?: { bank: number; atTables: number };
}

/** Leaderboards need the database; without accounts set up there is nothing to show. */
export const leaderboardsAvailable = () => !!supabase;

const num = (x: unknown) => Number(x ?? 0);

/** One page of a board. period: the date (daily) or 'all' / a week such as 2026-W44 (survival). */
export async function fetchBoard(board: Board, period: string, offset: number): Promise<Row[]> {
  if (!supabase) throw new Error('Leaderboards are not set up on this site.');
  const lim = PAGE_SIZE;
  const { data, error } =
    board === 'live'
      ? await supabase.rpc('lb_chips', { lim, off: offset })
      : board === 'daily'
        ? await supabase.rpc('lb_daily', { day: period, version: RULES_VERSION, lim, off: offset })
        : await supabase.rpc('lb_survival', { period, version: RULES_VERSION, lim, off: offset });
  if (error) throw new Error('The leaderboard could not be loaded.');
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    rank: num(r.rank),
    name: String(r.name ?? ''),
    is_me: r.is_me === true,
    entries: num(r.entries),
    score: num(board === 'live' ? r.chips : r.points),
    ...(board === 'live' ? { chips: { bank: num(r.bank), atTables: num(r.at_tables) } } : { correct: num(r.correct), answered: num(r.answered) }),
    ...(typeof r.completed_at === 'string' ? { completedAt: r.completed_at } : {}),
  }));
}

/** Your own place on a board (null: not on it, or signed out). */
export async function fetchStanding(board: Board, period: string): Promise<Standing | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('lb_standing', { board: board === 'live' ? 'chips' : board, period: board === 'live' ? null : period, version: RULES_VERSION });
  if (error) throw new Error('Your place could not be loaded.');
  if (!data) return null;
  const s = data as Record<string, unknown>;
  return {
    rank: num(s.rank),
    entries: num(s.entries),
    score: num(board === 'live' ? s.chips : s.points),
    ...(board === 'live' ? { chips: { bank: num(s.bank), atTables: num(s.at_tables) } } : { correct: num(s.correct), answered: num(s.answered) }),
    ...(typeof s.completed_at === 'string' ? { completedAt: s.completed_at } : {}),
  };
}

/** Challenge dates that have daily results, newest first. */
export async function fetchDailyDays(): Promise<{ day: string; entries: number }[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('lb_daily_days', { version: RULES_VERSION, lim: 60 });
  if (error) throw new Error('Past days could not be loaded.');
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ day: String(r.day), entries: num(r.entries) }));
}

// ---------------- ranked runs, through the table server ----------------

/** Ranked play needs an account and the table server. */
export const rankedAvailable = (signedIn: boolean) => signedIn && !!PARTY_HOST && !!supabase;

export interface RankedView {
  attempt: Attempt | null;
  save: SaveState | null;
  lapsed: boolean;
  /** server time when it answered, to line the question clock up with it */
  now: number;
  outcome?: AnswerOutcome;
  error?: string;
}

export class RankedError extends Error {
  constructor(
    message: string,
    /** what the server holds, when it could say (a refused answer still shows the current run) */
    readonly view: RankedView | null,
    /** the request never got an answer: trying again may work */
    readonly network: boolean,
  ) {
    super(message);
  }
}

const local = () => /^(localhost|127\.0\.0\.1)[:/]/.test(PARTY_HOST ?? '');

export async function rankedCall(action: 'state' | 'start' | 'serve' | 'answer' | 'save', mode: RankedMode, extra: { id?: string; index?: number; pick?: number } = {}): Promise<RankedView> {
  const token = await accountToken();
  if (!token) throw new RankedError('Your sign-in has expired. Sign in again to play ranked.', null, false);
  let r: Response;
  try {
    r = await fetch(`${local() ? 'http' : 'https'}://${PARTY_HOST}/puzzles`, {
      method: 'POST',
      // plain text, like the bank's requests, so the browser sends it without a preflight
      body: JSON.stringify({ token, action, mode, ...extra }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new RankedError('Could not reach the leaderboard server. Check your connection.', null, true);
  }
  let body: RankedView & { error?: string };
  try {
    body = await r.json();
  } catch {
    throw new RankedError('The leaderboard server sent something unexpected.', null, true);
  }
  if (!r.ok) throw new RankedError(body.error ?? 'Something went wrong.', 'attempt' in body ? body : null, r.status >= 500);
  return body;
}
