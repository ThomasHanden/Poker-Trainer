// Range practice drills. Reference answers are computed (charts, exact river equities vs the
// modeled ranges, blocker counts, range composition), never hand-written.

import { Card, createRng, cardsToString, rankOf, suitOf, deckWithout } from '../engine/cards';
import { evaluate } from '../engine/evaluator';
import { ALL_CLASSES, HandClass, Range, emptyRange, expandRange, formatRange, combosOf, classOf, comboCount } from './hands';
import { getChart, ALL_CHARTS } from './presets';
import { generateScenario } from '../scenarios/generator';
import { DEFAULT_SETTINGS } from '../scenarios/types';
import { buildDecisionContext } from '../evaluation/analysis';
import { rangeAdvantage } from '../evaluation/postflop';
import { boardTexture } from '../engine/board';
import { combosToRange } from '../opponents/inference';

export type DrillKind = 'open' | 'continue' | 'value-bluff' | 'blockers' | 'board-advantage';

export interface MatrixDrill {
  kind: 'open' | 'continue' | 'value-bluff';
  title: string;
  prompt: string;
  board: Card[];
  /** hands the user may choose from (others are greyed out); empty = all */
  candidates: HandClass[];
  /** reference selection(s) */
  reference: Record<string, HandClass[]>; // e.g. { select: [...] } or { value: [...], bluff: [...] }
  /** per-class explanation, e.g. equity numbers */
  details: Record<HandClass, string>;
  explanation: string[];
  paintModes: string[];
}

export interface ChoiceDrill {
  kind: 'blockers' | 'board-advantage';
  title: string;
  prompt: string;
  board: Card[];
  options: { label: string; detail: string }[];
  correct: number;
  explanation: string[];
}

export type Drill = MatrixDrill | ChoiceDrill;

export function buildDrill(kind: DrillKind, seed: number): Drill {
  switch (kind) {
    case 'open':
      return openDrill(seed);
    case 'continue':
      return continueDrill(seed);
    case 'value-bluff':
      return valueBluffDrill(seed);
    case 'blockers':
      return blockerDrill(seed);
    case 'board-advantage':
      return boardAdvantageDrill(seed);
  }
}

function openDrill(seed: number): MatrixDrill {
  const rng = createRng(seed);
  // skip full-ring seats that reuse a 6-max chart, so each distinct chart is equally likely
  const charts = ALL_CHARTS.filter((c) => c.group === 'open' && !(c.tableSize === 9 && ['LJ', 'HJ', 'CO', 'BTN', 'SB'].includes(c.position)));
  const c = rng.pick(charts);
  const select = ALL_CLASSES.filter((h) => (c.raise[h] ?? 0) >= 0.5);
  const mixed = ALL_CLASSES.filter((h) => (c.raise[h] ?? 0) >= 0.25 && (c.raise[h] ?? 0) <= 0.75);
  const details: Record<HandClass, string> = {};
  for (const h of ALL_CLASSES) if ((c.raise[h] ?? 0) > 0) details[h] = `opened ${Math.round((c.raise[h] ?? 0) * 100)}% in the reference`;
  return {
    kind: 'open',
    title: `Build an opening range: ${c.name}`,
    prompt: `Select the hands you would open-raise. ${c.priorAction} Hands the reference opens at least half the time count as “in”.`,
    board: [],
    candidates: [],
    reference: { select, mixed },
    details,
    explanation: [...c.assumptions, 'Mixed hands (opened 25–75%) are counted as acceptable either way.'],
    paintModes: ['select'],
  };
}

/** River: which hands in a bluff-catching range should call a big bet? Exact equities vs the modeled betting range. */
function continueDrill(seed: number): MatrixDrill {
  let best: MatrixDrill | null = null;
  for (let k = 0; k < 6; k++) {
    const d = continueDrillOnce(seed + k * 7919);
    const share = d.reference.select.length / Math.max(1, d.candidates.length);
    if (share >= 0.25 && share <= 0.75) return d;
    if (!best || Math.abs(share - 0.5) < Math.abs(best.reference.select.length / Math.max(1, best.candidates.length) - 0.5)) best = d;
  }
  return best!;
}

