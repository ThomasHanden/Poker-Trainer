// The account's saved progress in Supabase, for the sync (persistence/accountSync.ts). Every query
// runs as the signed-in user, and the database's row-level security limits it to their own rows.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountDoc, AccountStore, RemoteHand } from '../persistence/accountSync';
import { MAX_HISTORY, type HandRecord } from '../persistence/storage';
import type { PuzzleRun } from '../puzzles/daily';

const PAGE = 1000; // Supabase returns at most this many rows per request
const RUNS = 400;

export function supabaseAccountStore(sb: SupabaseClient): AccountStore {
  const call = async <T,>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw error;
    return data as T;
  };
  return {
    async fetch() {
      const doc = await sb.from('progress').select('data, revision').maybeSingle();
      if (doc.error) throw doc.error;
      // the newest hands, the same number this browser keeps
      const hands: RemoteHand[] = [];
      for (let from = 0; from < MAX_HISTORY; from += PAGE) {
        const r = await sb
          .from('practice_hands')
          .select('record, updated_at')
          .order('created_at', { ascending: false })
          .range(from, Math.min(from + PAGE, MAX_HISTORY) - 1);
        if (r.error) throw r.error;
        hands.push(...r.data.map((x) => ({ record: x.record as HandRecord, updatedAt: Date.parse(x.updated_at as string) })));
        if (r.data.length < PAGE) break;
      }
      const runs = await sb.from('puzzle_runs').select('run').order('created_at', { ascending: false }).range(0, RUNS - 1);
      if (runs.error) throw runs.error;
      return {
        revision: Number(doc.data?.revision ?? 0),
        doc: (doc.data?.data ?? {}) as AccountDoc,
        hands,
        runs: runs.data.map((x) => x.run as PuzzleRun),
      };
    },
    async saveDoc(expected, doc) {
      const r = await call<{ saved: boolean; revision: number; data?: AccountDoc }>('save_progress', { expected_revision: expected, new_data: doc });
      return r.saved ? { saved: true as const, revision: Number(r.revision) } : { saved: false as const, revision: Number(r.revision), doc: r.data ?? {} };
    },
    async saveHands(hands) {
      await call('save_hands', { hands });
    },
    async saveRuns(runs) {
      await call('save_puzzle_runs', { runs });
    },
    async reset() {
      await call('reset_practice_progress', {});
    },
  };
}
