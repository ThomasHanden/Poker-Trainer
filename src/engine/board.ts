// Board texture and hand-strength descriptions. Pure functions of public cards plus one holding;
// opponent policies call these with their own holding only.

import { Card, rankOf, suitOf, RANKS, deckWithout } from './cards';
import { evaluate, categoryOf, HandCategory, straightHigh } from './evaluator';

export interface Texture {
  label: string; // short human label, e.g. "A-high dry rainbow"
  highRank: number;
  paired: boolean;
  trips: boolean;
  monotone: boolean;
  twoTone: boolean;
  rainbow: boolean;
  flushPossible: boolean; // 3+ of a suit on board
  flushDrawPossible: boolean; // exactly 2 of a suit (flop/turn)
  straightPossible: boolean; // some two-card holding makes a straight now
  connected: number; // 0..3: how many straight-draw combinations the board allows (coarse)
  closePairs: number; // pairs of distinct board ranks within 3 of each other
  wetness: number; // 0 (very dry) .. 1 (very wet)
  broadwayCount: number; // T+ cards on board
  lowBoard: boolean; // highest card 9 or lower
  category: 'dry-high' | 'dry-low' | 'wet-high' | 'wet-low' | 'paired' | 'monotone' | 'medium';
}

const textureCache = new Map<string, Texture>();

export function boardTexture(board: Card[]): Texture {
  const key = board.join(',');
  const hit = textureCache.get(key);
  if (hit) return hit;
  const t = computeTexture(board);
  if (textureCache.size > 2000) textureCache.clear();
  textureCache.set(key, t);
  return t;
}

function computeTexture(board: Card[]): Texture {
  const ranks = board.map(rankOf).sort((a, b) => b - a);
  const suits = [0, 0, 0, 0];
  for (const c of board) suits[suitOf(c)]++;
  const maxSuit = Math.max(...suits);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const paired = [...counts.values()].some((v) => v >= 2);
  const trips = [...counts.values()].some((v) => v >= 3);
  const uniq = [...new Set(ranks)];
  // connectedness: count of distinct 5-rank windows containing >= 3 board ranks
  let windows = 0;
  for (let top = 12; top >= 3; top--) {
    const win = top === 3 ? [12, 0, 1, 2, 3] : [top, top - 1, top - 2, top - 3, top - 4];
    const k = uniq.filter((r) => win.includes(r)).length;
    if (k >= 3) windows++;
  }
  const mask = uniq.reduce((m, r) => m | (1 << r), 0);
  let straightPossible = false;
  // any two extra ranks completing a straight
  for (let a = 0; a < 13 && !straightPossible; a++)
    for (let b = a; b < 13 && !straightPossible; b++) if (straightHigh(mask | (1 << a) | (1 << b)) >= 0 && board.length >= 3) straightPossible = true;
  const connected = Math.min(3, windows);
  // close rank pairs (distance <= 3, ace counted high) make straight draws likely
  let closePairs = 0;
  for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) if (Math.abs(uniq[i] - uniq[j]) <= 3) closePairs++;
  const flushPossible = maxSuit >= 3;
  const flushDrawPossible = maxSuit === 2 && board.length <= 4;
  const monotone = board.length >= 3 && maxSuit === board.length;
  const rainbow = maxSuit === 1 || (board.length === 4 && maxSuit === 1);
  const twoTone = maxSuit === 2;
  const broadwayCount = ranks.filter((r) => r >= 8).length;
  const highRank = ranks[0] ?? 0;
  let wetness = 0;
  wetness += connected * 0.18 + closePairs * 0.08;
  wetness += flushPossible ? 0.35 : flushDrawPossible ? 0.2 : 0;
  wetness += broadwayCount >= 2 ? 0.1 : 0;
  wetness -= paired ? 0.15 : 0;
  wetness = Math.max(0, Math.min(1, wetness));
  let category: Texture['category'];
  if (monotone) category = 'monotone';
  else if (paired) category = 'paired';
  else if (wetness >= 0.45) category = highRank >= 9 ? 'wet-high' : 'wet-low';
  else if (wetness <= 0.25) category = highRank >= 9 ? 'dry-high' : 'dry-low';
  else category = 'medium';
  const hiName = RANKS[highRank] === 'T' ? '10' : RANKS[highRank];
  const suitLabel = monotone ? 'monotone' : flushPossible ? 'three-flush' : twoTone ? 'two-tone' : 'rainbow';
  const shape = paired ? 'paired' : wetness >= 0.45 ? 'connected' : wetness <= 0.25 ? 'dry' : 'semi-connected';
  return {
    label: `${hiName}-high ${shape} ${suitLabel}`,
    highRank,
    paired,
    trips,
    monotone,
    twoTone,
    rainbow,
    flushPossible,
    flushDrawPossible,
    straightPossible,
    connected,
    closePairs,
    wetness,
    broadwayCount,
    lowBoard: highRank <= 7,
    category,
  };
}

// --------- Strength percentile vs all other holdings (board-only knowledge) ---------

const pctCache = new Map<string, Int32Array>();

