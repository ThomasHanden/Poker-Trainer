// The table server's leaderboard pieces (party/server.ts), run here with an in-memory stand-in for
// Durable Object storage and a fake database: ranked runs from start to saved, retries, a database
// that is down, the chip bank's reports from tables, and what is sent to the chip leaderboard.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
  env: {},
}));
vi.mock('partyserver', () => ({
  Server: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
    getConnections() {
      return [];
    }
  },
  routePartykitRequest: async () => null,
}));

// party/server.ts is type-checked with Cloudflare's types (npx tsc -p party), not this project's,
// so it is loaded by a path the type checker does not follow
const SERVER = '../party/server';
type Reply = { status: number; json: string };
type AnyObj = { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const { Bank, Puzzles, PokerTable } = (await import(/* @vite-ignore */ SERVER)) as {
  Bank: new (ctx: never, env: never) => AnyObj;
  Puzzles: new (ctx: never, env: never) => { act(user: string, req: object): Promise<Reply>; alarm(): Promise<void> };
  PokerTable: new (ctx: never, env: never) => AnyObj;
};
const { puzzleOf } = await import('../src/puzzles/ranked');
const { pointsFor } = await import('../src/puzzles/daily');
const { accountPlayerId } = await import('../src/multiplayer/accounts');
const { LiveTable } = await import('../src/multiplayer/table');
type Attempt = import('../src/puzzles/ranked').Attempt;

class FakeStorage {
  m = new Map<string, unknown>();
  alarm: number | null = null;
  async get(k: string | string[]) {
    if (Array.isArray(k)) return new Map(k.filter((x) => this.m.has(x)).map((x) => [x, structuredClone(this.m.get(x))]));
    return structuredClone(this.m.get(k));
  }
  async put(k: string | Record<string, unknown>, v?: unknown) {
    if (typeof k === 'string') this.m.set(k, structuredClone(v));
    else for (const [a, b] of Object.entries(k)) this.m.set(a, structuredClone(b));
  }
  async delete(k: string) {
    return this.m.delete(k);
  }
  async list(o: { prefix?: string; start?: string; end?: string }) {
    const keys = [...this.m.keys()].sort().filter((k) => (!o.prefix || k.startsWith(o.prefix)) && (!o.start || k >= o.start) && (!o.end || k < o.end));
    return new Map(keys.map((k) => [k, structuredClone(this.m.get(k))]));
  }
  async getAlarm() {
    return this.alarm;
  }
  async setAlarm(t: number) {
    this.alarm = t;
  }
}
const ctxOf = (storage = new FakeStorage()) => ({ storage, blockConcurrencyWhile: (fn: () => Promise<unknown>) => fn() });

/** A stand-in for the database: records each call; `down` makes it unreachable. */
function fakeDb() {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = { calls, down: false };
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (db.down) throw new TypeError('fetch failed');
    const fn = url.split('/rpc/')[1];
    const args = JSON.parse(String(init.body));
    calls.push({ fn, args });
    const body = fn === 'lb_record_daily' ? { saved: true, points: args.p_points, rank: 3, entries: 40 } : fn === 'lb_record_survival' ? { saved: true, best: args.p_points, previous_best: 500, new_best: args.p_points > 500, rank: 2, entries: 9, week_rank: 1 } : 1;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return db;
}

const ENV = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' };
const USER = '9a7b1c2d-0000-4000-8000-000000000001';
const T0 = Date.UTC(2026, 10, 1, 12);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type View = { attempt: Attempt | null; save: { state: string; rank?: number; message?: string } | null; error?: string; outcome?: { correct: boolean; points: number; ms: number } };
async function call(p: InstanceType<typeof Puzzles>, req: Record<string, unknown>): Promise<{ status: number; body: View }> {
  const r = await p.act(USER, req);
  return { status: r.status, body: JSON.parse(r.json) };
}

describe('ranked runs on the table server', () => {
  it('plays a daily five question by question, scores it itself, and saves it once', async () => {
    const db = fakeDb();
    const p = new Puzzles(ctxOf() as never, ENV as never);
    const first = await call(p, { action: 'start', mode: 'daily' });
    const id = first.body.attempt!.id;
    // a reload or a second tab: the same run, not a new one
    expect((await call(p, { action: 'start', mode: 'daily' })).body.attempt!.id).toBe(id);
    let expected = 0;
    let combo = 0;
    for (let k = 0; k < 5; k++) {
      await call(p, { action: 'serve', mode: 'daily', id, index: k });
      vi.advanceTimersByTime(4000);
      const ans = puzzleOf(first.body.attempt!, k).answer;
      // anything else the browser sends (a score, a time) is ignored
      const r = await call(p, { action: 'answer', mode: 'daily', id, index: k, pick: ans, points: 99999, ms: 1, correct: true });
      combo++;
      expected += pointsFor(true, 4000, combo);
      expect(r.body.outcome).toMatchObject({ correct: true, ms: 4000 });
      if (k === 4) expect(r.body.save).toEqual({ state: 'saved', rank: 3, entries: 40 });
    }
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]).toMatchObject({ fn: 'lb_record_daily', args: { p_user: USER, p_attempt: id, p_day: '2026-11-01', p_version: 1, p_points: expected, p_correct: 5, p_answered: 5, p_ms: 20_000 } });
    // finished: starting again shows the result, and nothing more can be answered
    const again = await call(p, { action: 'start', mode: 'daily' });
    expect(again.body.attempt!.status).toBe('done');
    expect((await call(p, { action: 'serve', mode: 'daily', id, index: 5 })).status).toBe(409);
  });

  it('times a question from when it was first shown, however often it is shown again', async () => {
    fakeDb();
    const p = new Puzzles(ctxOf() as never, ENV as never);
    const { attempt } = (await call(p, { action: 'start', mode: 'daily' })).body;
    await call(p, { action: 'serve', mode: 'daily', id: attempt!.id, index: 0 });
    vi.advanceTimersByTime(15_000);
    await call(p, { action: 'serve', mode: 'daily', id: attempt!.id, index: 0 });
    vi.advanceTimersByTime(1000);
    const r = await call(p, { action: 'answer', mode: 'daily', id: attempt!.id, index: 0, pick: puzzleOf(attempt!, 0).answer });
    expect(r.body.outcome!.ms).toBe(16_000);
  });

  it('keeps a finished run when the database is down, and saves it later', async () => {
    const db = fakeDb();
    const storage = new FakeStorage();
    const p = new Puzzles(ctxOf(storage) as never, ENV as never);
    const { attempt } = (await call(p, { action: 'start', mode: 'survival' })).body;
    expect((await call(p, { action: 'start', mode: 'survival' })).body.attempt!.id).toBe(attempt!.id);
    db.down = true;
    let last: View | null = null;
    for (let k = 0; k < 3; k++) {
      await call(p, { action: 'serve', mode: 'survival', id: attempt!.id, index: k });
      const wrong = (puzzleOf(attempt!, k).answer + 1) % 2;
      last = (await call(p, { action: 'answer', mode: 'survival', id: attempt!.id, index: k, pick: wrong })).body;
    }
    expect(last!.attempt!.status).toBe('done');
    expect(last!.save).toMatchObject({ state: 'failed' });
    expect(storage.alarm).not.toBeNull();
    expect([...storage.m.keys()]).toContain(`outbox:${attempt!.id}`);
    // later: the alarm tries again and the database has it
    db.down = false;
    await p.alarm();
    expect(db.calls.map((c) => c.fn)).toEqual(['lb_record_survival']);
    expect([...storage.m.keys()].some((k) => k.startsWith('outbox:'))).toBe(false);
    expect((await call(p, { action: 'state', mode: 'survival' })).body.save).toMatchObject({ state: 'saved', rank: 2 });
    // a new run is a new one
    expect((await call(p, { action: 'start', mode: 'survival' })).body.attempt!.id).not.toBe(attempt!.id);
  });

  it('refuses unknown modes, other people’s runs and questions out of order', async () => {
    fakeDb();
    const p = new Puzzles(ctxOf() as never, ENV as never);
    expect((await call(p, { action: 'start', mode: 'speedrun' })).status).toBe(400);
    const { attempt } = (await call(p, { action: 'start', mode: 'daily' })).body;
    expect((await call(p, { action: 'serve', mode: 'daily', id: 'someone-elses-run', index: 0 })).status).toBe(404);
    expect((await call(p, { action: 'serve', mode: 'daily', id: attempt!.id, index: 3 })).status).toBe(409);
    expect((await call(p, { action: 'answer', mode: 'daily', id: attempt!.id, index: 0, pick: 0 })).body.error).toBe('That question has not been shown yet.');
  });
});

