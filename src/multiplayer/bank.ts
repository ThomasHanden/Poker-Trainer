// Daily chips for live tables: each player gets a daily amount, buys in from it and cashes out to it.
// The Bank Durable Object (party/server.ts) stores one Account per player and applies these rules.

import { CHIP } from './table';

/** Chips everyone has each day (in table units). Winnings above it are kept; a lower balance is topped up. */
export const DAILY = 1000 * CHIP;

export interface Account {
  balance: number;
  /** UTC day (YYYY-MM-DD) the balance was last topped up */
  day: string;
}

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Next UTC midnight, when balances refill. */
export function nextRefill(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** The account as of `day`: new players start with the daily amount; a new day tops it back up. */
export function refresh(acc: Account | undefined, day: string): Account {
  if (!acc) return { balance: DAILY, day };
  if (acc.day !== day) return { balance: Math.max(acc.balance, DAILY), day };
  return acc;
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