function continueDrillOnce(seed: number): MatrixDrill {
  const g = generateScenario({ ...DEFAULT_SETTINGS, difficulty: 'intermediate', opponent: 'unknown' }, { templateId: 'rv-bluff-catch', seed });
  if (!g.scenario) throw new Error(g.error);
  const sc = g.scenario;
  const ctx = buildDecisionContext(sc, sc.state, true, { equitySamples: 1 });
  const board = ctx.board;
  const villain = ctx.villains[0].combos;
  const req = ctx.requiredEquity;
  // hero's candidates: hands from the BB calling range that made at least a pair with a hole card
  // on the flop (the hands that call a flop c-bet without a draw), in a majority of their combos
  const def = getChart('cash6-BB-vs-BTN')!.call;
  const flop = board.slice(0, 3);
  const boardCat = flopCategory(flop);
  const candidates: HandClass[] = [];
  const details: Record<HandClass, string> = {};
  const select: HandClass[] = [];
  for (const h of ALL_CLASSES) {
    if ((def[h] ?? 0) < 0.3) continue;
    const combos = combosOf(h).filter(([a, b]) => !board.includes(a) && !board.includes(b));
    if (!combos.length) continue;
    const pairedFlop = combos.filter((hc) => Math.floor(evaluate([...hc, ...flop]) / 16 ** 5) > boardCat).length;
    if (pairedFlop * 2 < combos.length) continue;
    let eqSum = 0;
    let n = 0;
    for (const hc of combos) {
      const hs = evaluate([...hc, ...board]);
      let w = 0;
      let win = 0;
      for (const v of villain) {
        if (v.cards.includes(hc[0]) || v.cards.includes(hc[1])) continue;
        const vs = evaluate([...v.cards, ...board]);
        w += v.weight;
        win += v.weight * (hs > vs ? 1 : hs === vs ? 0.5 : 0);
      }
      if (w > 0) {
        eqSum += win / w;
        n++;
      }
    }
    if (!n) continue;
    const eq = eqSum / n;
    candidates.push(h);
    details[h] = `${(eq * 100).toFixed(0)}% equity vs the betting range (need ${(req * 100).toFixed(0)}%)`;
    if (eq >= req) select.push(h);
  }
  return {
    kind: 'continue',
    title: 'River: which hands call a big bet?',
    prompt: `Board ${cardsToString(board)}. You defended the big blind, called a flop bet, the turn went check-check, and the button bets ${(ctx.toCall / ctx.bb).toFixed(1)}bb into ${((ctx.pot - ctx.toCall) / ctx.bb).toFixed(1)}bb. You need ${(req * 100).toFixed(0)}% equity. The grid shows the hands from your big-blind calling range that flopped a pair or better using a hole card (the ones that called the flop). Select the hands that should call.`,
    board,
    candidates,
    reference: { select },
    details,
    explanation: [
      'Equities are exact river enumerations against the simulated button’s betting range (the opponent model with an unknown/baseline profile), averaged over each hand class’s combos.',
      'Simplification: hands that would have called the flop with only a draw are left out of the grid.',
      'Pot odds alone decide here because the river is the last street and the call closes the action.',
      'Against real opponents, adjust: fold more vs players who rarely bluff, call more vs aggressive players.',
    ],
    paintModes: ['select'],
  };
}

