// Starting-hand classes (169), combinations, and the weighted range model.
//
// Matrix convention (as in most range charts): rows/cols ordered A,K,Q,...,2.
//   row === col  -> pocket pair
//   row <  col   -> suited (upper-right triangle)
//   row >  col   -> offsuit (lower-left triangle)
//
// Range text format (see docs/RANGE_FORMAT.md):
//   tokens separated by commas; optional ":weight" (0..1 or a percentage like 50%).
//   AA, AKs, AKo, AK (= AKs + AKo), 22+, A2s+, KTo+, A5s-A2s, T9s-65s (suited connectors),
//   QQ-99, and specific combos like AsKs.

import { Card, RANKS, makeCard, rankOf, suitOf } from '../engine/cards';

export type HandClass = string; // e.g. "AKs", "T9o", "77"

export const MATRIX_RANKS = 'AKQJT98765432';

/** Rank index used by the engine (0 = deuce .. 12 = ace) for a matrix index (0 = ace). */
const m2r = (m: number) => 12 - m;

export function classAt(row: number, col: number): HandClass {
  const a = MATRIX_RANKS[row];
  const b = MATRIX_RANKS[col];
  if (row === col) return a + b;
  if (row < col) return a + b + 's';
  return b + a + 'o';
}

export const ALL_CLASSES: HandClass[] = (() => {
  const out: HandClass[] = [];
  for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) out.push(classAt(r, c));
  return out;
})();

export function classPosition(h: HandClass): { row: number; col: number } {
  const a = MATRIX_RANKS.indexOf(h[0]);
  const b = MATRIX_RANKS.indexOf(h[1]);
  if (a < 0 || b < 0) throw new Error(`Bad hand class ${h}`);
  if (h.length === 2) {
    if (a !== b) throw new Error(`Bad hand class ${h}`);
    return { row: a, col: a };
  }
  const hi = Math.min(a, b);
  const lo = Math.max(a, b);
  return h[2] === 's' ? { row: hi, col: lo } : { row: lo, col: hi };
}

export function isPair(h: HandClass) {
  return h.length === 2;
}
export function isSuited(h: HandClass) {
  return h[2] === 's';
}

export function comboCount(h: HandClass): number {
  return isPair(h) ? 6 : isSuited(h) ? 4 : 12;
}

const comboCache = new Map<HandClass, [Card, Card][]>();
export function combosOf(h: HandClass): [Card, Card][] {
  const cached = comboCache.get(h);
  if (cached) return cached;
  const r1 = RANKS.indexOf(h[0]);
  const r2 = RANKS.indexOf(h[1]);
  const out: [Card, Card][] = [];
  if (isPair(h)) {
    for (let s1 = 0; s1 < 4; s1++) for (let s2 = s1 + 1; s2 < 4; s2++) out.push([makeCard(r1, s1), makeCard(r1, s2)]);
  } else if (isSuited(h)) {
    for (let s = 0; s < 4; s++) out.push([makeCard(r1, s), makeCard(r2, s)]);
  } else {
    for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) if (s1 !== s2) out.push([makeCard(r1, s1), makeCard(r2, s2)]);
  }
  comboCache.set(h, out);
  return out;
}

/** Hand class of two specific cards. */
export function classOf(a: Card, b: Card): HandClass {
  let ra = rankOf(a);
  let rb = rankOf(b);
  if (ra === rb) return RANKS[ra] + RANKS[rb];
  if (rb > ra) [ra, rb] = [rb, ra];
  return RANKS[ra] + RANKS[rb] + (suitOf(a) === suitOf(b) ? 's' : 'o');
}

/** Weighted range: hand class -> weight in [0,1] (fraction of that class's combos included). */
export type Range = Record<HandClass, number>;

export function emptyRange(): Range {
  const r: Range = {};
  for (const h of ALL_CLASSES) r[h] = 0;
  return r;
}

export function rangeWeight(r: Range, h: HandClass): number {
  return r[h] ?? 0;
}

export const TOTAL_COMBOS = 1326;

/** Weighted combos of the range, optionally excluding combos that conflict with dead cards. */
export function rangeCombos(r: Range, dead: Card[] = []): number {
  const d = new Set(dead);
  let total = 0;
  for (const h of ALL_CLASSES) {
    const w = r[h] ?? 0;
    if (!w) continue;
    if (d.size === 0) total += w * comboCount(h);
    else for (const [a, b] of combosOf(h)) if (!d.has(a) && !d.has(b)) total += w;
  }
  return total;
}

/** Percentage of all starting combos (1326) in the range. With dead cards, relative to remaining combos. */
export function rangePercent(r: Range, dead: Card[] = []): number {
  const denom = dead.length === 0 ? TOTAL_COMBOS : availableCombos(dead);
  return (100 * rangeCombos(r, dead)) / denom;
}

