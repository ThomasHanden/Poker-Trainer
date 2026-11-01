// Chips for live tables. Once per UTC day each player can claim a random 50–200 chips into their
// bank; buy-ins come out of the bank and stacks go back into it when players stand up.
// The Bank Durable Object (party/server.ts) stores one Account per player and applies these rules.
// It also knows what each table holds for each player (TableHold), so a player's chips can be
// counted once, wherever they are, for the chip leaderboard.

import { CHIP, bestBuyIn, buyInFor, type Cashout, type Stakes } from './table';

/** The daily claim in whole chips: every amount from DAILY_MIN to DAILY_MAX is equally likely. */
export const DAILY_MIN = 50;
export const DAILY_MAX = 200;

export interface Account {
  /** chips in the bank, in table units */
  balance: number;
  /** the last daily claim: its UTC day and what it paid (table units; 0 when it was the old top-up) */
  claim?: { day: string; amount: number };
  /** accounts from before claims: the UTC day the old automatic top-up last ran (see upgrade) */
  day?: string;
  /** a signed-in account: the guest wallet whose chips were moved into it (once only) */
  guestMovedFrom?: string;
  /** a guest wallet: the account its chips were moved into */
  movedTo?: string;
  /** chips this player has on live tables right now, in table units (the sum of every TableHold) */
  atTables?: number;
  /** goes up by one with every change, so the leaderboard never takes an older copy over a newer one */
  v?: number;
}

/**
 * What one table holds for people, as of its latest report. A table reports after every change
 * (seq goes up each time), so an older report that arrives late is ignored.
 */
export interface TableHold {
  seq: number;
  held: Record<string, number>;
  /** the reports already applied, so one sent again (a retry) pays nothing twice */
  recent?: number[];
}

/** All of a player's chips: the bank and the tables, each chip counted once. */
export const totalChips = (acc: Account) => acc.balance + (acc.atTables ?? 0);

/** The account after a change, with its version moved on. */
const changed = (acc: Account, patch: Partial<Account>): Account => ({ ...acc, ...patch, v: (acc.v ?? 0) + 1 });

