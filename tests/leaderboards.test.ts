// Ranked puzzle runs (src/puzzles/ranked.ts) and the chip accounting behind the chip leaderboard
// (src/multiplayer/bank.ts): the rules the table server applies before anything reaches the database.
import { describe, it, expect } from 'vitest';
import { DAILY_QUESTIONS, answer, newAttempt, personalRun, puzzleOf, resultOf, serve, lapsed, weekKey, weekBounds, type Attempt } from '../src/puzzles/ranked';
import { LIVES, pointsFor, puzzleSet, randomPuzzle } from '../src/puzzles/daily';
import { buyIn, releaseTable, returnBuyIn, settleTable, totalChips, type Account, type TableHold } from '../src/multiplayer/bank';

const T0 = Date.UTC(2026, 10, 1, 12); // Sunday 1 November 2026, noon UTC

/** Show question k at `at` and answer it `ms` later; fails the test on any refusal. */
function play(a: Attempt, pick: number | ((answer: number) => number), at: number, ms: number): Attempt {
  const k = a.picks.length;
  const s = serve(a, k, at);
  if ('error' in s) throw new Error(s.error);
  const p = puzzleOf(s, k);
  const r = answer(s, k, typeof pick === 'number' ? pick : pick(p.answer), at + ms);
  if ('error' in r) throw new Error(r.error);
  return r.attempt;
}
const right = (ans: number) => ans;
const wrong = (ans: number) => (ans + 1) % 2;

describe('ranked daily five', () => {
  it('uses the same five questions as the unranked game, and scores them the same way', () => {
    let a = newAttempt('daily', 'attempt-0001', 'ignored', T0);
    expect(a.day).toBe('2026-11-01');
    const set = puzzleSet('2026-11-01');
    for (let k = 0; k < 5; k++) expect(puzzleOf(a, k)).toEqual(set[k]);
    // right, right (fast), wrong, right, right
    a = play(a, right, T0, 3000);
    a = play(a, right, T0 + 10_000, 4000);
    a = play(a, wrong, T0 + 20_000, 2000);
    a = play(a, right, T0 + 30_000, 12_500);
    a = play(a, right, T0 + 50_000, 30_000);
    expect(a.status).toBe('done');
    expect(a.points).toEqual([pointsFor(true, 3000, 1), pointsFor(true, 4000, 2), 0, pointsFor(true, 12_500, 1), pointsFor(true, 30_000, 2)]);
    expect(resultOf(a)).toEqual({ points: a.points.reduce((x, y) => x + y), correct: 4, total: 5, ms: 51_500, marks: 'ooxoo' });
    expect(personalRun(a)).toMatchObject({ id: 'daily:2026-11-01', mode: 'daily', date: '2026-11-01', correct: 4, total: 5, marks: 'ooxoo' });
  });

  it('times each answer from when the server first showed the question: reloading does not reset the clock', () => {
    let a = newAttempt('daily', 'attempt-0002', '', T0);
    const s1 = serve(a, 0, T0) as Attempt;
    const s2 = serve(s1, 0, T0 + 9000) as Attempt; // a reload, or a second tab, nine seconds later
    expect(s2.servedAt[0]).toBe(T0);
    const r = answer(s2, 0, puzzleOf(a, 0).answer, T0 + 10_000);
    expect('attempt' in r && r.outcome).toMatchObject({ correct: true, ms: 10_000, points: pointsFor(true, 10_000, 1) });
    a = (r as { attempt: Attempt }).attempt;
    expect(a.ms).toEqual([10_000]);
  });

  it('counts each answer once: a retry, a double click or a second tab gets the first outcome back', () => {
    const a = serve(newAttempt('daily', 'attempt-0003', '', T0), 0, T0) as Attempt;
    const ans = puzzleOf(a, 0).answer;
    const first = answer(a, 0, (ans + 1) % 2, T0 + 1000) as { attempt: Attempt };
    // the same question again, now with the right option: nothing changes
    const again = answer(first.attempt, 0, ans, T0 + 1500) as { attempt: Attempt; outcome: { correct: boolean } };
    expect(again.attempt).toBe(first.attempt);
    expect(again.outcome.correct).toBe(false);
    expect(first.attempt.picks).toHaveLength(1);
  });

  it('refuses answers out of order, before the question is shown, or that are not an option', () => {
    const a = newAttempt('daily', 'attempt-0004', '', T0);
    expect(answer(a, 0, 0, T0)).toEqual({ error: 'That question has not been shown yet.' });
    expect(serve(a, 1, T0)).toEqual({ error: 'That question is not the next one.' });
    const s = serve(a, 0, T0) as Attempt;
    expect(answer(s, 1, 0, T0)).toEqual({ error: 'That question is not the next one.' });
    expect(answer(s, 0, 9, T0)).toEqual({ error: 'Pick one of the options.' });
    expect(answer(s, 0, '1', T0)).toEqual({ error: 'Pick one of the options.' });
    expect(answer(s, 0, 0.5, T0)).toEqual({ error: 'Pick one of the options.' });
  });

  it('ends after five answers, and an unfinished run lapses at midnight UTC', () => {
    let a = newAttempt('daily', 'attempt-0005', '', T0);
    for (let k = 0; k < DAILY_QUESTIONS; k++) a = play(a, right, T0 + k * 1000, 500);
    expect(serve(a, 5, T0 + 10_000)).toEqual({ error: 'This run is over.' });
    const late = serve(newAttempt('daily', 'attempt-0006', '', Date.UTC(2026, 10, 1, 23, 59)), 0, Date.UTC(2026, 10, 1, 23, 59, 30)) as Attempt;
    expect(lapsed(late, Date.UTC(2026, 10, 1, 23, 59, 59))).toBe(false);
    expect(lapsed(late, Date.UTC(2026, 10, 2, 0, 0, 1))).toBe(true);
    expect(answer(late, 0, 0, Date.UTC(2026, 10, 2, 0, 0, 1))).toEqual({ error: 'This daily five has ended. A new one is up.' });
  });
});

