// Saving progress to an account: the merge rules, guest imports, and two devices using one
// account. The stand-in account below follows the same rules as the database functions
// (supabase/migrations): revisions for the document, newer-copy-wins for hands, first-wins for
// puzzle results.
import { describe, it, expect } from 'vitest';
import {
  AccountSync,
  applyRemote,
  freshBase,
  guestSummary,
  hasGuestProgress,
  mergeDoc,
  mergeGuest,
  mergeLessons,
  mergeRanges,
  pendingChanges,
  syncMessage,
  type AccountDoc,
  type AccountStore,
  type RemoteHand,
  type SyncState,
} from '../src/persistence/accountSync';
import { emptyData, forgetOwner, load, save, type AppData, type HandRecord, type SavedRange } from '../src/persistence/storage';
import type { PuzzleRun } from '../src/puzzles/daily';

const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const hand = (id: string, createdAt: number, extra: Partial<HandRecord> = {}) =>
  ({ id, scenarioId: `s-${id}`, templateId: 't', heroActions: [], decisions: [], createdAt, bookmarked: false, score: 50, ...extra }) as unknown as HandRecord;
const range = (id: string, text = 'AA', updatedAt = 1): SavedRange => ({ id, name: id, text, createdAt: 1, updatedAt });
const run = (id: string, points = 100): PuzzleRun => ({ id, mode: 'daily', date: id.slice(6), points, correct: 3, total: 5, ms: 1, at: points, marks: 'ooo' });

/** An account in memory with the database's rules. */
class FakeAccount implements AccountStore {
  revision = 0;
  doc: AccountDoc = {};
  hands = new Map<string, RemoteHand>();
  runs = new Map<string, PuzzleRun>();
  down = false;
  writes = 0;
  private check() {
    if (this.down) throw new TypeError('Failed to fetch');
  }
  async fetch() {
    this.check();
    return copy({ revision: this.revision, doc: this.doc, hands: [...this.hands.values()].sort((a, b) => b.record.createdAt - a.record.createdAt), runs: [...this.runs.values()] });
  }
  async saveDoc(expected: number, doc: AccountDoc) {
    this.check();
    if (expected !== this.revision) return { saved: false as const, revision: this.revision, doc: copy(this.doc) };
    this.writes++;
    this.doc = copy(doc);
    return { saved: true as const, revision: ++this.revision };
  }
  async saveHands(hands: RemoteHand[]) {
    this.check();
    for (const h of hands) {
      const had = this.hands.get(h.record.id);
      if (!had || had.updatedAt < h.updatedAt) {
        this.writes++;
        this.hands.set(h.record.id, copy(h));
      }
    }
  }
  async saveRuns(runs: PuzzleRun[]) {
    this.check();
    for (const r of runs) if (!this.runs.has(r.id)) this.runs.set(r.id, copy(r));
  }
  async reset() {
    this.check();
    this.hands.clear();
    this.doc = {};
    this.revision++;
  }
}

let devices = 0;
/** A browser signed in to the account. */
function device(account: FakeAccount, data: AppData = emptyData(), runs: PuzzleRun[] = []) {
  const d = { data, runs, states: [] as SyncState[] };
  const sync = new AccountSync(`device-${++devices}`, account, {
    getData: () => d.data,
    setData: (x) => (d.data = x),
    getRuns: () => d.runs,
    setRuns: (r) => (d.runs = r),
    onState: (s) => d.states.push(s),
  });
  return Object.assign(d, { sync, edit: (fn: (x: AppData) => AppData) => (d.data = fn(d.data)), last: () => d.states[d.states.length - 1] });
}

