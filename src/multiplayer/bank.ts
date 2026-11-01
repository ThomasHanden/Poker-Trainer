// Chips for live tables. Once per UTC day each player can claim a random 50–200 chips into their
// bank; buy-ins come out of the bank and stacks go back into it when players stand up.
// The Bank Durable Object (party/server.ts) stores one Account per player and applies these rules.

import { CHIP, bestBuyIn, buyInFor, type Stakes } from './table';

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
}

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
    guest: { ...guest, balance: 0, movedTo: accountId },
    account: { ...account, balance: account.balance + guest.balance, guestMovedFrom: guestId, ...(later ? { claim: later } : {}) },
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
  return { acc: { ...acc, balance: acc.balance + amount, claim: { day, amount } }, amount, paid: true };
}

/** Take a buy-in: as much as `want`, or everything left if that is less, but nothing below `min`. */
export function withdraw(acc: Account, want: number, min: number): { acc: Account; amount: number } {
  const amount = Math.min(want, acc.balance);
  if (amount < min || amount <= 0) return { acc, amount: 0 };
  return { acc: { ...acc, balance: acc.balance - amount }, amount };
}

export function deposit(acc: Account, amount: number): Account {
  return { ...acc, balance: acc.balance + Math.max(0, Math.floor(amount)) };
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