export function availableCombos(dead: Card[]): number {
  const n = 52 - new Set(dead).size;
  return (n * (n - 1)) / 2;
}

export interface WeightedCombo {
  cards: [Card, Card];
  weight: number;
  cls: HandClass;
}

/** Expand a range into weighted combos with card removal applied. */
export function expandRange(r: Range, dead: Card[] = []): WeightedCombo[] {
  const d = new Set(dead);
  const out: WeightedCombo[] = [];
  for (const h of ALL_CLASSES) {
    const w = r[h] ?? 0;
    if (w <= 0) continue;
    for (const c of combosOf(h)) if (!d.has(c[0]) && !d.has(c[1])) out.push({ cards: c, weight: w, cls: h });
  }
  return out;
}

// ---------------- Parsing ----------------

const rIdx = (ch: string) => {
  const i = RANKS.indexOf(ch.toUpperCase());
  if (i < 0) throw new Error(`Unknown rank "${ch}"`);
  return i;
};

function classesForToken(tok: string): HandClass[] {
  const t = tok.trim();
  if (!t) return [];
  // specific combo like AsKs handled by caller
  const dash = t.split('-');
  if (dash.length === 2) {
    const a = parseSimple(dash[0]);
    const b = parseSimple(dash[1]);
    if (a.kind !== b.kind) throw new Error(`Range "${t}" mixes hand types`);
    if (a.kind === 'pair') {
      const [hi, lo] = a.r1 >= b.r1 ? [a.r1, b.r1] : [b.r1, a.r1];
      const out: HandClass[] = [];
      for (let r = lo; r <= hi; r++) out.push(RANKS[r] + RANKS[r]);
      return out;
    }
    const suffix = a.kind === 'suited' ? 's' : 'o';
    if (a.r1 === b.r1) {
      // A5s-A2s: fixed high card, kicker range
      const [hi, lo] = a.r2 >= b.r2 ? [a.r2, b.r2] : [b.r2, a.r2];
      const out: HandClass[] = [];
      for (let k = lo; k <= hi; k++) out.push(RANKS[a.r1] + RANKS[k] + suffix);
      return out;
    }
    const gapA = a.r1 - a.r2;
    const gapB = b.r1 - b.r2;
    if (gapA !== gapB) throw new Error(`Range "${t}" must keep the same gap (e.g. T9s-54s)`);
    const [top, bottom] = a.r1 >= b.r1 ? [a, b] : [b, a];
    const out: HandClass[] = [];
    for (let r = bottom.r1; r <= top.r1; r++) out.push(RANKS[r] + RANKS[r - gapA] + suffix);
    return out;
  }
  const plus = t.endsWith('+');
  const s = parseSimple(plus ? t.slice(0, -1) : t);
  if (s.kind === 'pair') {
    if (!plus) return [RANKS[s.r1] + RANKS[s.r1]];
    const out: HandClass[] = [];
    for (let r = s.r1; r <= 12; r++) out.push(RANKS[r] + RANKS[r]);
    return out;
  }
  const suffixes = s.kind === 'both' ? ['s', 'o'] : [s.kind === 'suited' ? 's' : 'o'];
  const out: HandClass[] = [];
  for (const suf of suffixes) {
    if (!plus) out.push(RANKS[s.r1] + RANKS[s.r2] + suf);
    else for (let k = s.r2; k < s.r1; k++) out.push(RANKS[s.r1] + RANKS[k] + suf);
  }
  return out;
}

function parseSimple(t: string): { kind: 'pair' | 'suited' | 'offsuit' | 'both'; r1: number; r2: number } {
  const x = t.trim();
  if (x.length < 2 || x.length > 3) throw new Error(`Cannot parse hand "${t}"`);
  let r1 = rIdx(x[0]);
  let r2 = rIdx(x[1]);
  if (r1 === r2) {
    if (x.length === 3) throw new Error(`Pairs cannot be suited/offsuit: "${t}"`);
    return { kind: 'pair', r1, r2 };
  }
  if (r2 > r1) [r1, r2] = [r2, r1];
  if (x.length === 2) return { kind: 'both', r1, r2 };
  const k = x[2].toLowerCase();
  if (k !== 's' && k !== 'o') throw new Error(`Unknown suffix in "${t}"`);
  return { kind: k === 's' ? 'suited' : 'offsuit', r1, r2 };
}

function parseWeight(w: string | undefined): number {
  if (w === undefined) return 1;
  const t = w.trim();
  const v = t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t);
  if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error(`Weight "${w}" must be between 0 and 1 (or 0%-100%)`);
  return v;
}

