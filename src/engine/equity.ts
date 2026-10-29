// Equity calculations. Every result reports whether it is exact (full enumeration)
// or simulated (Monte Carlo), with sample count and standard error for simulations.

import { Card, Rng, createRng, deckWithout } from './cards';
import { evaluate } from './evaluator';
import { WeightedCombo } from '../ranges/hands';

export interface EquityResult {
  equity: number; // share of the pot won on average, ties split, in [0,1]
  win: number;
  tie: number;
  method: 'exact' | 'simulation';
  samples: number; // number of (villain combo, runout) outcomes evaluated
  stdError: number; // 0 for exact
}

function combinations(cards: Card[], k: number, cb: (picked: Card[]) => void) {
  const pick: Card[] = [];
  const rec = (start: number) => {
    if (pick.length === k) {
      cb(pick);
      return;
    }
    for (let i = start; i <= cards.length - (k - pick.length); i++) {
      pick.push(cards[i]);
      rec(i + 1);
      pick.pop();
    }
  };
  rec(0);
}

/** Exact or simulated equity of hero vs one known hand. */
export function equityVsHand(hero: Card[], villain: Card[], board: Card[], opts: { samples?: number; rng?: Rng } = {}): EquityResult {
  return equityVsRange(hero, [{ cards: villain as [Card, Card], weight: 1, cls: '' }], board, opts);
}

/**
 * Hero equity vs a weighted range of combos (already filtered for card removal or not;
 * conflicting combos are skipped here).
 * Exact when the board has 4+ cards, or on the flop when combos * runouts is small.
 */
export function equityVsRange(
  hero: Card[],
  combos: WeightedCombo[],
  board: Card[],
  opts: { samples?: number; rng?: Rng; forceExact?: boolean } = {},
): EquityResult {
  const dead = new Set([...hero, ...board]);
  const live = combos.filter((c) => c.weight > 0 && !dead.has(c.cards[0]) && !dead.has(c.cards[1]));
  if (live.length === 0) return { equity: NaN, win: 0, tie: 0, method: 'exact', samples: 0, stdError: 0 };
  const need = 5 - board.length;
  const remaining = 52 - dead.size - 2;
  const runouts = need === 0 ? 1 : need === 1 ? remaining : need === 2 ? (remaining * (remaining - 1)) / 2 : Infinity;
  const exactCost = live.length * runouts;
  if (opts.forceExact || (need <= 2 && exactCost <= 400_000)) return exactEquity(hero, live, board);
  return simulatedEquity(hero, live, board, opts.samples ?? 20000, opts.rng ?? createRng(12345));
}

function exactEquity(hero: Card[], live: WeightedCombo[], board: Card[]): EquityResult {
  let wSum = 0;
  let winW = 0;
  let tieW = 0;
  let eqW = 0;
  let samples = 0;
  const need = 5 - board.length;
  for (const v of live) {
    const deck = deckWithout([...hero, ...board, ...v.cards]);
    let n = 0;
    let wins = 0;
    let ties = 0;
    const runout = (extra: Card[]) => {
      const b = [...board, ...extra];
      const h = evaluate([...hero, ...b]);
      const o = evaluate([...v.cards, ...b]);
      n++;
      if (h > o) wins++;
      else if (h === o) ties++;
    };
    if (need === 0) runout([]);
    else combinations(deck, need, runout);
    samples += n;
    wSum += v.weight;
    winW += (v.weight * wins) / n;
    tieW += (v.weight * ties) / n;
    eqW += (v.weight * (wins + ties / 2)) / n;
  }
  return { equity: eqW / wSum, win: winW / wSum, tie: tieW / wSum, method: 'exact', samples, stdError: 0 };
}

function buildSampler(live: WeightedCombo[]) {
  const cum: number[] = [];
  let t = 0;
  for (const c of live) {
    t += c.weight;
    cum.push(t);
  }
  return (rng: Rng) => {
    const x = rng.next() * t;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] > x) hi = mid;
      else lo = mid + 1;
    }
    return live[lo];
  };
}

function simulatedEquity(hero: Card[], live: WeightedCombo[], board: Card[], samples: number, rng: Rng): EquityResult {
  const sample = buildSampler(live);
  const need = 5 - board.length;
  const baseDead = new Set([...hero, ...board]);
  const baseDeck = deckWithout(baseDead);
  let sum = 0;
  let sumSq = 0;
  let wins = 0;
  let ties = 0;
  const b = new Array(5);
  for (let i = 0; i < board.length; i++) b[i] = board[i];
  for (let s = 0; s < samples; s++) {
    const v = sample(rng);
    // draw runout from remaining deck without the villain cards (partial Fisher-Yates)
    const deck = baseDeck.filter((c) => c !== v.cards[0] && c !== v.cards[1]);
    for (let k = 0; k < need; k++) {
      const j = k + rng.int(deck.length - k);
      const tmp = deck[k];
      deck[k] = deck[j];
      deck[j] = tmp;
      b[board.length + k] = deck[k];
    }
    const h = evaluate([hero[0], hero[1], ...b]);
    const o = evaluate([v.cards[0], v.cards[1], ...b]);
    const x = h > o ? 1 : h === o ? 0.5 : 0;
    if (x === 1) wins++;
    else if (x === 0.5) ties++;
    sum += x;
    sumSq += x * x;
  }
  const mean = sum / samples;
  const variance = Math.max(0, sumSq / samples - mean * mean);
  return {
    equity: mean,
    win: wins / samples,
    tie: ties / samples,
    method: 'simulation',
    samples,
    stdError: Math.sqrt(variance / samples),
  };
}

