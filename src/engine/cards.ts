// Card primitives. A card is an integer 0..51: rank = card >> 2 (0 = deuce .. 12 = ace),
// suit = card & 3 (0 = clubs, 1 = diamonds, 2 = hearts, 3 = spades).

export type Card = number;

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
export const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'];

export const rankOf = (c: Card): number => c >> 2;
export const suitOf = (c: Card): number => c & 3;
export const makeCard = (rank: number, suit: number): Card => (rank << 2) | suit;

export function cardToString(c: Card): string {
  return RANKS[rankOf(c)] + SUITS[suitOf(c)];
}

export function parseCard(s: string): Card {
  if (s.length !== 2) throw new Error(`Invalid card "${s}"`);
  const r = RANKS.indexOf(s[0].toUpperCase());
  const su = SUITS.indexOf(s[1].toLowerCase());
  if (r < 0 || su < 0) throw new Error(`Invalid card "${s}"`);
  return makeCard(r, su);
}

/** Parse "AsKd" or "As Kd" or "As,Kd" into cards. */
export function parseCards(s: string): Card[] {
  const clean = s.replace(/[\s,]/g, '');
  if (clean.length % 2 !== 0) throw new Error(`Invalid card list "${s}"`);
  const out: Card[] = [];
  for (let i = 0; i < clean.length; i += 2) out.push(parseCard(clean.slice(i, i + 2)));
  assertUnique(out);
  return out;
}

export function cardsToString(cards: Card[]): string {
  return cards.map(cardToString).join(' ');
}

export function assertUnique(cards: Card[]): void {
  const seen = new Set<number>();
  for (const c of cards) {
    if (c < 0 || c > 51 || !Number.isInteger(c)) throw new Error(`Invalid card value ${c}`);
    if (seen.has(c)) throw new Error(`Duplicate card ${cardToString(c)}`);
    seen.add(c);
  }
}

export function fullDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => i);
}

export function deckWithout(dead: Iterable<Card>): Card[] {
  const d = new Set(dead);
  return fullDeck().filter((c) => !d.has(c));
}

// ---------- Seeded RNG (mulberry32) ----------
export interface Rng {
  next(): number; // [0,1)
  int(n: number): number; // [0,n)
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: T[]): T[];
  seed: number;
}

export function hashString(s: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createRng(seed: number | string): Rng {
  let a = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  const initial = a;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    seed: initial,
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T,>(arr: readonly T[]) => {
      if (arr.length === 0) throw new Error('pick from empty array');
      return arr[Math.floor(next() * arr.length)];
    },
    shuffle: <T,>(arr: T[]) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
  return rng;
}

/** Derive an independent child RNG from a parent seed and a label. */
export function childRng(seed: number, label: string): Rng {
  return createRng(hashString(`${seed}:${label}`));
}