/** River checked to you: which hands value bet (win > 50% when called) and which are good bluffs (rarely win at showdown)? */
function valueBluffDrill(seed: number): MatrixDrill {
  const g = generateScenario({ ...DEFAULT_SETTINGS, difficulty: 'intermediate', opponent: 'unknown' }, { templateId: 'rv-thin-value', seed });
  if (!g.scenario) throw new Error(g.error);
  const sc = g.scenario;
  const ctx = buildDecisionContext(sc, sc.state, true, { equitySamples: 1 });
  const board = ctx.board;
  const villain = ctx.villains[0].combos;
  const open = getChart('cash6-open-BTN')!.raise;
  // calling range for a 2/3 pot bet: approximate by the top 45% of the checking range by showdown strength
  const sorted = villain
    .map((v) => ({ v, s: evaluate([...v.cards, ...board]) }))
    .sort((a, b) => b.s - a.s);
  const tw = sorted.reduce((a, x) => a + x.v.weight, 0);
  const callers: typeof sorted = [];
  let acc = 0;
  for (const x of sorted) {
    if (acc > 0.45 * tw) break;
    acc += x.v.weight;
    callers.push(x);
  }
  const value: HandClass[] = [];
  const bluff: HandClass[] = [];
  const candidates: HandClass[] = [];
  const details: Record<HandClass, string> = {};
  for (const h of ALL_CLASSES) {
    if ((open[h] ?? 0) < 0.5) continue;
    const combos = combosOf(h).filter(([a, b]) => !board.includes(a) && !board.includes(b));
    if (!combos.length) continue;
    let eqCalled = 0;
    let eqAll = 0;
    let n = 0;
    for (const hc of combos) {
      const hs = evaluate([...hc, ...board]);
      const score = (list: typeof sorted) => {
        let w = 0, win = 0;
        for (const x of list) {
          if (x.v.cards.includes(hc[0]) || x.v.cards.includes(hc[1])) continue;
          w += x.v.weight;
          win += x.v.weight * (hs > x.s ? 1 : hs === x.s ? 0.5 : 0);
        }
        return w ? win / w : 0;
      };
      eqCalled += score(callers);
      eqAll += score(sorted);
      n++;
    }
    eqCalled /= n;
    eqAll /= n;
    candidates.push(h);
    details[h] = `wins ${(eqCalled * 100).toFixed(0)}% when called; ${(eqAll * 100).toFixed(0)}% at showdown vs their whole checking range`;
    if (eqCalled >= 0.55) value.push(h);
    else if (eqAll <= 0.2) bluff.push(h);
  }
  return {
    kind: 'value-bluff',
    title: 'River: sort value bets and bluffs',
    prompt: `Board ${cardsToString(board)}. You opened the button, bet the flop, checked the turn, and the big blind checks the river. Mark hands you would value bet (worse hands call) and hands that make sensible bluffs (little showdown value). Leave the rest unmarked (check back).`,
    board,
    candidates,
    reference: { value, bluff },
    details,
    explanation: [
      'Value hands: win at least ~55% of the time when the simulated opponent calls a two-thirds-pot bet (calling range approximated as the strongest 45% of its checking range).',
      'Bluff candidates: win 20% or less at showdown against the whole checking range, so checking back rarely wins. In practice you only need some of them as bluffs — choose ones with good blockers.',
      'Hands in between have showdown value: they usually prefer to check back.',
    ],
    paintModes: ['value', 'bluff'],
  };
}

function blockerDrill(seed: number): ChoiceDrill {
  const rng = createRng(seed);
  // a river board with a three-flush, the nut-flush is the main value hand of the opponent
  let board: Card[] = [];
  for (let t = 0; t < 500; t++) {
    const deck = rng.shuffle(deckWithout([]));
    board = deck.slice(0, 5);
    const suits = [0, 0, 0, 0];
    for (const c of board) suits[suitOf(c)]++;
    if (Math.max(...suits) === 3 && !boardTexture(board).paired) break;
  }
  const flushSuit = [0, 1, 2, 3].find((s) => board.filter((c) => suitOf(c) === s).length === 3)!;
  // opponent's value range: flushes + sets + two pair built from a reasonable range
  const valueRange = expandRange(
    Object.fromEntries(ALL_CLASSES.map((h) => [h, 1])) as Range,
    board,
  ).filter((c) => {
    const s = evaluate([...c.cards, ...board]);
    return Math.floor(s / 16 ** 5) >= 5; // flush or better
  });
  // the strongest half of those combos (the hands that call big bluffs most happily)
  const scoredV = valueRange.map((c) => ({ c, s: evaluate([...c.cards, ...board]) })).sort((a, b) => b.s - a.s);
  const topV = scoredV.slice(0, Math.max(1, Math.ceil(scoredV.length / 2))).map((x) => x.c);
  const total = topV.length;
  // candidate hero hands: ace of flush suit (nut blocker), small card of suit, offsuit, a pair
  const deck = deckWithout(board);
  const aceSuit = deck.find((c) => rankOf(c) === 12 && suitOf(c) === flushSuit);
  const lowSuit = deck.filter((c) => suitOf(c) === flushSuit && rankOf(c) < 8);
  const other = deck.filter((c) => suitOf(c) !== flushSuit);
  const options: Card[][] = [];
  if (aceSuit !== undefined) options.push([aceSuit, rng.pick(other.filter((c) => c !== aceSuit))]);
  if (lowSuit.length) options.push([lowSuit[0], rng.pick(other)]);
  const two = rng.shuffle(other.slice());
  options.push([two[0], two[1]]);
  options.push([two[2], two[3]]);
  const scored = options.map((o) => {
    const removed = topV.filter((c) => c.cards.includes(o[0]) || c.cards.includes(o[1])).length;
    return { o, removed };
  });
  const order = rng.shuffle(scored.map((_, i) => i));
  const opts = order.map((i) => scored[i]);
  const best = opts.reduce((bi, x, i) => (x.removed > opts[bi].removed ? i : bi), 0);
  return {
    kind: 'blockers',
    title: 'Blockers: which hand makes the best river bluff?',
    prompt: `Board ${cardsToString(board)} (three ${['clubs', 'diamonds', 'hearts', 'spades'][flushSuit]}). Your opponent’s strongest calling hands are flushes. Which holding removes the most of their strongest flushes?`,
    board,
    options: opts.map((x) => ({ label: cardsToString(x.o), detail: `removes ${x.removed} of the ${total} strongest flush-or-better combos (${((100 * x.removed) / Math.max(1, total)).toFixed(0)}%)` })),
    correct: best,
    explanation: [
      'A blocker is a card in your hand that makes certain opponent holdings impossible. Holding the ace of the flush suit removes every nut-flush combination and many other flushes.',
      'Counted against the strongest half of all flush-or-better holdings (exact combinations, before range weighting). Any card of the suit removes some flushes; high cards of the suit remove the best ones.',
      'Blockers are a tie-breaker between bluff candidates, not a reason to bluff on their own.',
    ],
  };
}