describe('the chip bank and the chip leaderboard', () => {
  it('counts a player’s chips once through buy-in, play, a cash-out and a restart, and sends totals for accounts only', async () => {
    const db = fakeDb();
    const storage = new FakeStorage();
    const bank = new Bank(ctxOf(storage) as never, ENV as never);
    const ann = await accountPlayerId(USER);
    const guest = 'ab12cd34ef56ab12cd34ef56';
    await storage.put({ [ann]: { balance: 1000 }, [guest]: { balance: 1000 } });
    expect(await bank.withdraw(ann, 400, 400, 'public-1')).toBe(400);
    expect(await bank.withdraw(guest, 400, 400, 'public-1')).toBe(400);
    // a hand: Ann wins 150 from the guest
    await bank.settle('public-1', 1, [], [{ id: ann, amount: 550 }, { id: guest, amount: 250 }]);
    // the same report again changes nothing
    await bank.settle('public-1', 1, [], [{ id: ann, amount: 550 }, { id: guest, amount: 250 }]);
    expect(storage.m.get(ann)).toMatchObject({ balance: 600, atTables: 550 });
    await bank.alarm();
    const sent = db.calls.at(-1)!;
    expect(sent.fn).toBe('lb_sync_chips');
    expect(sent.args.rows).toEqual([expect.objectContaining({ player_id: ann, bank: 600, at_tables: 550 })]);
    // the table restarts: Ann's 550 come back to her bank, once
    await bank.release('public-1');
    await bank.release('public-1');
    expect(storage.m.get(ann)).toMatchObject({ balance: 1150, atTables: 0 });
    expect(storage.m.get(guest)).toMatchObject({ balance: 850, atTables: 0 });
  });

  it('keeps totals queued while the database is down', async () => {
    const db = fakeDb();
    const storage = new FakeStorage();
    const bank = new Bank(ctxOf(storage) as never, ENV as never);
    const ann = await accountPlayerId(USER);
    await storage.put({ [ann]: { balance: 500 }, 'lb:backfilled': true });
    db.down = true;
    await bank.claim(ann);
    await bank.alarm();
    expect(storage.m.get('lb:dirty')).toEqual([ann]);
    db.down = false;
    await bank.alarm();
    expect(storage.m.get('lb:dirty')).toEqual([]);
    expect((db.calls.at(-1)!.args.rows as { bank: number }[])[0].bank).toBeGreaterThan(500);
  });

  it('a table sends its reports in order and again until the bank has them, paying each once', async () => {
    fakeDb();
    const bankStorage = new FakeStorage();
    const bank = new Bank(ctxOf(bankStorage) as never, ENV as never);
    let failNext = 1;
    const flaky = {
      settle: async (...args: unknown[]) => {
        await bank.settle(...args);
        // the bank applied it, but the reply was lost
        if (failNext-- > 0) throw new Error('connection lost');
      },
      sendBank: async () => undefined,
    };
    const env = { ...ENV, Bank: { idFromName: () => 'bank', get: () => flaky } };
    const t = new PokerTable(ctxOf() as never, env as never);
    Object.assign(t, { name: 'public-2', table: new LiveTable() });
    t.sendBank = async () => undefined;
    const ann = await accountPlayerId(USER);
    await bankStorage.put(ann, { balance: 0 });
    // Ann stood up with 300: the first report reaches the bank but its reply is lost
    (t.table as unknown as { cashouts: { id: string; amount: number }[] }).cashouts.push({ id: ann, amount: 300 });
    await t.report();
    expect(t.unsent).toHaveLength(1);
    // the retry: the bank has already applied it, so she is paid once
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.unsent).toHaveLength(0);
    expect(bankStorage.m.get(ann)).toMatchObject({ balance: 300 });
  });
});
