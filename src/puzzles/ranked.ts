// Ranked puzzle runs for the leaderboards. A signed-in player's daily five or survival run is kept
// on the table server (party/server.ts, the Puzzles object), not in the browser: the server starts
// each question's clock when it is shown, checks each answer against its own copy of the puzzle
// and scores it with the same pointsFor() the game always used. The browser only says which
// option was picked; it never sends a time, a score or a result.
//
// The questions themselves still come from the shared generators (puzzleSet, randomPuzzle), so the
// browser draws them exactly as before. Anyone who runs those generators can work out the answers;
// the server cannot stop that, only make sure a result was played question by question.

import { LIVES, challengeKey, pointsFor, puzzleSet, randomPuzzle, type Puzzle, type PuzzleRun } from './daily';

/**
 * Bumped whenever the questions, the scoring or the lives change, so results from different rules
 * are never ranked together.
 */
export const RULES_VERSION = 1;
export const DAILY_QUESTIONS = 5;
/** A bound on how long a survival run can be kept, so one run cannot grow without end. */
export const SURVIVAL_MAX_QUESTIONS = 1000;

export type RankedMode = 'daily' | 'survival';

export interface Attempt {
  id: string;
  mode: RankedMode;
  rules: number;
  /** daily: the challenge date (UTC), e.g. 2026-11-01; survival: the date it started (UTC) */
  day: string;
  /** survival: the server's random seed for the questions (daily questions come from the date) */
  seed: string;
  startedAt: number;
  /** server time each question was first shown; its clock runs from then */
  servedAt: (number | null)[];
  picks: number[];
  ms: number[];
  points: number[];
  /** survival only */
  lives?: number;
  status: 'active' | 'done';
  completedAt?: number;
}

export interface AnswerOutcome {
  index: number;
  pick: number;
  correct: boolean;
  answer: number;
  points: number;
  ms: number;
}

export const isRankedMode = (m: unknown): m is RankedMode => m === 'daily' || m === 'survival';

export function newAttempt(mode: RankedMode, id: string, seed: string, now: number): Attempt {
  return {
    id,
    mode,
    rules: RULES_VERSION,
    day: challengeKey(now),
    seed: mode === 'daily' ? '' : seed,
    startedAt: now,
    servedAt: [],
    picks: [],
    ms: [],
    points: [],
    lives: mode === 'survival' ? LIVES : undefined,
    status: 'active',
  };
}

/** Question k of a run, drawn exactly as the unranked game draws it. */
export function puzzleOf(a: Pick<Attempt, 'mode' | 'day' | 'seed'>, k: number): Puzzle {
  return a.mode === 'daily' ? puzzleSet(a.day)[k] : randomPuzzle(a.seed, k);
}

/** The question waiting for an answer (also the number answered so far). */
export const currentIndex = (a: Attempt) => a.picks.length;

/** A daily attempt counts only on its own challenge day; after midnight UTC an unfinished one has lapsed. */
export function lapsed(a: Attempt, now: number): boolean {
  return a.mode === 'daily' && a.status === 'active' && a.day !== challengeKey(now);
}

/**
 * Start the clock on question `index` (it must be the next one to answer). Showing it again (a
 * reload, a second tab) keeps the first time: reloading never resets the clock.
 */
export function serve(a: Attempt, index: unknown, now: number): Attempt | { error: string } {
  if (a.status !== 'active') return { error: 'This run is over.' };
  if (lapsed(a, now)) return { error: 'This daily five has ended. A new one is up.' };
  if (index !== currentIndex(a)) return { error: 'That question is not the next one.' };
  if (a.servedAt[index] != null) return a;
  const servedAt = [...a.servedAt];
  servedAt[index] = now;
  return { ...a, servedAt };
}

/**
 * Answer question `index`. Answering a question already answered (a retry, a double click, two
 * tabs) changes nothing and returns the first answer's outcome.
 */