function boardAdvantageDrill(seed: number): ChoiceDrill {
  const rng = createRng(seed);
  const pfr = getChart('cash6-open-UTG')!.raise;
  const caller = getChart('cash6-BB-vs-UTG')!.call;
  let board: Card[] = [];
  for (let t = 0; t < 50; t++) {
    board = rng.shuffle(deckWithout([])).slice(0, 3);
    if (!boardTexture(board).monotone) break;
  }
  const callerCombos = expandRange(caller, board);
  const adv = rangeAdvantage(pfr, callerCombos, board, 'The UTG opening range');
  const diff = adv.heroTopPlus - adv.villainTopPlus;
  const correct = diff > 0.05 ? 0 : diff < -0.05 ? 1 : 2;
  return {
    kind: 'board-advantage',
    title: 'Which range does this flop favor?',
    prompt: `UTG opens and the big blind calls (100bb cash). Flop: ${cardsToString(board)}. Which range has the advantage?`,
    board,
    options: [
      { label: 'UTG (the preflop raiser)', detail: `top pair or better ${(adv.heroTopPlus * 100).toFixed(0)}%` },
      { label: 'Big blind (the caller)', detail: `top pair or better ${(adv.villainTopPlus * 100).toFixed(0)}%` },
      { label: 'Roughly even', detail: 'difference under 5 percentage points' },
    ],
    correct,
    explanation: [
      adv.text,
      'High cards (A, K, Q) usually favor the preflop raiser, whose range has more big cards and big pairs. Low, connected boards favor the caller, who has more small pairs and suited connectors.',
      'Measured here as the share of each range with top pair or better and with two pair or better (using the illustrative baseline charts).',
    ],
  };
}

/** Hand category of three board cards on their own: 0 high card, 1 pair, 3 trips. */
export function flopCategory(flop: Card[]): number {
  const counts = new Map<number, number>();
  for (const c of flop) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
  const most = Math.max(...counts.values());
  return most === 3 ? 3 : most === 2 ? 1 : 0;
}

/** Score a matrix selection against a reference set. */
export function scoreSelection(selected: HandClass[], reference: HandClass[], candidates: HandClass[], ignore: HandClass[] = []) {
  const sel = new Set(selected);
  const ref = new Set(reference);
  const ign = new Set(ignore);
  const universe = (candidates.length ? candidates : ALL_CLASSES).filter((h) => !ign.has(h));
  let tp = 0, fp = 0, fn = 0;
  const missing: HandClass[] = [];
  const extra: HandClass[] = [];
  for (const h of universe) {
    const w = comboCount(h);
    if (sel.has(h) && ref.has(h)) tp += w;
    else if (sel.has(h)) {
      fp += w;
      extra.push(h);
    } else if (ref.has(h)) {
      fn += w;
      missing.push(h);
    }
  }
  const accuracy = 1 - (fp + fn) / Math.max(1, universe.reduce((a, h) => a + comboCount(h), 0));
  return { accuracy, missing, extra, tp, fp, fn };
}

export { formatRange, emptyRange, classOf, combosToRange };
