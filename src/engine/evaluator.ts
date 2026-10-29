// Hand evaluator for 5 to 7 cards. Returns a comparable integer: higher is better,
// equal scores tie. Score = category * 16^5 + up to five tiebreak ranks (base 16).

import { Card, rankOf, suitOf } from './cards';

export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
}

export const CATEGORY_NAMES = [
  'High card',
  'One pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
];

const B = 16;
const CAT = B ** 5;

function encode(cat: number, ranks: number[]): number {
  let v = 0;
  for (let i = 0; i < 5; i++) v = v * B + (ranks[i] ?? 0);
  return cat * CAT + v;
}

/** Highest straight in a 13-bit rank mask, returning its top rank, or -1. Handles the wheel (A-2-3-4-5). */
export function straightHigh(mask: number): number {
  for (let top = 12; top >= 4; top--) {
    const need = 0b11111 << (top - 4);
    if ((mask & need) === need) return top;
  }
  const wheel = (1 << 12) | 0b1111;
  if ((mask & wheel) === wheel) return 3; // five-high
  return -1;
}

function topBits(mask: number, n: number, exclude = 0): number[] {
  const out: number[] = [];
  for (let r = 12; r >= 0 && out.length < n; r--) {
    if (mask & (1 << r) && !(exclude & (1 << r))) out.push(r);
  }
  return out;
}

export function evaluate(cards: readonly Card[]): number {
  const n = cards.length;
  if (n < 5 || n > 7) throw new Error(`evaluate needs 5-7 cards, got ${n}`);
  const counts = new Array(13).fill(0);
  const suitMasks = [0, 0, 0, 0];
  const suitCounts = [0, 0, 0, 0];
  let mask = 0;
  for (let i = 0; i < n; i++) {
    const r = rankOf(cards[i]);
    const s = suitOf(cards[i]);
    counts[r]++;
    suitMasks[s] |= 1 << r;
    suitCounts[s]++;
    mask |= 1 << r;
  }

  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCounts[s] >= 5) flushSuit = s;

  if (flushSuit >= 0) {
    const sf = straightHigh(suitMasks[flushSuit]);
    if (sf >= 0) return encode(HandCategory.StraightFlush, [sf]);
  }

  let quad = -1;
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 12; r >= 0; r--) {
    if (counts[r] === 4) quad = r;
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
  }

  if (quad >= 0) {
    const kicker = topBits(mask, 1, 1 << quad);
    return encode(HandCategory.Quads, [quad, ...kicker]);
  }
  if (trips.length >= 2) return encode(HandCategory.FullHouse, [trips[0], trips[1]]);
  if (trips.length === 1 && pairs.length >= 1) return encode(HandCategory.FullHouse, [trips[0], pairs[0]]);
  if (flushSuit >= 0) return encode(HandCategory.Flush, topBits(suitMasks[flushSuit], 5));
  const st = straightHigh(mask);
  if (st >= 0) return encode(HandCategory.Straight, [st]);
  if (trips.length === 1) {
    return encode(HandCategory.Trips, [trips[0], ...topBits(mask, 2, 1 << trips[0])]);
  }
  if (pairs.length >= 2) {
    const ex = (1 << pairs[0]) | (1 << pairs[1]);
    return encode(HandCategory.TwoPair, [pairs[0], pairs[1], ...topBits(mask, 1, ex)]);
  }
  if (pairs.length === 1) {
    return encode(HandCategory.Pair, [pairs[0], ...topBits(mask, 3, 1 << pairs[0])]);
  }
  return encode(HandCategory.HighCard, topBits(mask, 5));
}

export function categoryOf(score: number): HandCategory {
  return Math.floor(score / CAT) as HandCategory;
}

export function describeScore(score: number): string {
  const cat = categoryOf(score);
  let rest = score % CAT;
  const ranks: number[] = [];
  for (let i = 0; i < 5; i++) {
    ranks.unshift(rest % B);
    rest = Math.floor(rest / B);
  }
  const name = (r: number) => RANK_WORDS[r];
  const plural = (r: number) => (r === 4 ? 'Sixes' : name(r) + 's');
  switch (cat) {
    case HandCategory.StraightFlush:
      return ranks[0] === 12 ? 'Royal flush' : `Straight flush, ${name(ranks[0])} high`;
    case HandCategory.Quads:
      return `Four ${plural(ranks[0])}`;
    case HandCategory.FullHouse:
      return `Full house, ${plural(ranks[0])} full of ${plural(ranks[1])}`;
    case HandCategory.Flush:
      return `Flush, ${name(ranks[0])} high`;
    case HandCategory.Straight:
      return `Straight, ${name(ranks[0])} high`;
    case HandCategory.Trips:
      return `Three ${plural(ranks[0])}`;
    case HandCategory.TwoPair:
      return `Two pair, ${plural(ranks[0])} and ${plural(ranks[1])}`;
    case HandCategory.Pair:
      return `Pair of ${plural(ranks[0])}`;
    default:
      return `${name(ranks[0])} high`;
  }
}

export const RANK_WORDS = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];

/** Compare two hands on the same board; >0 if a wins. */
export function compareHands(a: Card[], b: Card[], board: Card[]): number {
  return evaluate([...a, ...board]) - evaluate([...b, ...board]);
}
