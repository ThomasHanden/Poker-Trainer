// The leaderboard migration in Postgres (PGlite), with the same small Supabase stand-in as
// accounts-db.test.ts: who may write (only the table server's service_role), who may read
// (anyone, through lb_*), and the ranking rules.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { accountPlayerId } from '../src/multiplayer/accounts';
import { weekKey } from '../src/puzzles/ranked';

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

const user = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [ANN, BOB, CAT, DAN, EVE] = [1, 2, 3, 4, 5].map(user);
const NAMES: Record<string, string> = { [ANN]: 'Ann', [BOB]: 'Bob', [CAT]: 'Cat', [DAN]: 'Dan', [EVE]: 'Eve' };

let db: PGlite;

async function as<T>(role: 'anon' | 'authenticated' | 'service_role', who: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who ?? '']);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
const server = <T,>(fn: () => Promise<T>) => as('service_role', null, fn);
const reader = <T,>(who: string | null, fn: () => Promise<T>) => as(who ? 'authenticated' : 'anon', who, fn);
const rows = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const one = async <T,>(sql: string, params: unknown[] = []) => (await rows<T>(sql, params))[0];
const fails = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

const daily = (u: string, attempt: string, day: string, points: number, correct: number, version = 1) =>
  one<{ r: Record<string, unknown> }>(`select public.lb_record_daily($1, $2, $3::date, $4, $5, $6, 5, 40000, now()) as r`, [u, attempt, day, version, points, correct]).then((x) => x.r);