describe('ranked survival', () => {
  it('draws questions from the server’s seed and ends after the third wrong answer', () => {
    let a = newAttempt('survival', 'run-000001', 'seed-abc', T0);
    expect(puzzleOf(a, 7)).toEqual(randomPuzzle('seed-abc', 7));
    expect(a.lives).toBe(LIVES);
    a = play(a, right, T0, 1000);
    a = play(a, wrong, T0 + 5000, 1000);
    a = play(a, right, T0 + 9000, 1000);
    a = play(a, wrong, T0 + 13_000, 1000);
    expect(a.status).toBe('active');
    a = play(a, wrong, T0 + 17_000, 1000);
    expect(a.status).toBe('done');
    expect(a.completedAt).toBe(T0 + 18_000);
    expect(resultOf(a)).toMatchObject({ correct: 2, total: 5, marks: 'oxoxx' });
    expect(personalRun(a).id).toBe('survival:run-000001');
  });
});

describe('weeks for the survival leaderboard', () => {
  it('run Monday 00:00 to Sunday 24:00 UTC', () => {
    expect(weekKey(Date.UTC(2026, 10, 1, 23, 59, 59))).toBe('2026-W44');
    expect(weekKey(Date.UTC(2026, 10, 2, 0, 0, 0))).toBe('2026-W45');
    expect(weekKey(Date.UTC(2027, 0, 1))).toBe('2026-W53');
    expect(weekKey(Date.UTC(2021, 0, 3))).toBe('2020-W53');
    expect(weekKey(Date.UTC(2026, 0, 1))).toBe('2026-W01');
    expect(weekBounds(Date.UTC(2026, 10, 1, 12))).toEqual({ start: Date.UTC(2026, 9, 26), end: Date.UTC(2026, 10, 2) });
  });
});