/** What the player is shown. */
export interface BankStatus {
  balance: number;
  claimedToday: boolean;
  /** today's claim, if any (amount 0 when the old daily top-up counted as today's claim) */
  claim: { day: string; amount: number } | null;
  /** when the player can claim again: now if they have not claimed today, else the next UTC midnight */
  nextClaimAt: number;
  /** an account that has already taken in a guest wallet, or a guest wallet already moved */
  guestMoved: boolean;
}

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function nextUtcMidnight(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/**
 * The account as stored today. New players start with nothing until they claim. Accounts from the
 * old automatic top-up keep their balance, and the day it last ran counts as that day's claim.
 */
export function upgrade(acc: Account | undefined): Account {
  if (!acc) return { balance: 0 };
  if (acc.day === undefined) return acc;
  const { day, ...rest } = acc;
  return { ...rest, claim: rest.claim ?? { day, amount: 0 } };
}

export function status(acc: Account, now: number): BankStatus {
  const claimedToday = acc.claim?.day === utcDay(now);
  return {
    balance: acc.balance,
    claimedToday,
    claim: claimedToday ? acc.claim! : null,
    nextClaimAt: claimedToday ? nextUtcMidnight(now) : now,
    guestMoved: !!(acc.guestMovedFrom || acc.movedTo),
  };
}

/**
 * Move a guest's chips (their browser key's bank) into their account: once per account and once
 * per guest wallet, and only what the server holds, so nothing the browser says counts. The chips
 * move rather than copy, and the later of the two daily claims stays, so nobody gets a second
 * claim that day.
 */
export function moveGuestChips(
  guest: Account,
  guestId: string,
  account: Account,
  accountId: string,
): { guest: Account; account: Account; moved: number } | { error: string } {
  if (account.guestMovedFrom) return { error: 'This account has already taken in chips from a guest. It can do that only once.' };
  if (guest.movedTo) return { error: 'These guest chips have already been moved to an account.' };
  if (guest.balance <= 0) return { error: 'There are no guest chips to move.' };
  const later = !account.claim ? guest.claim : !guest.claim ? account.claim : guest.claim.day > account.claim.day ? guest.claim : account.claim;
  return {
    guest: changed(guest, { balance: 0, movedTo: accountId }),
    account: changed(account, { balance: account.balance + guest.balance, guestMovedFrom: guestId, ...(later ? { claim: later } : {}) }),
    moved: guest.balance,
  };
}

/** A whole number of chips from DAILY_MIN to DAILY_MAX. Rejection sampling, so no amount comes up more often. */
export function rollDaily(rand32: () => number): number {
  const span = DAILY_MAX - DAILY_MIN + 1;
  const limit = Math.floor(2 ** 32 / span) * span;
  for (;;) {
    const r = rand32() >>> 0;
    if (r < limit) return DAILY_MIN + (r % span);
  }
}

/**
 * Claim today's chips. Claiming again the same day pays nothing and gives back the first claim's
 * amount, so a retried request shows the same reward instead of a new one.
 */
export function claimDaily(acc: Account, day: string, roll: () => number): { acc: Account; amount: number; paid: boolean } {
  if (acc.claim?.day === day) return { acc, amount: acc.claim.amount, paid: false };
  const amount = roll() * CHIP;
  return { acc: changed(acc, { balance: acc.balance + amount, claim: { day, amount } }), amount, paid: true };
}

/** Take a buy-in: as much as `want`, or everything left if that is less, but nothing below `min`. */
export function withdraw(acc: Account, want: number, min: number): { acc: Account; amount: number } {
  const amount = Math.min(want, acc.balance);
  if (amount < min || amount <= 0) return { acc, amount: 0 };
  return { acc: changed(acc, { balance: acc.balance - amount }), amount };
}

export function deposit(acc: Account, amount: number): Account {
  return changed(acc, { balance: acc.balance + Math.max(0, Math.floor(amount)) });
}

const units = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

/** A table's chips for each person, added up (a list may name someone twice). */
function heldMap(list: Cashout[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of list) if (typeof c.id === 'string' && units(c.amount) > 0) out[c.id] = (out[c.id] ?? 0) + units(c.amount);
  return out;
}

/**
 * A buy-in taken to a table: out of the bank and onto that table, in one step, so the player's
 * total never dips or doubles while they sit down.
 */
export function buyIn(acc: Account, hold: TableHold | undefined, pid: string, want: number, min: number): { acc: Account; hold: TableHold; amount: number } {
  const h = hold ?? { seq: 0, held: {} };
  const w = withdraw(acc, want, min);
  if (!w.amount) return { acc, hold: h, amount: 0 };
  return {
    acc: { ...w.acc, atTables: (acc.atTables ?? 0) + w.amount },
    hold: { ...h, held: { ...h.held, [pid]: (h.held[pid] ?? 0) + w.amount } },
    amount: w.amount,
  };
}

/** A buy-in that never reached a seat (the seat went meanwhile) comes back off the table. */
export function returnBuyIn(acc: Account, hold: TableHold | undefined, pid: string, amount: number): { acc: Account; hold: TableHold } {
  const h = hold ?? { seq: 0, held: {} };
  const back = Math.min(units(amount), h.held[pid] ?? 0);
  const { [pid]: was = 0, ...rest } = h.held;
  const left = was - back;
  return {
    acc: changed(acc, { balance: acc.balance + units(amount), atTables: Math.max(0, (acc.atTables ?? 0) - back) }),
    hold: { ...h, held: left > 0 ? { ...rest, [pid]: left } : rest },
  };
}

/**
 * A table's report: chips paid back to people who stood up, and what it now holds for everyone
 * still there. A report already applied (sent again after a lost reply) changes nothing. The
 * pay-outs of any other report count; its holdings replace the last report's only if it is newer,
 * so a late report cannot bring back chips already paid out. Returns the accounts it changed.
 */
export function settleTable(
  accounts: Map<string, Account>,
  hold: TableHold | undefined,
  seq: number,
  cashouts: Cashout[],
  held: Cashout[],
): { accounts: Map<string, Account>; hold: TableHold } {
  const out = new Map<string, Account>();
  const before = hold ?? { seq: 0, held: {} };
  if (before.recent?.includes(seq)) return { accounts: out, hold: before };
  const h = { ...before, recent: [...(before.recent ?? []), seq].slice(-100) };
  const get = (id: string) => out.get(id) ?? upgrade(accounts.get(id));
  for (const [id, amount] of Object.entries(heldMap(cashouts))) {
    const acc = get(id);
    out.set(id, changed(acc, { balance: acc.balance + amount }));
  }
  if (!(seq > h.seq)) return { accounts: out, hold: h };
  const now = heldMap(held);
  for (const id of new Set([...Object.keys(h.held), ...Object.keys(now)])) {
    const diff = (now[id] ?? 0) - (h.held[id] ?? 0);
    if (!diff) continue;
    const acc = get(id);
    out.set(id, changed(acc, { atTables: Math.max(0, (acc.atTables ?? 0) + diff) }));
  }
  return { accounts: out, hold: { ...h, seq, held: now } };
}

/**
 * A table that restarted lost its game: everything it held goes back to each player's bank (an
 * unfinished hand is called off, so stacks are what they were before it). Doing this twice pays
 * nothing more, because the holdings are cleared.
 */
export function releaseTable(accounts: Map<string, Account>, hold: TableHold | undefined): { accounts: Map<string, Account>; hold: TableHold | undefined } {
  if (!hold) return { accounts: new Map(), hold };
  const out = new Map<string, Account>();
  for (const [id, amount] of Object.entries(hold.held)) {
    const acc = upgrade(accounts.get(id));
    out.set(id, changed(acc, { balance: acc.balance + amount, atTables: Math.max(0, (acc.atTables ?? 0) - amount) }));
  }
  return { accounts: out, hold: { ...hold, held: {} } };
}

/** A player's key is a random secret kept in their browser; tables and the bank only ever see this hash of it. */
export const KEY_PATTERN = /^[A-Za-z0-9-]{20,100}$/;

export async function playerId(key: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
  return Array.from(bytes.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Today's claim is still to come and even the smallest one covers what this table needs, so
 * claiming and sitting down can be offered as one step (otherwise the claim comes first, with no
 * promise of a seat).
 */
export function claimCovers(st: Stakes, bank: { balance: number; claimedToday?: boolean }): boolean {
  const { min } = buyInFor(st);
  return bank.balance < min && bank.claimedToday === false && bank.balance + DAILY_MIN * CHIP >= min;
}

/** After claiming: sit down with as much as the table allows, or null when the balance still falls short. */
export function buyInAfterClaim(st: Stakes, balance: number): number | null {
  const units = bestBuyIn(st, balance);
  return units >= buyInFor(st).min ? units : null;
}