/** Sorted scores of every possible holding on this board (cached). Board must have 3-5 cards. */
function sortedScores(board: Card[]): Int32Array {
  const key = board.slice().sort((a, b) => a - b).join(',');
  const hit = pctCache.get(key);
  if (hit) return hit;
  const deck = deckWithout(board);
  const scores: number[] = [];
  for (let i = 0; i < deck.length; i++)
    for (let j = i + 1; j < deck.length; j++) scores.push(evaluateCurrent([deck[i], deck[j]], board));
  const arr = Int32Array.from(scores.sort((a, b) => a - b));
  if (pctCache.size > 2500) pctCache.clear();
  pctCache.set(key, arr);
  return arr;
}

/** Current made-hand score using 5, 6 or 7 cards. On a 3-card board the hand is exactly 5 cards. */
export function evaluateCurrent(hole: Card[], board: Card[]): number {
  return evaluate([...hole, ...board]);
}

/**
 * Fraction of all other two-card holdings (not conflicting with the board) that this holding beats
 * right now, ties counted half. 1.0 = the current nuts. Ignores future cards.
 */
export function strengthPercentile(hole: Card[], board: Card[]): number {
  const arr = sortedScores(board);
  const s = evaluateCurrent(hole, board);
  // binary search lower and upper bounds
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] < s) lo = m + 1;
    else hi = m;
  }
  const below = lo;
  lo = below;
  hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= s) lo = m + 1;
    else hi = m;
  }
  const equal = lo - below;
  // the holding itself is counted inside `equal`; exclude it
  return (below + Math.max(0, equal - 1) / 2) / Math.max(1, arr.length - 1);
}

// --------- Draws ---------

export interface DrawInfo {
  flushDraw: boolean;
  nutFlushDraw: boolean;
  openEnded: boolean; // includes double gutshots (8 straight outs)
  gutshot: boolean;
  backdoorFlush: boolean;
  /** cards that improve the hand to a straight or better using at least one hole card */
  strongOuts: number;
  /** cards that make two pair or trips using hole cards (weaker outs) */
  weakOuts: number;
  /** rough equity from strong outs alone */
  drawEquity: number;
}

export function drawInfo(hole: Card[], board: Card[]): DrawInfo {
  const none: DrawInfo = { flushDraw: false, nutFlushDraw: false, openEnded: false, gutshot: false, backdoorFlush: false, strongOuts: 0, weakOuts: 0, drawEquity: 0 };
  if (board.length < 3 || board.length >= 5) return none;
  const all = [...hole, ...board];
  const suitCount = [0, 0, 0, 0];
  for (const c of all) suitCount[suitOf(c)]++;
  let flushDraw = false;
  let nutFlushDraw = false;
  let backdoorFlush = false;
  for (let s = 0; s < 4; s++) {
    const holeIn = hole.filter((c) => suitOf(c) === s);
    if (suitCount[s] === 4 && holeIn.length >= 1) {
      flushDraw = true;
      // nut flush draw: holds the highest missing card of the suit
      const present = new Set(all.filter((c) => suitOf(c) === s).map(rankOf));
      let top = 12;
      while (present.has(top) && !holeIn.some((c) => rankOf(c) === top)) top--;
      if (holeIn.some((c) => rankOf(c) === top)) nutFlushDraw = true;
    }
    if (suitCount[s] === 3 && holeIn.length >= 1 && board.length === 3) backdoorFlush = true;
  }
  const current = evaluateCurrent(hole, board);
  const curCat = categoryOf(current);
  const deck = deckWithout(all);
  let strong = 0;
  let weak = 0;
  const straightRanks = new Set<number>();
  const boardMask = board.reduce((m, c) => m | (1 << rankOf(c)), 0);
  for (const c of deck) {
    const nb = [...board, c];
    const sc = evaluate([...hole, ...nb]);
    const cat = categoryOf(sc);
    // the improvement must involve hole cards: compare with board-only + best kicker logic
    const boardOnly = nb.length >= 5 ? evaluate(nb) : -1;
    const usesHole = boardOnly < 0 || sc > boardOnly;
    if (cat >= HandCategory.Straight && cat > curCat && usesHole) {
      strong++;
      if (cat === HandCategory.Straight) straightRanks.add(rankOf(c));
    } else if (cat > curCat && cat >= HandCategory.TwoPair && usesHole && cat < HandCategory.Straight) {
      // pairing the board does not help hole cards
      if (!(boardMask & (1 << rankOf(c)))) weak++;
    }
  }
  const openEnded = straightRanks.size >= 2;
  const gutshot = straightRanks.size === 1;
  const toCome = board.length === 3 ? 2 : 1;
  const unseen = 52 - all.length;
  const eq = (outs: number) => (toCome === 1 ? outs / unseen : 1 - ((unseen - outs) / unseen) * ((unseen - 1 - outs) / (unseen - 1)));
  return {
    flushDraw,
    nutFlushDraw,
    openEnded,
    gutshot,
    backdoorFlush,
    strongOuts: strong,
    weakOuts: weak,
    drawEquity: eq(strong) + 0.4 * (eq(strong + weak) - eq(strong)),
  };
}