describe('merge rules', () => {
  it('lesson progress only moves forward', () => {
    const merged = mergeLessons(
      { a: { completed: true, quizBest: { correct: 2, total: 4, at: 1 }, visitedAt: 5 } },
      { a: { completed: false, quizBest: { correct: 3, total: 4, at: 2 }, visitedAt: 3 }, b: { completed: false, visitedAt: 9 } },
    );
    expect(merged).toEqual({ a: { completed: true, quizBest: { correct: 3, total: 4, at: 2 }, visitedAt: 5 }, b: { completed: false, visitedAt: 9 } });
  });

  it('ranges: this device’s additions, edits and deletions are applied to the account’s copy, and nothing deleted comes back', () => {
    const base = [range('r1'), range('r2')];
    const local = [range('r1', 'KK', 2), range('r3')]; // edited r1, deleted r2, added r3
    const remote = [range('r1'), range('r2'), range('r4')]; // someone else added r4
    expect(mergeRanges(base, local, remote).map((r) => [r.id, r.text])).toEqual([
      ['r1', 'KK'],
      ['r4', 'AA'],
      ['r3', 'AA'],
    ]);
    // deleted elsewhere and untouched here: stays deleted
    expect(mergeRanges([range('r1')], [range('r1')], []).map((r) => r.id)).toEqual([]);
  });

  it('settings changed on this device win; otherwise the account’s are kept', () => {
    const base: AccountDoc = { settings: { ...emptyData().settings, difficulty: 'beginner' } as AppData['settings'] };
    const remote: AccountDoc = { settings: { ...emptyData().settings, difficulty: 'expert' } as AppData['settings'] };
    expect(mergeDoc(base, { settings: base.settings }, remote).settings).toEqual(remote.settings);
    const mine = { ...emptyData().settings, difficulty: 'advanced' } as AppData['settings'];
    expect(mergeDoc(base, { settings: mine }, remote).settings).toEqual(mine);
  });

  it('a device that has never synced this account counts its copy as already saved, so it can never overwrite the account', () => {
    const stale = { ...emptyData(), history: [hand('old', 1)], lessons: { gone: { completed: true } } };
    const remote = { revision: 7, doc: { lessons: { kept: { completed: true } } }, hands: [{ record: hand('new', 2), updatedAt: 2 }], runs: [] };
    const r = applyRemote(stale, [], freshBase(stale, []), remote);
    expect(r.data.history.map((h) => h.id)).toEqual(['new']);
    expect(pendingChanges(r.data, r.runs, r.base).hands).toEqual([]);
  });

  it('a new hand is sent with its creation time; a bookmark changed here with the current time', () => {
    const base = { revision: 1, doc: {}, hands: { h1: JSON.stringify([false, null]) }, runs: [] };
    const d = { ...emptyData(), history: [hand('h1', 10, { bookmarked: true }), hand('h2', 20)] };
    const p = pendingChanges(d, [], base, 999);
    expect(p.hands.map((x) => [x.record.id, x.updatedAt])).toEqual([
      ['h1', 999],
      ['h2', 20],
    ]);
  });
});

describe('guest progress', () => {
  const guest = {
    ...emptyData(),
    history: [hand('g1', 1), hand('shared', 2)],
    lessons: { a: { completed: true } },
    ranges: [range('gr')],
    settings: { ...emptyData().settings, difficulty: 'expert' } as AppData['settings'],
  };
  const guestRuns = [run('daily:2026-10-30')];

  it('describes what would be imported', () => {
    expect(guestSummary(guest, guestRuns)).toEqual({ hands: 2, lessons: 1, ranges: 1, puzzles: 1, settings: true });
    expect(hasGuestProgress(guestSummary(emptyData(), []))).toBe(false);
  });

  it('importing twice adds nothing the second time, and nothing is counted twice', () => {
    const account = { ...emptyData(), history: [hand('shared', 2, { bookmarked: true })] };
    const once = mergeGuest(account, [], guest, guestRuns, true);
    const twice = mergeGuest(once.data, once.runs, guest, guestRuns, true);
    expect(twice).toEqual(once);
    expect(once.data.history.map((h) => h.id)).toEqual(['g1', 'shared']);
    expect(once.data.history.find((h) => h.id === 'shared')!.bookmarked).toBe(true); // the account's copy is kept
    expect(once.runs).toHaveLength(1);
  });

  it('settings come from the guest only if the account has never saved any', () => {
    expect(mergeGuest(emptyData(), [], guest, [], false).data.settings).toEqual(guest.settings);
    expect(mergeGuest(emptyData(), [], guest, [], true).data.settings).toEqual(emptyData().settings);
  });
});

