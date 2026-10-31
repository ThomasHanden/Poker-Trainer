import { describe, it, expect } from 'vitest';
import { DAILY_MAX, DAILY_MIN, claimDaily, deposit, nextUtcMidnight, rollDaily, status, upgrade, utcDay, withdraw, type Account } from '../src/multiplayer/bank';
import { CHIP, LiveTable, LOW_STAKES, HIGH_STAKES, buyInFor } from '../src/multiplayer/table';

/** a stand-in for crypto.getRandomValues: plays back the given 32-bit numbers */
const sequence = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const roll = () => rollDaily(() => crypto.getRandomValues(new Uint32Array(1))[0]);
const DAY = '2026-10-31';

describe('daily chips: the amount', () => {
  it('is always a whole number of chips from 50 to 200, every amount possible', () => {
    const seen = new Set<number>();
    for (let k = 0; k < 20000; k++) {
      const n = roll();
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(DAILY_MIN);
      expect(n).toBeLessThanOrEqual(DAILY_MAX);
      seen.add(n);
    }
    expect(seen.size).toBe(DAILY_MAX - DAILY_MIN + 1);
  });

  it('is exactly uniform: every 32-bit value below the cut-off maps to each amount equally often', () => {
    const span = DAILY_MAX - DAILY_MIN + 1;
    const limit = Math.floor(2 ** 32 / span) * span;
    // one full cycle of residues, taken from the top of the accepted range
    const counts = new Map<number, number>();
    for (let r = limit - span * 3; r < limit; r++) {
      const n = rollDaily(sequence([r]));
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    expect(counts.size).toBe(span);
    expect(new Set(counts.values())).toEqual(new Set([3]));
    // values at or above the cut-off would favour the low amounts, so they are drawn again
    expect(rollDaily(sequence([2 ** 32 - 1, 0]))).toBe(DAILY_MIN);
  });
});

describe('daily chips: claiming', () => {
  it('pays once per UTC day; asking again pays nothing and returns the same amount', () => {
    const acc: Account = { balance: 500 };
    const first = claimDaily(acc, DAY, () => 137);
    expect(first.paid).toBe(true);
    expect(first.amount).toBe(137 * CHIP);
    expect(first.acc.balance).toBe(500 + 137 * CHIP);
    // a double click, a retry, another tab or another device: the same claim back, no second payment
    for (let k = 0; k < 5; k++) {
      const again = claimDaily(first.acc, DAY, () => 199);
      expect(again).toEqual({ acc: first.acc, amount: 137 * CHIP, paid: false });
    }
    // the next UTC day is a new claim
    const tomorrow = claimDaily(first.acc, '2026-11-01', () => 50);
    expect(tomorrow.paid).toBe(true);
    expect(tomorrow.acc.balance).toBe(500 + (137 + 50) * CHIP);
  });

  it('switches at UTC midnight, whatever the time zone of the player', () => {
    const before = Date.UTC(2026, 9, 31, 23, 59, 59, 999);
    const after = before + 1;
    const acc = claimDaily({ balance: 0 }, utcDay(before), () => 100).acc;
    expect(status(acc, before)).toMatchObject({ claimedToday: true, nextClaimAt: after });
    expect(status(acc, after)).toMatchObject({ claimedToday: false, claim: null, nextClaimAt: after });
    expect(nextUtcMidnight(Date.UTC(2026, 9, 31, 0, 0))).toBe(Date.UTC(2026, 10, 1));
  });

  it('nothing is paid just for showing up: balances only change by claiming', () => {
    const fresh = upgrade(undefined);
    expect(fresh).toEqual({ balance: 0 });
    expect(status(fresh, Date.UTC(2026, 9, 31, 12))).toMatchObject({ balance: 0, claimedToday: false });
    // reading the status any number of times, on any day, never pays
    const acc: Account = { balance: 40, claim: { day: '2026-10-01', amount: 100 } };
    for (const d of [1, 2, 30]) expect(status(acc, Date.UTC(2026, 10, d)).balance).toBe(40);
  });

  it('accounts from the old 1,000-chip top-up keep their balance; a top-up today counts as today’s claim', () => {
    const toppedUpToday = upgrade({ balance: 2000, day: DAY });
    expect(toppedUpToday).toEqual({ balance: 2000, claim: { day: DAY, amount: 0 } });
    expect(claimDaily(toppedUpToday, DAY, () => 150).paid).toBe(false);
    expect(status(toppedUpToday, Date.UTC(2026, 9, 31, 18))).toMatchObject({ claimedToday: true, balance: 2000 });
    // an older top-up: the balance stays and today's claim is open (no top-up to 1,000 any more)
    const older = upgrade({ balance: 37, day: '2026-10-28' });
    expect(older.balance).toBe(37);
    expect(status(older, Date.UTC(2026, 9, 31, 1)).claimedToday).toBe(false);
    expect(claimDaily(older, DAY, () => 60).acc.balance).toBe(37 + 60 * CHIP);
  });

  it('claimed chips go to the bank, never into a stack at a table', () => {
    const t = new LiveTable({ autoDeal: false });
    for (const id of ['ann', 'bob']) {
      t.setOnline(id, true);
      t.sit(id, id, 200);
    }
    t.start();
    const stacks = JSON.stringify(t.hand!.players.map((p) => p.stack));
    const seats = JSON.stringify(t.seats.map((s) => s.stack));
    claimDaily({ balance: 0 }, DAY, () => 200);
    expect(JSON.stringify(t.hand!.players.map((p) => p.stack))).toBe(stacks);
    expect(JSON.stringify(t.seats.map((s) => s.stack))).toBe(seats);
  });

  it('buy-ins still come out of the bank as before', () => {
    const acc = claimDaily({ balance: 0 }, DAY, () => 50).acc; // 50 chips
    expect(withdraw(acc, buyInFor(LOW_STAKES).min, buyInFor(LOW_STAKES).min).amount).toBe(30 * CHIP);
    expect(withdraw(acc, buyInFor(HIGH_STAKES).min, buyInFor(HIGH_STAKES).min).amount).toBe(0); // a 1/2 table needs 60
    expect(deposit(acc, 10).balance).toBe(acc.balance + 10);
  });

  it('the smallest claim covers the lowest table’s minimum buy-in', () => {
    expect(DAILY_MIN * CHIP).toBeGreaterThanOrEqual(buyInFor(LOW_STAKES).min);
  });
});