const survival = (u: string, run: string, points: number, correct: number, at: string, version = 1) =>
  one<{ r: Record<string, unknown> }>(`select public.lb_record_survival($1, $2, $3, $4, $5, $6, 60000, $7::timestamptz) as r`, [u, run, version, points, correct, correct + 3, at]).then((x) => x.r);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of readdirSync('supabase/migrations').sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  for (const [id, name] of Object.entries(NAMES)) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${name.toLowerCase()}@example.com`, { display_name: name }]);
  }
});

describe('who may write', () => {
  it('only the table server can record results or chips; signed-in users and visitors cannot', async () => {
    for (const who of [ANN, null]) {
      await reader(who, async () => {
        expect(await fails(db.query(`select public.lb_record_daily($1, 'attempt-0001', '2026-11-01', 1, 1500, 5, 5, 1, now())`, [ANN]))).toMatch(/permission denied/);
        expect(await fails(db.query(`select public.lb_record_survival($1, 'run-000001', 1, 9000, 30, 33, 1, now())`, [ANN]))).toMatch(/permission denied/);
        expect(await fails(db.query(`select public.lb_sync_chips('[]')`))).toMatch(/permission denied/);
        expect(await fails(db.query(`insert into public.daily_results values ($1, '2026-11-01', 1, 'attempt-0001', 1500, 5, 5, 1, now())`, [ANN]))).toMatch(/permission denied/);
        expect(await fails(db.query(`select * from public.chip_standings`))).toMatch(/permission denied/);
        expect(await fails(db.query(`select * from public.survival_runs`))).toMatch(/permission denied/);
      });
    }
  });

  it('refuses scores the game cannot produce', async () => {
    await server(async () => {
      // 300 a question at most, nothing for a wrong answer
      expect(await fails(daily(ANN, 'attempt-bad1', '2026-10-01', 1501, 5))).toMatch(/check constraint/);
      expect(await fails(daily(ANN, 'attempt-bad2', '2026-10-01', 400, 1))).toMatch(/check constraint/);
      expect(await fails(daily(ANN, 'attempt-bad3', '2026-10-01', 100, 6))).toMatch(/check constraint/);
      expect(await fails(survival(ANN, 'run-bad-0001', 1000, 3, '2026-10-01T10:00Z'))).toMatch(/check constraint/);
    });
  });
});

describe('daily five', () => {
  it('ranks by points, equal points share a rank, and the next rank skips', async () => {
    await server(async () => {
      expect(await daily(ANN, 'attempt-ann1', '2026-11-01', 900, 5)).toMatchObject({ saved: true, rank: 1, entries: 1 });
      await daily(BOB, 'attempt-bob1', '2026-11-01', 700, 4);
      await daily(CAT, 'attempt-cat1', '2026-11-01', 700, 4);
      expect(await daily(DAN, 'attempt-dan1', '2026-11-01', 300, 2)).toMatchObject({ saved: true, rank: 4, entries: 4 });
      await daily(EVE, 'attempt-eve1', '2026-10-31', 1200, 5);
    });
    const board = await reader(null, () => rows(`select rank, name, points, correct, answered, is_me, entries from public.lb_daily('2026-11-01', 1)`));
    expect(board).toEqual([
      { rank: 1, name: 'Ann', points: 900, correct: 5, answered: 5, is_me: null, entries: 4 },
      { rank: 2, name: expect.any(String), points: 700, correct: 4, answered: 5, is_me: null, entries: 4 },
      { rank: 2, name: expect.any(String), points: 700, correct: 4, answered: 5, is_me: null, entries: 4 },
      { rank: 4, name: 'Dan', points: 300, correct: 2, answered: 5, is_me: null, entries: 4 },
    ]);
    // the order among tied players stays the same from one read to the next
    const again = await reader(null, () => rows<{ name: string }>(`select name from public.lb_daily('2026-11-01', 1)`));
    expect(again.map((r) => r.name)).toEqual(board.map((r) => (r as { name: string }).name));
    // nothing private: names and results only
    expect(JSON.stringify(board)).not.toMatch(/@example|0000-4000/);
  });

  it('keeps the first result: a retry returns it, and a second attempt the same day changes nothing', async () => {
    await server(async () => {
      expect(await daily(DAN, 'attempt-dan1', '2026-11-01', 300, 2)).toMatchObject({ saved: true, points: 300, rank: 4 });
      expect(await daily(DAN, 'attempt-dan2', '2026-11-01', 1500, 5)).toEqual({ saved: false, reason: 'another-result' });
    });
    expect(await one(`select points from public.daily_results where user_id = $1 and challenge_date = '2026-11-01'`, [DAN])).toEqual({ points: 300 });
  });

  it('pages through the list and finds your own place beyond the first page', async () => {
    const page2 = await reader(DAN, () => rows(`select rank, name, is_me from public.lb_daily('2026-11-01', 1, 2, 2)`));
    expect(page2).toEqual([
      { rank: 2, name: expect.any(String), is_me: false },
      { rank: 4, name: 'Dan', is_me: true },
    ]);
    expect(await reader(DAN, () => one(`select public.lb_standing('daily', '2026-11-01', 1) as s`))).toEqual({ s: { rank: 4, entries: 4, points: 300, correct: 2, answered: 5 } });
    // a day you did not play, and a visitor, have no place
    expect(await reader(DAN, () => one(`select public.lb_standing('daily', '2026-10-31', 1) as s`))).toEqual({ s: null });
    expect(await reader(null, () => one(`select public.lb_standing('daily', '2026-11-01', 1) as s`))).toEqual({ s: null });
  });

  it('lists past challenge days, and keeps different rules versions apart', async () => {
    expect(await reader(null, () => rows(`select day::text, entries from public.lb_daily_days(1)`))).toEqual([
      { day: '2026-11-01', entries: 4 },
      { day: '2026-10-31', entries: 1 },
    ]);
    await server(() => daily(ANN, 'attempt-ann-v2', '2026-11-01', 100, 1, 2));
    expect(await reader(null, () => rows(`select name, points from public.lb_daily('2026-11-01', 2)`))).toEqual([{ name: 'Ann', points: 100 }]);
    expect(await reader(null, () => rows(`select count(*) as n from public.lb_daily('2026-11-01', 1)`))).toEqual([{ n: 4 }]);
  });
});

describe('survival', () => {
  it('keeps every run, and a worse or equal later run never replaces a best', async () => {
    await server(async () => {
      expect(await survival(ANN, 'run-ann-0001', 1200, 10, '2026-10-27T10:00Z')).toMatchObject({ saved: true, best: 1200, previous_best: null, new_best: true, rank: 1 });
      expect(await survival(ANN, 'run-ann-0002', 800, 7, '2026-10-28T10:00Z')).toMatchObject({ best: 1200, previous_best: 1200, new_best: false });
      expect(await survival(ANN, 'run-ann-0003', 1200, 10, '2026-10-29T10:00Z')).toMatchObject({ best: 1200, new_best: false });
      expect(await survival(ANN, 'run-ann-0004', 1500, 12, '2026-10-30T10:00Z')).toMatchObject({ best: 1500, previous_best: 1200, new_best: true });
      // a retry of a run already saved gives the same answer and adds nothing
      expect(await survival(ANN, 'run-ann-0004', 1500, 12, '2026-10-30T10:00Z')).toMatchObject({ best: 1500, previous_best: 1200, new_best: true });
    });
    expect(await one(`select count(*) as n from public.survival_runs where user_id = $1`, [ANN])).toEqual({ n: 4 });
    expect(await one(`select run_id, points from public.survival_bests where user_id = $1 and period = 'all'`, [ANN])).toEqual({ run_id: 'run-ann-0004', points: 1500 });
  });

  it('weeks run Monday 00:00 to Sunday 24:00 UTC, and a week ranks only runs finished in it', async () => {
    await server(async () => {
      // Sunday 1 November 23:59 UTC is still week 44; Monday 00:00 is week 45
      expect(await survival(BOB, 'run-bob-0001', 2000, 15, '2026-11-01T23:59:59Z')).toMatchObject({ week: '2026-W44', rank: 1 });
      expect(await survival(CAT, 'run-cat-0001', 600, 5, '2026-11-02T00:00:00Z')).toMatchObject({ week: '2026-W45', week_rank: 1 });
      expect(await survival(ANN, 'run-ann-0005', 300, 3, '2026-11-02T08:00:00Z')).toMatchObject({ week: '2026-W45', week_rank: 2, best: 1500, new_best: false });
    });
    expect(await reader(null, () => rows(`select rank, name, points from public.lb_survival('2026-W44', 1)`))).toEqual([
      { rank: 1, name: 'Bob', points: 2000 },
      { rank: 2, name: 'Ann', points: 1500 },
    ]);
    expect(await reader(null, () => rows(`select rank, name, points from public.lb_survival('2026-W45', 1)`))).toEqual([
      { rank: 1, name: 'Cat', points: 600 },
      { rank: 2, name: 'Ann', points: 300 },
    ]);
    expect(await reader(null, () => rows(`select rank, name, points from public.lb_survival('all', 1)`))).toEqual([
      { rank: 1, name: 'Bob', points: 2000 },
      { rank: 2, name: 'Ann', points: 1500 },
      { rank: 3, name: 'Cat', points: 600 },
    ]);
    expect(await reader(CAT, () => one(`select public.lb_standing('survival', 'all', 1) as s`))).toMatchObject({ s: { rank: 3, entries: 3, points: 600 } });
  });

  it('works out weeks the same way as the server code', async () => {
    for (const at of ['2026-11-01T23:59:59Z', '2026-11-02T00:00:00Z', '2027-01-01T12:00:00Z', '2026-12-31T23:00:00Z', '2027-01-04T00:00:00Z', '2020-12-31T00:00:00Z', '2021-01-03T23:00:00Z']) {
      const { w } = await one<{ w: string }>(`select public.survival_week($1::timestamptz) as w`, [at]);
      expect(w).toBe(weekKey(Date.parse(at)));
    }
  });
});

describe('live chips', () => {
  it('matches bank players to accounts the same way as the table server, and skips guests', async () => {
    const { id } = await one<{ id: string }>(`select public.account_player_id($1) as id`, [ANN]);
    expect(id).toBe(await accountPlayerId(ANN));
    const row = async (u: string, bank: number, atTables: number, version: number) => ({ player_id: await accountPlayerId(u), bank, at_tables: atTables, version });
    const written = await server(async () =>
      one<{ n: number }>(`select public.lb_sync_chips($1) as n`, [
        JSON.stringify([await row(ANN, 4000, 0, 3), await row(BOB, 1000, 3000, 5), await row(CAT, 900, 0, 1), await row(DAN, 0, 0, 1), { player_id: 'ab12cd34ef56ab12cd34ef56', bank: 99999, at_tables: 0, version: 1 }]),
      ]),
    );
    expect(written).toEqual({ n: 4 });
    expect(await reader(null, () => rows(`select rank, name, chips, bank, at_tables from public.lb_chips()`))).toEqual([
      { rank: 1, name: expect.any(String), chips: 4000, bank: expect.any(Number), at_tables: expect.any(Number) },
      { rank: 1, name: expect.any(String), chips: 4000, bank: expect.any(Number), at_tables: expect.any(Number) },
      { rank: 3, name: 'Cat', chips: 900, bank: 900, at_tables: 0 },
    ]);
  });

  it('never takes an older or repeated copy over a newer one', async () => {
    const pid = await accountPlayerId(BOB);
    const sync = (bank: number, version: number) => server(() => one<{ n: number }>(`select public.lb_sync_chips($1) as n`, [JSON.stringify([{ player_id: pid, bank, at_tables: 0, version }])]));
    expect(await sync(50, 4)).toEqual({ n: 0 });
    expect(await sync(50, 5)).toEqual({ n: 0 });
    expect(await sync(6000, 6)).toEqual({ n: 1 });
    expect(await one(`select chips from public.chip_standings where user_id = $1`, [BOB])).toEqual({ chips: 6000 });
    expect(await reader(CAT, () => one(`select public.lb_standing('chips') as s`))).toEqual({ s: { rank: 3, entries: 3, chips: 900, bank: 900, at_tables: 0 } });
    // no chips, no place
    expect(await reader(DAN, () => one(`select public.lb_standing('chips') as s`))).toEqual({ s: null });
  });
});

describe('deleting an account', () => {
  it('takes it off every leaderboard', async () => {
    await db.query(`delete from auth.users where id = $1`, [BOB]);
    for (const t of ['chip_standings', 'daily_results', 'survival_runs', 'survival_bests']) {
      expect(await one(`select count(*) as n from public.${t} where user_id = $1`, [BOB])).toEqual({ n: 0 });
    }
    expect(await reader(null, () => rows(`select name from public.lb_survival('2026-W44', 1)`))).toEqual([{ name: 'Ann' }]);
  });
});