describe('two devices, one account', () => {
  it('changes from both arrive, a stale device overwrites nothing, and no hand is duplicated', async () => {
    const acct = new FakeAccount();
    const a = device(acct);
    expect(await a.sync.start()).toBe(true);
    a.edit((d) => ({ ...d, history: [hand('h1', 1)], lessons: { l1: { completed: true } }, ranges: [range('r1')] }));
    expect(await a.sync.flush()).toBe(true);

    const b = device(acct);
    await b.sync.start();
    expect(b.data.history.map((h) => h.id)).toEqual(['h1']);
    expect(b.data.ranges.map((r) => r.id)).toEqual(['r1']);

    // A deletes r1; B, which has not looked again, bookmarks h1, adds r2 and finishes l2
    a.edit((d) => ({ ...d, ranges: [] }));
    await a.sync.flush();
    b.edit((d) => ({ ...d, history: d.history.map((h) => ({ ...h, bookmarked: true })), ranges: [...d.ranges, range('r2')], lessons: { ...d.lessons, l2: { completed: true } } }));
    expect(await b.sync.flush()).toBe(true);

    expect(acct.doc.ranges!.map((r) => r.id)).toEqual(['r2']); // r1 stays deleted
    expect(Object.keys(acct.doc.lessons!).sort()).toEqual(['l1', 'l2']);
    expect(acct.hands.size).toBe(1);
    expect(acct.hands.get('h1')!.record.bookmarked).toBe(true);

    // A looks again and sees everything
    const a2 = device(acct, a.data, a.runs);
    await a2.sync.start();
    expect(a2.data.ranges.map((r) => r.id)).toEqual(['r2']);
    expect(a2.data.history[0].bookmarked).toBe(true);
  });

  it('a guest import reaches the account once; importing again writes nothing new', async () => {
    const acct = new FakeAccount();
    const dev = device(acct);
    await dev.sync.start();
    const guest = { ...emptyData(), history: [hand('g1', 1), hand('g2', 2)], lessons: { a: { completed: true } } };
    expect(await dev.sync.importGuest(guest, [run('daily:2026-10-31')])).toBe(true);
    expect([...acct.hands.keys()].sort()).toEqual(['g1', 'g2']);
    expect(acct.runs.size).toBe(1);
    const writes = acct.writes;
    expect(await dev.sync.importGuest(guest, [run('daily:2026-10-31', 999)])).toBe(true);
    expect(acct.writes).toBe(writes);
    expect(acct.runs.get('daily:2026-10-31')!.points).toBe(100); // a result cannot be improved by importing again
  });

  it('if the account cannot be loaded, nothing is written to it', async () => {
    const acct = new FakeAccount();
    acct.down = true;
    const dev = device(acct, { ...emptyData(), history: [hand('local', 1)] });
    expect(await dev.sync.start()).toBe(false);
    expect(dev.last()).toEqual({ phase: 'load-failed', message: 'Could not reach your account. Check your connection.' });
    acct.down = false;
    expect(await dev.sync.flush()).toBe(false);
    expect(acct.writes).toBe(0);
  });

  it('if a save fails, the change stays on the device and is saved on the next try', async () => {
    const acct = new FakeAccount();
    const dev = device(acct);
    await dev.sync.start();
    acct.down = true;
    dev.edit((d) => ({ ...d, history: [hand('h1', 1)] }));
    expect(await dev.sync.flush()).toBe(false);
    expect(dev.last()).toMatchObject({ phase: 'save-failed' });
    expect(dev.data.history).toHaveLength(1);
    acct.down = false;
    expect(await dev.sync.flush()).toBe(true);
    expect(acct.hands.has('h1')).toBe(true);
    dev.sync.stop();
  });

  it('the Progress page reset clears the account too', async () => {
    const acct = new FakeAccount();
    const dev = device(acct);
    await dev.sync.start();
    dev.edit((d) => ({ ...d, history: [hand('h1', 1)], lessons: { a: { completed: true } } }));
    await dev.sync.flush();
    dev.edit(() => emptyData());
    await dev.sync.resetAccount();
    expect(acct.hands.size).toBe(0);
    expect(acct.doc.lessons).toEqual({});
  });

  it('explains failures in words', () => {
    expect(syncMessage(new TypeError('Failed to fetch'))).toMatch(/connection/);
    expect(syncMessage(new Error('JWT expired'))).toMatch(/sign-in has expired/);
  });
});

describe('a shared device', () => {
  it('each account keeps its own copy in the browser, apart from the guest’s, and signing out removes only that account’s', () => {
    const guest = { ...emptyData(), history: [hand('guest', 1)] };
    save(guest, null);
    save({ ...emptyData(), history: [hand('ann', 2)] }, 'ann-id');
    save({ ...emptyData(), history: [hand('bob', 3)] }, 'bob-id');
    expect(load('ann-id').history.map((h) => h.id)).toEqual(['ann']);
    expect(load('bob-id').history.map((h) => h.id)).toEqual(['bob']);
    forgetOwner('ann-id');
    expect(load('ann-id').history).toEqual([]);
    expect(load('bob-id').history.map((h) => h.id)).toEqual(['bob']);
    expect(load(null).history.map((h) => h.id)).toEqual(['guest']);
  });
});

describe('after signing in', () => {
  it('only ever returns to a page on this site', async () => {
    const { isSitePath } = await import('../src/auth/AuthContext');
    for (const ok of ['/', '/account', '/play/public-1?x=1']) expect(isSitePath(ok), ok).toBe(true);
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', '']) expect(isSitePath(bad), bad).toBe(false);
  });
});

describe('sign-in methods', () => {
  it('only the methods switched on in Supabase are offered', async () => {
    const { methodsFrom } = await import('../src/auth/supabase');
    expect(methodsFrom({ external: { google: true, email: false, github: true } })).toEqual({ google: true, email: false });
    expect(methodsFrom({ external: { email: true } })).toEqual({ google: false, email: true });
    expect(methodsFrom(null)).toEqual({ google: false, email: false });
    expect(methodsFrom({ external: { google: 'yes' } })).toEqual({ google: false, email: false });
  });
});