describe('chips on the chip leaderboard', () => {
  const acc = (balance: number, extra: Partial<Account> = {}): Account => ({ balance, ...extra });
  const total = (m: Map<string, Account>, id: string, fallback: Account) => totalChips(m.get(id) ?? fallback);

  it('a buy-in moves chips from the bank to the table: the total stays the same', () => {
    const r = buyIn(acc(1000), undefined, 'ann', 400, 400);
    expect(r.amount).toBe(400);
    expect(r.acc).toMatchObject({ balance: 600, atTables: 400 });
    expect(totalChips(r.acc)).toBe(1000);
    expect(r.hold.held).toEqual({ ann: 400 });
    // not enough: nothing moves
    expect(buyIn(acc(100), undefined, 'ann', 400, 400)).toMatchObject({ amount: 0, acc: { balance: 100 } });
  });

  it('a buy-in that never got a seat comes back', () => {
    const b = buyIn(acc(1000), undefined, 'ann', 400, 400);
    const r = returnBuyIn(b.acc, b.hold, 'ann', 400);
    expect(r.acc).toMatchObject({ balance: 1000, atTables: 0 });
    expect(r.hold.held).toEqual({});
  });

  it('winning and losing at the table moves totals; standing up does not count as winning', () => {
    const ann = buyIn(acc(1000), undefined, 'ann', 400, 400);
    const bob = buyIn(acc(500), ann.hold, 'bob', 400, 400);
    let accounts = new Map([['ann', ann.acc], ['bob', bob.acc]]);
    // a hand: Ann wins 100 from Bob
    let r = settleTable(accounts, bob.hold, 1, [], [{ id: 'ann', amount: 500 }, { id: 'bob', amount: 300 }]);
    accounts = new Map([...accounts, ...r.accounts]);
    expect(total(accounts, 'ann', ann.acc)).toBe(1100);
    expect(total(accounts, 'bob', bob.acc)).toBe(400);
    // Ann stands up: her stack goes to her bank, and her total is unchanged
    r = settleTable(accounts, r.hold, 2, [{ id: 'ann', amount: 500 }], [{ id: 'bob', amount: 300 }]);
    accounts = new Map([...accounts, ...r.accounts]);
    expect(accounts.get('ann')).toMatchObject({ balance: 1100, atTables: 0 });
    expect(total(accounts, 'bob', bob.acc)).toBe(400);
    expect(r.hold.held).toEqual({ bob: 300 });
  });

  it('a report sent twice pays nothing twice; a late older report pays out but cannot bring back old holdings', () => {
    const ann = buyIn(acc(1000), undefined, 'ann', 400, 400);
    const accounts = new Map([['ann', ann.acc]]);
    const once = settleTable(accounts, ann.hold, 1, [{ id: 'ann', amount: 400 }], []);
    const all = new Map([...accounts, ...once.accounts]);
    const twice = settleTable(all, once.hold, 1, [{ id: 'ann', amount: 400 }], []);
    expect(twice.accounts.size).toBe(0);
    expect(all.get('ann')).toMatchObject({ balance: 1000, atTables: 0 });
    // report 3 (newer) arrives before report 2: 2's pay-out counts, its holdings do not
    const bob = buyIn(acc(800), once.hold, 'bob', 400, 400);
    const m = new Map([...all, ['bob', bob.acc]]);
    const r3 = settleTable(m, bob.hold, 3, [], [{ id: 'bob', amount: 450 }]);
    const m3 = new Map([...m, ...r3.accounts]);
    const r2 = settleTable(m3, r3.hold, 2, [{ id: 'cat', amount: 50 }], [{ id: 'bob', amount: 400 }, { id: 'cat', amount: 50 }]);
    expect(r2.hold.held).toEqual({ bob: 450 });
    expect(r2.accounts.get('cat')).toMatchObject({ balance: 50 });
    expect(r2.accounts.has('bob')).toBe(false);
  });

  it('a split pot and a player at two tables are each counted once', () => {
    const a1 = buyIn(acc(2000), undefined, 'ann', 400, 400);
    const a2 = buyIn(a1.acc, undefined, 'ann', 600, 600);
    expect(a2.acc).toMatchObject({ balance: 1000, atTables: 1000 });
    // a split pot at table 1 leaves her where she was
    const r = settleTable(new Map([['ann', a2.acc]]), a1.hold, 1, [], [{ id: 'ann', amount: 400 }]);
    expect(r.accounts.size).toBe(0);
    expect(totalChips(a2.acc)).toBe(2000);
  });

  it('a table that restarts gives everyone back what it held, once', () => {
    const ann = buyIn(acc(1000), undefined, 'ann', 400, 400);
    const won = settleTable(new Map([['ann', ann.acc]]), ann.hold, 1, [], [{ id: 'ann', amount: 650 }]);
    const after = won.accounts.get('ann')!;
    expect(totalChips(after)).toBe(1250);
    const rel = releaseTable(new Map([['ann', after]]), won.hold);
    expect(rel.accounts.get('ann')).toMatchObject({ balance: 1250, atTables: 0 });
    const again = releaseTable(new Map([['ann', rel.accounts.get('ann')!]]), rel.hold as TableHold);
    expect(again.accounts.size).toBe(0);
    // the report numbers carry on, so the table's next report still counts
    expect(rel.hold).toMatchObject({ seq: 1, held: {} });
  });

  it('every change moves the account’s version on, so the database never keeps an older copy', () => {
    const b = buyIn(acc(1000, { v: 7 }), undefined, 'ann', 400, 400);
    expect(b.acc.v).toBe(8);
    const s = settleTable(new Map([['ann', b.acc]]), b.hold, 1, [{ id: 'ann', amount: 400 }], []);
    expect(s.accounts.get('ann')!.v).toBeGreaterThan(8);
  });
});
