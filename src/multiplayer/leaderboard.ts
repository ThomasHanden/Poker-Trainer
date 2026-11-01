// The table server's side of the leaderboards: it sends ranked puzzle results and chip totals to
// the database (supabase/migrations/…_leaderboards.sql). Only the server can, with the project's
// secret key (a Cloudflare secret, never in the site's code); browsers only read.

import { RULES_VERSION, resultOf, type Attempt, type SaveState } from '../puzzles/ranked';

export interface LeaderboardConfig {
  supabaseUrl: string;
  /** the project's secret key (sb_secret_…). Empty: leaderboards are not saved. */
  secretKey: string;
}

export const leaderboardsOn = (cfg: LeaderboardConfig) => !!(cfg.supabaseUrl && cfg.secretKey);

async function rpc<T>(cfg: LeaderboardConfig, fn: string, args: object, f: typeof fetch): Promise<T> {
  const r = await f(`${cfg.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: cfg.secretKey, Authorization: `Bearer ${cfg.secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

type Saved = {
  saved: boolean;
  reason?: string;
  rank?: number;
  entries?: number;
  best?: number;
  previous_best?: number | null;
  new_best?: boolean;
  week_rank?: number;
};

/**
 * Save a finished run to its leaderboard. Saving the same run again returns the same answer, so
 * this can be retried freely. Throws when the database cannot be reached (the caller retries later).
 */
export async function saveAttempt(cfg: LeaderboardConfig, userId: string, a: Attempt, f: typeof fetch = fetch): Promise<SaveState> {
  if (a.status !== 'done' || a.rules !== RULES_VERSION) return { state: 'failed', message: 'This run cannot be ranked.' };
  const r = resultOf(a);
  const completed = new Date(a.completedAt ?? Date.now()).toISOString();
  const out =
    a.mode === 'daily'
      ? await rpc<Saved>(cfg, 'lb_record_daily', {
          p_user: userId, p_attempt: a.id, p_day: a.day, p_version: a.rules,
          p_points: r.points, p_correct: r.correct, p_answered: r.total, p_ms: r.ms, p_completed: completed,
        }, f)
      : await rpc<Saved>(cfg, 'lb_record_survival', {
          p_user: userId, p_run: a.id, p_version: a.rules,
          p_points: r.points, p_correct: r.correct, p_answered: r.total, p_ms: r.ms, p_completed: completed,
        }, f);
  if (!out.saved) return { state: 'failed', message: out.reason === 'another-result' ? 'You already have a ranked result for this daily five.' : 'This run could not be ranked.' };
  return {
    state: 'saved',
    rank: out.rank ?? null,
    entries: out.entries ?? 0,
    ...(a.mode === 'survival' ? { best: out.best, previousBest: out.previous_best ?? null, newBest: !!out.new_best, weekRank: out.week_rank ?? null } : {}),
  };
}

export interface ChipRow {
  player_id: string;
  bank: number;
  at_tables: number;
  version: number;
}

/** Send chip totals (accounts only; the database skips anyone without one). Throws on failure. */
export async function syncChips(cfg: LeaderboardConfig, rows: ChipRow[], f: typeof fetch = fetch): Promise<void> {
  for (let k = 0; k < rows.length; k += 500) await rpc(cfg, 'lb_sync_chips', { rows: rows.slice(k, k + 500) }, f);
}