/**
 * Parse a range string. Tokens apply in order, so later tokens override earlier ones — down to
 * single combos: "AKs,AsKs:0.5" keeps three AKs combos fully and AsKs half (weight 0.875).
 * A class weight is the average weight of its combos.
 */
export function parseRange(text: string): Range {
  const r = emptyRange();
  // per-combo weights for classes touched by a specific-combo token
  const comboWeights = new Map<HandClass, number[]>();
  const tokens = text.split(/[,\n;]+/).map((t) => t.trim()).filter(Boolean);
  for (const tokRaw of tokens) {
    const [handPart, wPart] = tokRaw.split(':');
    const w = parseWeight(wPart);
    const hp = handPart.trim();
    if (/^[2-9TJQKA][cdhs][2-9TJQKA][cdhs]$/i.test(hp)) {
      const c1 = makeCard(rIdx(hp[0]), 'cdhs'.indexOf(hp[1].toLowerCase()));
      const c2 = makeCard(rIdx(hp[2]), 'cdhs'.indexOf(hp[3].toLowerCase()));
      if (c1 === c2) throw new Error(`Duplicate card in "${hp}"`);
      const cls = classOf(c1, c2);
      const combos = combosOf(cls);
      if (!comboWeights.has(cls)) comboWeights.set(cls, combos.map(() => r[cls]));
      const i = combos.findIndex(([a, b]) => (a === c1 && b === c2) || (a === c2 && b === c1));
      comboWeights.get(cls)![i] = w;
      continue;
    }
    for (const h of classesForToken(hp)) {
      r[h] = w;
      comboWeights.get(h)?.fill(w);
    }
  }
  for (const [cls, ws] of comboWeights) r[cls] = ws.reduce((a, b) => a + b, 0) / ws.length;
  return r;
}

/** Serialize a range to the documented text format (one token per class, weights rounded to 3 dp). */
export function formatRange(r: Range): string {
  const parts: string[] = [];
  for (const h of ALL_CLASSES) {
    const w = r[h] ?? 0;
    if (w <= 0) continue;
    parts.push(w >= 0.9995 ? h : `${h}:${+w.toFixed(3)}`);
  }
  return parts.join(',');
}

export function rangeFromClasses(classes: HandClass[], weight = 1): Range {
  const r = emptyRange();
  for (const h of classes) r[h] = weight;
  return r;
}

/** Union (max) of ranges. */
export function unionRange(...rs: Range[]): Range {
  const out = emptyRange();
  for (const r of rs) for (const h of ALL_CLASSES) out[h] = Math.max(out[h], r[h] ?? 0);
  return out;
}

export function subtractRange(a: Range, b: Range): Range {
  const out = emptyRange();
  for (const h of ALL_CLASSES) out[h] = Math.max(0, (a[h] ?? 0) - (b[h] ?? 0));
  return out;
}

export interface RangeComparison {
  overlapCombos: number;
  onlyA: HandClass[];
  onlyB: HandClass[];
  differentWeight: HandClass[];
  combosA: number;
  combosB: number;
  /** similarity = overlap / union (weighted Jaccard over combos) */
  similarity: number;
}

export function compareRanges(a: Range, b: Range): RangeComparison {
  let overlap = 0;
  let union = 0;
  const onlyA: HandClass[] = [];
  const onlyB: HandClass[] = [];
  const diff: HandClass[] = [];
  for (const h of ALL_CLASSES) {
    const wa = a[h] ?? 0;
    const wb = b[h] ?? 0;
    const n = comboCount(h);
    overlap += Math.min(wa, wb) * n;
    union += Math.max(wa, wb) * n;
    if (wa > 0 && wb === 0) onlyA.push(h);
    else if (wb > 0 && wa === 0) onlyB.push(h);
    else if (wa > 0 && wb > 0 && Math.abs(wa - wb) >= 0.1) diff.push(h);
  }
  return {
    overlapCombos: overlap,
    onlyA,
    onlyB,
    differentWeight: diff,
    combosA: rangeCombos(a),
    combosB: rangeCombos(b),
    similarity: union === 0 ? 1 : overlap / union,
  };
}

/** Classes whose combos are all blocked by dead cards. */
export function blockedFraction(h: HandClass, dead: Card[]): number {
  const d = new Set(dead);
  const all = combosOf(h);
  const live = all.filter(([a, b]) => !d.has(a) && !d.has(b)).length;
  return 1 - live / all.length;
}

export function describeClass(h: HandClass): string {
  const names: Record<string, string> = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: 'Ten' };
  const n = (c: string) => names[c] ?? c;
  if (isPair(h)) return `Pocket ${n(h[0])}${h[0] === '6' ? 'es' : 's'}`;
  return `${n(h[0])}-${n(h[1])} ${isSuited(h) ? 'suited' : 'offsuit'}`;
}

export { m2r };
