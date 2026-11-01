// Getting to a live seat: claiming today's chips and sitting down in one step, what happens when a
// claim does not cover a table, which tables a balance can join, and that nothing is paid twice.
import { describe, it, expect } from 'vitest';
import { DAILY_MAX, DAILY_MIN, buyInAfterClaim, claimCovers, claimDaily, deposit, withdraw, type Account } from '../src/multiplayer/bank';
import { CHIP, HIGH_STAKES, LOW_STAKES, PUBLIC_TABLES, affordableTables, bestBuyIn, buyInFor, stakesFor, type TableSummary } from '../src/multiplayer/table';

const DAY = '2026-10-31';
const open: TableSummary = { players: 1, bots: 3, maxSeats: 6, playing: true };
const full: TableSummary = { players: 6, bots: 0, maxSeats: 6, playing: true };

describe('claim and sit in one step', () => {
  it('is offered only when even the smallest claim covers the table', () => {
    expect(claimCovers(LOW_STAKES, { balance: 0, claimedToday: false })).toBe(true);
    // 1/2 needs 60 chips; a claim can be as low as 50
    expect(DAILY_MIN * CHIP).toBeLessThan(buyInFor(HIGH_STAKES).min);
    expect(claimCovers(HIGH_STAKES, { balance: 0, claimedToday: false })).toBe(false);
    expect(claimCovers(HIGH_STAKES, { balance: 10 * CHIP, claimedToday: false })).toBe(true);
    // already claimed today, or claims unknown (an older server), or chips enough already: no
    expect(claimCovers(LOW_STAKES, { balance: 0, claimedToday: true })).toBe(false);
    expect(claimCovers(LOW_STAKES, { balance: 0 })).toBe(false);
    expect(claimCovers(LOW_STAKES, { balance: 500 * CHIP, claimedToday: false })).toBe(false);
  });

  it('after the claim: as much as the table allows in whole chips, or nothing if it still falls short', () => {
    expect(buyInAfterClaim(LOW_STAKES, 51 * CHIP)).toBe(51 * CHIP);
    expect(buyInAfterClaim(LOW_STAKES, 200 * CHIP)).toBe(buyInFor(LOW_STAKES).max);
    expect(buyInAfterClaim(LOW_STAKES, 51 * CHIP + 1)).toBe(51 * CHIP); // half a chip stays in the bank
    expect(buyInAfterClaim(HIGH_STAKES, 55 * CHIP)).toBeNull();
    expect(bestBuyIn(HIGH_STAKES, 299 * CHIP + 1)).toBe(299 * CHIP);
  });

  it('a double click, a retry or a second tab pays the claim once, and a seat takes the chips once', () => {
    const rand = () => 120;
    let acc: Account = { balance: 0 };
    const first = claimDaily(acc, DAY, rand);
    acc = first.acc;
    for (let k = 0; k < 3; k++) {
      const again = claimDaily(acc, DAY, () => 200);
      expect(again.paid).toBe(false);
      acc = again.acc;
    }
    expect(acc.balance).toBe(120 * CHIP);
    // the buy-in comes out once; a seat that went meanwhile gives it straight back
    const units = buyInAfterClaim(LOW_STAKES, acc.balance)!;
    const w = withdraw(acc, units, units);
    expect(w).not.toBeNull();
    const refunded = deposit(w!.acc, w!.amount);
    expect(refunded.balance).toBe(120 * CHIP);
  });

  it('every possible claim covers the cheapest table, so a new player can always sit at one', () => {
    for (let amount = DAILY_MIN; amount <= DAILY_MAX; amount++) expect(buyInAfterClaim(LOW_STAKES, amount * CHIP)).not.toBeNull();
  });
});

describe('tables a balance can join', () => {
  const all = Object.fromEntries(PUBLIC_TABLES.map((r) => [r, open]));

  it('are the public tables whose minimum it covers, with a seat a person can take', () => {
    expect(affordableTables(0, all)).toEqual([]);
    const lowOnly = affordableTables(45 * CHIP, all);
    expect(lowOnly.length).toBeGreaterThan(0);
    expect(lowOnly.every((r) => stakesFor(r) === LOW_STAKES)).toBe(true);
    expect(affordableTables(300 * CHIP, all)).toEqual(PUBLIC_TABLES);
  });

  it('leave out the table you are at, tables full of people, and tables whose state is not known', () => {
    const [a, b] = PUBLIC_TABLES.filter((r) => stakesFor(r) === LOW_STAKES);
    expect(affordableTables(45 * CHIP, all, a)).toEqual([b]);
    expect(affordableTables(45 * CHIP, { ...all, [a]: full }, b)).toEqual([]);
    expect(affordableTables(45 * CHIP, { [a]: null, [b]: undefined })).toEqual([]);
    // bots do not make a table full: their seats can be taken
    expect(affordableTables(45 * CHIP, { [a]: { players: 1, bots: 5, maxSeats: 6, playing: true } })).toEqual([a]);
  });
});
