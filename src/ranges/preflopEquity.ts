// Access to the precomputed 169x169 preflop all-in equity table (Monte Carlo estimate; see
// scripts/gen-preflop-equity.ts for method and sample count).

import data from '../data/preflopEquity.json';
import { ALL_CLASSES, HandClass, Range, expandRange, classOf } from './hands';
import { Card } from '../engine/cards';

const N = 169;
const idx = new Map<HandClass, number>(ALL_CLASSES.map((h, i) => [h, i]));
const eqArr: number[] = (data as { equity: number[] }).equity;
const compatArr: number[] = (data as { compatiblePairs: number[] }).compatiblePairs;

export const PREFLOP_TABLE_INFO = {
  samplesPerPair: (data as { samplesPerPair: number }).samplesPerPair,
  approxStdError: (data as { approxStdError: number }).approxStdError,
};

export function classIndex(h: HandClass): number {
  const i = idx.get(h);
  if (i === undefined) throw new Error(`Unknown class ${h}`);
  return i;
}

/** Equity of class a vs class b (all-in preflop), or NaN if they cannot coexist. */
export function classEquity(a: HandClass, b: HandClass): number {
  const v = eqArr[classIndex(a) * N + classIndex(b)];
  return v < 0 ? NaN : v / 10000;
}

export function compatiblePairs(a: HandClass, b: HandClass): number {
  return compatArr[classIndex(a) * N + classIndex(b)];
}

/** Class-level equity vs a weighted range (combo-compatibility weighted). */
export function classEquityVsRange(a: HandClass, r: Range): number {
  let num = 0;
  let den = 0;
  for (const b of ALL_CLASSES) {
    const w = r[b] ?? 0;
    if (!w) continue;
    const c = compatiblePairs(a, b);
    if (!c) continue;
    num += w * c * classEquity(a, b);
    den += w * c;
  }
  return den ? num / den : NaN;
}

/**
 * Preflop all-in equity of specific hole cards vs a range, using the class table for each
 * villain combo that does not conflict with the hero's cards (approximate: suits beyond
 * card removal are averaged).
 */
export function holdingEquityVsRange(hole: Card[], r: Range): number {
  const hero = classOf(hole[0], hole[1]);
  const combos = expandRange(r, hole);
  let num = 0;
  let den = 0;
  for (const c of combos) {
    const e = classEquity(hero, c.cls);
    if (Number.isNaN(e)) continue;
    num += c.weight * e;
    den += c.weight;
  }
  return den ? num / den : NaN;
}

let vsRandom: Record<HandClass, number> | null = null;
/** Equity of each class vs a uniformly random hand. */
export function equityVsRandom(): Record<HandClass, number> {
  if (vsRandom) return vsRandom;
  const all: Range = {};
  for (const h of ALL_CLASSES) all[h] = 1;
  vsRandom = {};
  for (const h of ALL_CLASSES) vsRandom[h] = classEquityVsRange(h, all);
  return vsRandom;
}

let ranking: HandClass[] | null = null;
/**
 * A playability-adjusted preflop ordering used to widen/tighten ranges for opponent profiles.
 * Base: equity vs random; bonuses for suitedness and connectivity, which matter more than raw
 * all-in equity when hands are played postflop. Heuristic.
 */
export function preflopRanking(): HandClass[] {
  if (ranking) return ranking;
  const e = equityVsRandom();
  const score = (h: HandClass) => {
    const hi = 'AKQJT98765432'.indexOf(h[0]);
    const lo = 'AKQJT98765432'.indexOf(h[1]);
    let s = e[h];
    if (h.length === 2) s += 0.02;
    if (h[2] === 's') s += 0.03;
    const gap = lo - hi;
    if (h.length === 3) s += gap === 1 ? 0.02 : gap === 2 ? 0.012 : gap === 3 ? 0.005 : 0;
    return s;
  };
  ranking = [...ALL_CLASSES].sort((a, b) => score(b) - score(a));
  return ranking;
}