export function answer(a: Attempt, index: unknown, pick: unknown, now: number): { attempt: Attempt; outcome: AnswerOutcome } | { error: string } {
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return { error: 'Bad question.' };
  if (index < currentIndex(a)) return { attempt: a, outcome: outcomeOf(a, index) };
  if (a.status !== 'active') return { error: 'This run is over.' };
  if (lapsed(a, now)) return { error: 'This daily five has ended. A new one is up.' };
  if (index !== currentIndex(a)) return { error: 'That question is not the next one.' };
  const shown = a.servedAt[index];
  if (shown == null) return { error: 'That question has not been shown yet.' };
  const p = puzzleOf(a, index);
  if (typeof pick !== 'number' || !Number.isInteger(pick) || pick < 0 || pick >= p.options.length) return { error: 'Pick one of the options.' };
  const correct = pick === p.answer;
  const ms = Math.max(0, now - shown);
  // answers in a row before this one, as the game has always counted its combo
  let combo = 0;
  for (let k = index - 1; k >= 0 && a.picks[k] === puzzleOf(a, k).answer; k--) combo++;
  const pts = pointsFor(correct, ms, correct ? combo + 1 : 0);
  const lives = a.lives !== undefined && !correct ? a.lives - 1 : a.lives;
  const answered = index + 1;
  const over = a.mode === 'daily' ? answered >= DAILY_QUESTIONS : (lives ?? 0) <= 0 || answered >= SURVIVAL_MAX_QUESTIONS;
  const attempt: Attempt = {
    ...a,
    picks: [...a.picks, pick],
    ms: [...a.ms, ms],
    points: [...a.points, pts],
    lives,
    status: over ? 'done' : 'active',
    ...(over ? { completedAt: now } : {}),
  };
  return { attempt, outcome: outcomeOf(attempt, index) };
}

export function outcomeOf(a: Attempt, index: number): AnswerOutcome {
  const p = puzzleOf(a, index);
  return { index, pick: a.picks[index], correct: a.picks[index] === p.answer, answer: p.answer, points: a.points[index], ms: a.ms[index] };
}

export interface RankedResult {
  points: number;
  correct: number;
  /** questions answered */
  total: number;
  ms: number;
  marks: string;
}

export function resultOf(a: Attempt): RankedResult {
  const marks = a.picks.map((p, k) => (p === puzzleOf(a, k).answer ? 'o' : 'x')).join('');
  return {
    points: a.points.reduce((s, x) => s + x, 0),
    correct: [...marks].filter((m) => m === 'o').length,
    total: a.picks.length,
    ms: a.ms.reduce((s, x) => s + x, 0),
    marks,
  };
}

/** The finished run in the shape the personal history (and account sync) already keeps. */
export function personalRun(a: Attempt): PuzzleRun {
  const r = resultOf(a);
  return {
    id: a.mode === 'daily' ? `daily:${a.day}` : `survival:${a.id}`,
    mode: a.mode,
    date: a.day,
    points: r.points,
    correct: r.correct,
    total: r.total,
    ms: r.ms,
    at: a.completedAt ?? a.startedAt,
    marks: r.marks,
  };
}

/**
 * The week a survival run counts for: ISO weeks, Monday 00:00 to Sunday 24:00 UTC, written like
 * 2026-W44. The database works out the same key (to_char(..., 'IYYY-"W"IW')); a test checks they agree.
 */
export function weekKey(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  const thursday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3);
  const year = new Date(thursday).getUTCFullYear();
  // the week's Thursday decides its year, and its day of that year its number
  const week = 1 + Math.floor((thursday - Date.UTC(year, 0, 1)) / 604_800_000);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Monday 00:00 UTC of the week containing `ms`, and the next Monday. */
export function weekBounds(ms: number): { start: number; end: number } {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  return { start, end: start + 604_800_000 };
}

/** What a save to the leaderboard returned, as the browser is told it. */
export type SaveState =
  | { state: 'saving' }
  | { state: 'saved'; rank: number | null; entries: number; best?: number; previousBest?: number | null; newBest?: boolean; weekRank?: number | null }
  | { state: 'failed'; message: string };
