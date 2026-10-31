// Runs the real migration (supabase/migrations) in Postgres (PGlite) with the small part of
// Supabase it relies on: auth.users, auth.uid() and the anon / authenticated roles. Each check
// runs as a signed-in user (or a visitor), so row-level security applies exactly as in Supabase.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const ANN = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  -- like Supabase: new tables and functions in public start out open to both roles
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

let db: PGlite;

/** Run queries as a signed-in user (or, with null, a signed-out visitor). */
async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? '']);
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
const rows = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const fails = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};
const hand = (id: string, createdAt = 1_700_000_000_000, extra: object = {}) => ({ id, scenarioId: 's', heroActions: [], decisions: [], createdAt, bookmarked: false, ...extra });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of readdirSync('supabase/migrations').sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'ann@example.com', $2), ($3, 'bob@example.com', '{}')`, [
    ANN,
    { given_name: '  Ann\tMarie  ' },
    BOB,
  ]);
});

describe('profiles', () => {
  it('every new account gets a profile, named from sign-up details or "Player"', async () => {
    expect(await rows(`select id, display_name from public.profiles order by id`)).toEqual([
      { id: ANN, display_name: 'Ann Marie' },
      { id: BOB, display_name: 'Player' },
    ]);
    expect((await rows<{ n: string }>(`select public.clean_display_name($1) as n`, ['x'.repeat(40)]))[0].n).toHaveLength(24);
  });

  it('you can read and rename only your own profile; visitors see nothing', async () => {
    await as(ANN, async () => {
      expect(await rows(`select display_name from public.profiles`)).toEqual([{ display_name: 'Ann Marie' }]);
      await db.query(`update public.profiles set display_name = 'Ann' where id = $1`, [ANN]);
      const r = await db.query(`update public.profiles set display_name = 'Hacked' where id = $1`, [BOB]);
      expect(r.affectedRows).toBe(0);
      // other columns cannot be changed at all
      expect(await fails(db.query(`update public.profiles set id = $1 where id = $2`, [BOB, ANN]))).toMatch(/permission denied/);
    });
    expect(await rows(`select display_name from public.profiles where id = $1`, [BOB])).toEqual([{ display_name: 'Player' }]);
    expect(await as(null, () => fails(db.query(`select * from public.profiles`)))).toMatch(/permission denied/);
  });

  it('display names are checked by the database, whatever the browser sends', async () => {
    await as(ANN, async () => {
      for (const bad of ['', '   ', ' padded', 'x'.repeat(25), 'tab\there'])
        expect(await fails(db.query(`update public.profiles set display_name = $1 where id = $2`, [bad, ANN])), JSON.stringify(bad)).toMatch(/display_name_valid/);
    });
  });
});

describe('progress document', () => {
  it('saves only on top of the copy you last saw: a stale save gets the newer copy back instead', async () => {
    await as(ANN, async () => {
      const first = (await rows<{ r: { saved: boolean; revision: number } }>(`select public.save_progress(0, $1) as r`, [{ lessons: { a: { completed: true } } }]))[0].r;
      expect(first).toEqual({ saved: true, revision: 1 });
      // another device that still thinks the revision is 0
      const stale = (await rows<{ r: { saved: boolean; revision: number; data: unknown } }>(`select public.save_progress(0, $1) as r`, [{ lessons: {} }]))[0].r;
      expect(stale).toEqual({ saved: false, revision: 1, data: { lessons: { a: { completed: true } } } });
      const next = (await rows<{ r: { saved: boolean } }>(`select public.save_progress(1, $1) as r`, [{ lessons: { a: { completed: true }, b: { completed: true } } }]))[0].r;
      expect(next.saved).toBe(true);
    });
  });

  it('is private to its owner', async () => {
    await as(BOB, async () => {
      expect(await rows(`select * from public.progress`)).toEqual([]);
      expect(await fails(db.query(`insert into public.progress (user_id, data) values ($1, '{}')`, [ANN]))).toMatch(/row-level security/);
      // saving writes Bob's own document, never Ann's
      await db.query(`select public.save_progress(0, '{"mine": true}')`);
      expect(await rows(`select user_id from public.progress`)).toEqual([{ user_id: BOB }]);
    });
    expect(await as(null, () => fails(db.query(`select public.save_progress(0, '{}')`)))).toMatch(/permission denied/);
  });

  it('rejects documents that are not objects', async () => {
    await as(BOB, async () => {
      expect(await fails(db.query(`select public.save_progress(1, '[1,2]')`))).toMatch(/progress_data_valid/);
    });
  });
});

describe('practice hands', () => {
  it('saving the same hand again (a retry, another device, an import) never makes a second copy', async () => {
    await as(ANN, async () => {
      const batch = [{ record: hand('h-1'), updatedAt: 1 }, { record: hand('h-2'), updatedAt: 1 }];
      expect((await rows<{ n: number }>(`select public.save_hands($1) as n`, [batch]))[0].n).toBe(2);
      expect((await rows<{ n: number }>(`select public.save_hands($1) as n`, [batch]))[0].n).toBe(0);
      expect(await rows(`select id from public.practice_hands order by id`)).toEqual([{ id: 'h-1' }, { id: 'h-2' }]);
    });
  });

  it('a change (a bookmark) is kept only if it is newer than the saved copy', async () => {
    await as(ANN, async () => {
      await db.query(`select public.save_hands($1)`, [[{ record: hand('h-1', undefined, { bookmarked: true }), updatedAt: 5000 }]]);
      await db.query(`select public.save_hands($1)`, [[{ record: hand('h-1', undefined, { bookmarked: false }), updatedAt: 4000 }]]);
      expect(await rows(`select record->>'bookmarked' as b from public.practice_hands where id = 'h-1'`)).toEqual([{ b: 'true' }]);
    });
  });

  it('are private: other users cannot read, add to or delete your hands', async () => {
    await as(BOB, async () => {
      expect(await rows(`select * from public.practice_hands`)).toEqual([]);
      expect(await fails(db.query(`insert into public.practice_hands (user_id, id, record, created_at, updated_at) values ($1, 'x', '{"id":"x"}', now(), now())`, [ANN]))).toMatch(/row-level security/);
      expect((await db.query(`delete from public.practice_hands where user_id = $1`, [ANN])).affectedRows).toBe(0);
      // Bob saving a hand with Ann's hand id stores it as Bob's own
      await db.query(`select public.save_hands($1)`, [[{ record: hand('h-1'), updatedAt: 1 }]]);
    });
    expect(await rows(`select user_id from public.practice_hands where id = 'h-1' order by user_id`)).toEqual([{ user_id: ANN }, { user_id: BOB }]);
  });

  it('checks ids, sizes and batch length', async () => {
    await as(ANN, async () => {
      expect(await fails(db.query(`select public.save_hands($1)`, [[{ record: hand('bad id!'), updatedAt: 1 }]]))).toMatch(/hand_id_valid/);
      expect(await fails(db.query(`select public.save_hands($1)`, [[{ record: { ...hand('big'), pad: 'x'.repeat(40000) }, updatedAt: 1 }]]))).toMatch(/hand_record_valid/);
      expect(await fails(db.query(`select public.save_hands($1)`, [Array.from({ length: 501 }, (_, i) => ({ record: hand(`b${i}`), updatedAt: 1 }))]))).toMatch(/500 hands/);
    });
  });

  it('reset clears only your own practice progress', async () => {
    await as(BOB, () => db.query(`select public.reset_practice_progress()`));
    expect(await rows(`select user_id, count(*)::int as n from public.practice_hands group by user_id order by user_id`)).toEqual([{ user_id: ANN, n: 2 }]);
    expect(await rows(`select data from public.progress where user_id = $1`, [BOB])).toEqual([{ data: {} }]);
  });
});

describe('puzzle results', () => {
  it('the first result for a run id stays: replaying or importing again cannot improve or duplicate it', async () => {
    await as(ANN, async () => {
      const run = (points: number) => ({ id: 'daily:2026-10-31', mode: 'daily', date: '2026-10-31', points, correct: 3, total: 5, ms: 1000, at: 1, marks: 'ooxox' });
      expect((await rows<{ n: number }>(`select public.save_puzzle_runs($1) as n`, [[run(300)]]))[0].n).toBe(1);
      expect((await rows<{ n: number }>(`select public.save_puzzle_runs($1) as n`, [[run(999)]]))[0].n).toBe(0);
      expect(await rows(`select run->>'points' as p from public.puzzle_runs`)).toEqual([{ p: '300' }]);
      // results cannot be edited or deleted directly either
      expect(await fails(db.query(`update public.puzzle_runs set run = run`))).toMatch(/permission denied/);
    });
    expect(await as(BOB, () => rows(`select * from public.puzzle_runs`))).toEqual([]);
  });
});

describe('deleting an account', () => {
  it('removes the account and everything it owns, and only yours', async () => {
    const CAT = '33333333-3333-4333-8333-333333333333';
    await db.query(`insert into auth.users (id, email) values ($1, 'cat@example.com')`, [CAT]);
    await as(CAT, async () => {
      await db.query(`select public.save_progress(0, '{"lessons":{}}')`);
      await db.query(`select public.save_hands($1)`, [[{ record: hand('c-1'), updatedAt: 1 }]]);
    });
    // nobody else can delete it, and visitors cannot call it at all
    expect(await as(null, () => fails(db.query(`select public.delete_my_account()`)))).toMatch(/permission denied/);
    await as(CAT, () => db.query(`select public.delete_my_account()`));
    expect(await rows(`select id from auth.users where id = $1`, [CAT])).toEqual([]);
    for (const t of ['profiles', 'progress', 'practice_hands'])
      expect(await rows(`select 1 from public.${t} where ${t === 'profiles' ? 'id' : 'user_id'} = $1`, [CAT]), t).toEqual([]);
    // the others are untouched
    expect((await rows(`select id from auth.users order by id`)).length).toBe(2);
    expect((await rows(`select 1 from public.practice_hands where user_id = $1`, [ANN])).length).toBe(2);
  });
});