/** Multiway equity by Monte Carlo: hero vs several independent weighted ranges, with card removal between all players. */
export function equityMultiway(hero: Card[], ranges: WeightedCombo[][], board: Card[], samples = 10000, rng: Rng = createRng(777)): EquityResult {
  if (ranges.length === 1) return equityVsRange(hero, ranges[0], board, { samples, rng });
  const dead = new Set([...hero, ...board]);
  const samplers = ranges.map((r) => buildSampler(r.filter((c) => c.weight > 0 && !dead.has(c.cards[0]) && !dead.has(c.cards[1]))));
  const need = 5 - board.length;
  let sum = 0;
  let sumSq = 0;
  let wins = 0;
  let ties = 0;
  let done = 0;
  let attempts = 0;
  while (done < samples && attempts < samples * 20) {
    attempts++;
    const used = new Set(dead);
    const hands: Card[][] = [];
    let ok = true;
    for (const smp of samplers) {
      const v = smp(rng);
      if (used.has(v.cards[0]) || used.has(v.cards[1])) {
        ok = false;
        break;
      }
      used.add(v.cards[0]);
      used.add(v.cards[1]);
      hands.push(v.cards);
    }
    if (!ok) continue;
    const deck = deckWithout(used);
    const b = [...board];
    for (let k = 0; k < need; k++) {
      const j = k + rng.int(deck.length - k);
      [deck[k], deck[j]] = [deck[j], deck[k]];
      b.push(deck[k]);
    }
    const h = evaluate([...hero, ...b]);
    let best = -1;
    let bestCount = 0;
    for (const v of hands) {
      const o = evaluate([...v, ...b]);
      if (o > best) {
        best = o;
        bestCount = 1;
      } else if (o === best) bestCount++;
    }
    let x = 0;
    if (h > best) {
      x = 1;
      wins++;
    } else if (h === best) {
      x = 1 / (bestCount + 1);
      ties++;
    }
    sum += x;
    sumSq += x * x;
    done++;
  }
  const mean = done ? sum / done : NaN;
  const variance = done ? Math.max(0, sumSq / done - mean * mean) : 0;
  return { equity: mean, win: done ? wins / done : 0, tie: done ? ties / done : 0, method: 'simulation', samples: done, stdError: done ? Math.sqrt(variance / done) : 0 };
}

// ---------------- Basic decision math (exact, given the stated assumptions) ----------------

/** Break-even equity to call: call / (pot after the call). `pot` includes the bet faced. */
export function potOddsRequiredEquity(pot: number, toCall: number): number {
  if (toCall <= 0) return 0;
  return toCall / (pot + toCall);
}

/** Minimum defense frequency vs a bet of size `bet` into `pot` (pot before the bet). Simplified one-street model. */
export function minimumDefenseFrequency(pot: number, bet: number): number {
  return pot / (pot + bet);
}

/** Break-even fold frequency for a pure bluff: bet / (pot + bet). */
export function bluffBreakEven(pot: number, bet: number): number {
  return bet / (pot + bet);
}

/**
 * Simplified river model: bettor's bluff share of the betting range that makes a bluff-catcher indifferent.
 * bluffs / (value + bluffs) = bet / (pot + 2*bet).
 */
export function indifferentBluffShare(pot: number, bet: number): number {
  return bet / (pot + 2 * bet);
}

/** EV of calling (chips, relative to folding) when the call ends the action (e.g. all-in or river). */
export function callEV(pot: number, toCall: number, equity: number): number {
  return equity * (pot + toCall) - toCall;
}

/**
 * EV of a shove (relative to folding) in a one-decision model.
 * potBefore: chips in the middle before the shove (including blinds/antes);
 * risk: chips the shover adds; callAmount: chips the caller adds;
 * foldProb: probability everyone folds; equityWhenCalled: shover's equity vs the calling range.
 * Chips already committed by the shover are treated as sunk (EV measured from the decision point).
 */
export function shoveEV(potBefore: number, risk: number, callAmount: number, foldProb: number, equityWhenCalled: number): number {
  const finalPot = potBefore + risk + callAmount;
  return foldProb * potBefore + (1 - foldProb) * (equityWhenCalled * finalPot - risk);
}

/** Rough "rule of 2 and 4" approximation from outs, plus the exact value for comparison. */
export function outsEquity(outs: number, cardsToCome: 1 | 2, unseen = cardsToCome === 2 ? 47 : 46) {
  const exact = cardsToCome === 1 ? outs / unseen : 1 - ((unseen - outs) / unseen) * ((unseen - 1 - outs) / (unseen - 1));
  return { approx: outs * (cardsToCome === 2 ? 0.04 : 0.02), exact };
}

/** Wilson-style 95% interval half-width for a simulated mean (normal approximation). */
export function ci95(stdError: number): number {
  return 1.96 * stdError;
}