// --------- Made-hand description ---------

export type MadeClass =
  | 'nuts-ish'
  | 'monster'
  | 'two-pair'
  | 'set'
  | 'trips'
  | 'overpair'
  | 'top-pair-strong'
  | 'top-pair-weak'
  | 'second-pair'
  | 'low-pair'
  | 'underpair'
  | 'ace-high'
  | 'nothing'
  | 'board-plays';

export interface MadeHandInfo {
  cls: MadeClass;
  label: string;
  category: HandCategory;
}

export function madeHand(hole: Card[], board: Card[]): MadeHandInfo {
  const score = evaluateCurrent(hole, board);
  const cat = categoryOf(score);
  const hr = hole.map(rankOf).sort((a, b) => b - a);
  const br = board.map(rankOf).sort((a, b) => b - a);
  const boardUniq = [...new Set(br)];
  const top = boardUniq[0];
  const isPocketPair = hr[0] === hr[1];
  const boardCounts = new Map<number, number>();
  for (const r of br) boardCounts.set(r, (boardCounts.get(r) ?? 0) + 1);
  const boardScore = board.length === 5 ? evaluate(board) : -1;
  if (boardScore >= 0 && score === boardScore) return { cls: 'board-plays', label: 'Playing the board', category: cat };
  if (cat >= HandCategory.Straight) {
    const labels: Record<number, string> = {
      [HandCategory.Straight]: 'Straight',
      [HandCategory.Flush]: 'Flush',
      [HandCategory.FullHouse]: 'Full house',
      [HandCategory.Quads]: 'Four of a kind',
      [HandCategory.StraightFlush]: 'Straight flush',
    };
    return { cls: cat >= HandCategory.FullHouse ? 'nuts-ish' : 'monster', label: labels[cat], category: cat };
  }
  if (cat === HandCategory.Trips) {
    if (isPocketPair) return { cls: 'set', label: 'Set', category: cat };
    return { cls: 'trips', label: 'Trips', category: cat };
  }
  if (cat === HandCategory.TwoPair) {
    const holeMatches = hr.filter((r) => boardCounts.has(r)).length;
    if (holeMatches === 2 && hr[0] !== hr[1]) return { cls: 'two-pair', label: 'Two pair', category: cat };
    // pocket pair + paired board, or one hole card pairing with a paired board
    if (isPocketPair && hr[0] > top) return { cls: 'overpair', label: 'Overpair (paired board)', category: cat };
    if (holeMatches === 1) {
      const matched = hr.find((r) => boardCounts.has(r))!;
      if (matched === top) return { cls: hr.find((r) => r !== matched)! >= 10 || matched === 12 ? 'top-pair-strong' : 'top-pair-weak', label: 'Top pair (paired board)', category: cat };
      return { cls: 'second-pair', label: 'Pair (paired board)', category: cat };
    }
    return { cls: isPocketPair ? 'underpair' : 'low-pair', label: isPocketPair ? 'Pocket pair (paired board)' : 'Pair (paired board)', category: cat };
  }
  if (cat === HandCategory.Pair) {
    if (isPocketPair) {
      if (hr[0] > top) return { cls: 'overpair', label: 'Overpair', category: cat };
      const above = boardUniq.filter((r) => r > hr[0]).length;
      if (above === 1) return { cls: 'second-pair', label: 'Pocket pair below the top card', category: cat };
      return { cls: 'underpair', label: 'Underpair', category: cat };
    }
    const pr = hr.find((r) => boardCounts.has(r));
    if (pr === undefined) return { cls: 'low-pair', label: 'Pair', category: cat };
    if (pr === top) {
      const kicker = hr.find((r) => r !== pr) ?? 0;
      const strongKicker = kicker >= 10 || (pr === 12 && kicker >= 8) || (pr >= 10 && kicker >= 9);
      return { cls: strongKicker ? 'top-pair-strong' : 'top-pair-weak', label: `Top pair, ${strongKicker ? 'good' : 'weak'} kicker`, category: cat };
    }
    if (pr === boardUniq[1]) return { cls: 'second-pair', label: 'Second pair', category: cat };
    return { cls: 'low-pair', label: 'Bottom/low pair', category: cat };
  }
  if (hr[0] === 12) return { cls: 'ace-high', label: 'Ace high', category: cat };
  return { cls: 'nothing', label: 'No pair', category: cat };
}

export function describeHolding(hole: Card[], board: Card[]): string {
  const m = madeHand(hole, board);
  const d = drawInfo(hole, board);
  const parts = [m.label];
  if (board.length < 5) {
    if (d.flushDraw) parts.push(d.nutFlushDraw ? 'nut flush draw' : 'flush draw');
    if (d.openEnded) parts.push('open-ended straight draw');
    else if (d.gutshot) parts.push('gutshot');
    if (!d.flushDraw && d.backdoorFlush && board.length === 3) parts.push('backdoor flush draw');
  }
  return parts.join(' + ');
}
