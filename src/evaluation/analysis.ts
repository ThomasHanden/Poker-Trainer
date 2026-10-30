// Decision analysis: builds the hero-perspective DecisionContext and the computed facts used in
// guidance and reviews. Everything here uses only information available to the hero when acting.

import { Card, createRng, deckWithout, Rng, childRng } from '../engine/cards';
export type { Rng };
import {
  HandState,
  legalActions,
  potSize,
  applyAction,
  PlayerAction,
  isInPositionOver,
  effectiveStack,
  winnablePot,
} from '../engine/rules';
import { boardTexture, madeHand, drawInfo, strengthPercentile, MadeClass } from '../engine/board';
import { evaluate } from '../engine/evaluator';
import { equityVsRange, equityMultiway, EquityResult } from '../engine/equity';
import { classOf, WeightedCombo, HandClass, isPair, isSuited } from '../ranges/hands';
import { holdingEquityVsRange } from '../ranges/preflopEquity';
import { inferRange, combosToRange, totalWeight, sampleCombo } from '../opponents/inference';
import { policyDistribution, publicView } from '../opponents/policy';
import { PROFILES, ProfileId } from '../opponents/profiles';
import { DecisionContext, Scenario } from '../scenarios/types';
import { rangePercent } from '../ranges/hands';

export function heroView(s: HandState, hero: number): HandState {
  return { ...s, deck: [], players: s.players.map((p) => ({ ...p, hole: p.index === hero ? p.hole : [] })), result: undefined };
}

export interface ContextOptions {
  equitySamples?: number;
  profilesOverride?: Record<number, ProfileId>;
}

export function buildDecisionContext(sc: Scenario, full: HandState, isKey: boolean, opts: ContextOptions = {}): DecisionContext {
  const hero = sc.heroIndex;
  const s = heroView(full, hero);
  const la = legalActions(s);
  if (!la || s.toAct !== hero) throw new Error('Hero is not to act');
  const me = s.players[hero];
  const hole = me.hole;
  const board = s.board;
  const toCall = la.toCall;
  // facing a bet you cannot fully cover, only the part of the pot you can match is winnable
  const pot = toCall > 0 ? winnablePot(s, hero, toCall) : potSize(s);
  const dead = [...hole, ...board];
  const profiles = opts.profilesOverride ?? sc.shownProfiles;
  const liveV = s.players.filter((p) => !p.folded && p.index !== hero);
  const villains = liveV.map((p) => {
    const combos = inferRange(sc.base, full.history, p.index, PROFILES[profiles[p.index] ?? 'unknown'], dead);
    return { index: p.index, position: p.position, profile: profiles[p.index] ?? 'unknown', combos, rangePct: rangePercent(combosToRange(combos)) };
  });
  const ip = liveV.every((p) => isInPositionOver(s, hero, p.index));
  const facingAllIn = toCall > 0 && liveV.some((p) => p.allIn) && s.players.filter((p) => !p.folded && !p.allIn && p.index !== hero).length === 0;
  const raisesThisStreet = s.history.filter((h) => h.street === s.street && (h.type === 'bet' || h.type === 'raise')).length;
  const facing: DecisionContext['facing'] = toCall === 0 ? 'none' : facingAllIn ? 'allin' : raisesThisStreet >= 2 ? 'raise' : 'bet';
  const ctx: DecisionContext = {
    templateId: sc.templateId,
    isKey,
    base: sc.base,
    state: s,
    hero,
    hole,
    heroClass: classOf(hole[0], hole[1]),
    board,
    street: s.street,
    la,
    pot,
    toCall,
    bb: s.config.bb,
    requiredEquity: toCall > 0 ? toCall / (pot + toCall) : 0,
    spr: me.stack / Math.max(1, pot),
    effectiveBB: effectiveStack(s, hero) / s.config.bb,
    inPosition: ip,
    facing,
    villains,
    params: sc.params,
    icm: sc.icm,
    format: s.config.format,
  };
  if (board.length >= 3) {
    ctx.texture = boardTexture(board);
    ctx.made = madeHand(hole, board);
    ctx.draws = drawInfo(hole, board);
    ctx.percentile = strengthPercentile(hole, board);
  }
  ctx.equity = computeEquity(ctx, opts.equitySamples ?? 8000, childRng(sc.seed, `eq:${full.history.length}`));
  return ctx;
}

export function computeEquity(ctx: DecisionContext, samples: number, rng: Rng): EquityResult & { source: string } {
  const ranges = ctx.villains.map((v) => v.combos);
  if (ranges.length === 0 || ranges.some((r) => r.length === 0)) {
    return { equity: NaN, win: 0, tie: 0, method: 'exact', samples: 0, stdError: 0, source: 'unavailable' };
  }
  if (ctx.board.length === 0 && ranges.length === 1) {
    // preflop heads-up: class-averaged precomputed table
    const r = combosToRange(ranges[0]);
    const e = holdingEquityVsRange(ctx.hole, r);
    return { equity: e, win: e, tie: 0, method: 'simulation', samples: 0, stdError: 0.008, source: 'precomputed preflop table (Monte Carlo, class-averaged)' };
  }
  if (ranges.length === 1) {
    const r = equityVsRange(ctx.hole, ranges[0], ctx.board, { samples, rng });
    return { ...r, source: r.method === 'exact' ? 'exact enumeration vs modeled range' : 'Monte Carlo vs modeled range' };
  }
  const r = equityMultiway(ctx.hole, ranges, ctx.board, Math.max(3000, samples / 2), rng);
  return { ...r, source: 'Monte Carlo vs modeled ranges (multiway)' };
}

// ---------------- Range composition ----------------

export interface RangeBucket {
  key: string;
  label: string;
  share: number; // 0..1 of weight
  examples: HandClass[];
}

const BUCKETS: { key: string; label: string; cls: MadeClass[] }[] = [
  { key: 'strong', label: 'Very strong (two pair or better)', cls: ['nuts-ish', 'monster', 'set', 'two-pair', 'trips'] },
  { key: 'top', label: 'Overpairs & top pair', cls: ['overpair', 'top-pair-strong', 'top-pair-weak'] },
  { key: 'mid', label: 'Middle / weak pairs', cls: ['second-pair', 'low-pair', 'underpair', 'board-plays'] },
];

export function rangeBreakdown(combos: WeightedCombo[], board: Card[]): RangeBucket[] {
  const total = totalWeight(combos);
  if (total <= 0) return [];
  if (board.length < 3) return preflopBreakdown(combos, total);
  const acc = new Map<string, { w: number; ex: Map<HandClass, number> }>();
  const add = (k: string, c: WeightedCombo) => {
    if (!acc.has(k)) acc.set(k, { w: 0, ex: new Map() });
    const a = acc.get(k)!;
    a.w += c.weight;
    a.ex.set(c.cls, (a.ex.get(c.cls) ?? 0) + c.weight);
  };
  for (const c of combos) {
    const m = madeHand(c.cards, board).cls;
    const b = BUCKETS.find((x) => x.cls.includes(m));
    if (b) add(b.key, c);
    else if (board.length < 5 && drawInfo(c.cards, board).drawEquity >= 0.25) add('draw', c);
    else if (m === 'ace-high') add('ace', c);
    else add('air', c);
  }
  const labels: Record<string, string> = {
    strong: BUCKETS[0].label,
    top: BUCKETS[1].label,
    mid: BUCKETS[2].label,
    draw: 'Draws (no pair, strong draw)',
    ace: 'Ace-high (no pair)',
    air: 'Weak / air',
  };
  const order = ['strong', 'top', 'mid', 'draw', 'ace', 'air'];
  return order
    .filter((k) => acc.has(k))
    .map((k) => {
      const a = acc.get(k)!;
      return { key: k, label: labels[k], share: a.w / total, examples: [...a.ex.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map((e) => e[0]) };
    });
}

function preflopBreakdown(combos: WeightedCombo[], total: number): RangeBucket[] {
  const groups: Record<string, { label: string; test: (h: HandClass) => boolean }> = {
    premium: { label: 'Premium (QQ+, AK)', test: (h) => ['AA', 'KK', 'QQ', 'AKs', 'AKo'].includes(h) },
    pairs: { label: 'Other pocket pairs', test: (h) => isPair(h) },
    bway: { label: 'Broadway hands', test: (h) => 'AKQJT'.includes(h[0]) && 'AKQJT'.includes(h[1]) },
    suitedA: { label: 'Suited aces', test: (h) => h[0] === 'A' && isSuited(h) },
    suited: { label: 'Suited connectors / gappers', test: (h) => isSuited(h) },
    other: { label: 'Other offsuit hands', test: () => true },
  };
  const acc = new Map<string, { w: number; ex: Map<HandClass, number> }>();
  for (const c of combos) {
    const k = Object.keys(groups).find((g) => groups[g].test(c.cls))!;
    if (!acc.has(k)) acc.set(k, { w: 0, ex: new Map() });
    const a = acc.get(k)!;
    a.w += c.weight;
    a.ex.set(c.cls, (a.ex.get(c.cls) ?? 0) + c.weight);
  }
  return Object.keys(groups)
    .filter((k) => acc.has(k))
    .map((k) => ({
      key: k,
      label: groups[k].label,
      share: acc.get(k)!.w / total,
      examples: [...acc.get(k)!.ex.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map((e) => e[0]),
    }));
}

// ---------------- Bet response (heads-up): who folds, calls, raises ----------------

export interface BetResponse {
  to: number;
  fraction: number; // of pot
  fold: number;
  call: number;
  raise: number;
  /** share of villain range that is worse than hero now and calls */
  worseCalls: number;
  /** share of villain range that is better than hero now and folds */
  betterFolds: number;
  /** hero equity vs the part of the range that continues (river only; NaN otherwise) */
  equityWhenCalled: number;
  /** the villain's continuing (call or raise) range, weighted by continue probability */
  continuing: WeightedCombo[];
}

/** Heads-up only. Uses current showdown strength to classify "worse"/"better" (exact on the river). */
export function betResponse(ctx: DecisionContext, action: PlayerAction): BetResponse | null {
  if (ctx.villains.length !== 1 || (action.type !== 'bet' && action.type !== 'raise' && action.type !== 'allin')) return null;
  const v = ctx.villains[0];
  const after = applyAction(withHoles(ctx.state, ctx.hero, ctx.hole), action);
  if (after.complete || after.toAct !== v.index) return null;
  const to = after.players[ctx.hero].streetCommitted;
  let fold = 0, call = 0, raise = 0, worseCalls = 0, betterFolds = 0, tw = 0, eqNum = 0, eqDen = 0;
  const boardFull = ctx.board.length === 5;
  const heroScore = ctx.board.length >= 3 ? evaluate([...ctx.hole, ...ctx.board]) : 0;
  const profile = PROFILES[v.profile];
  const continuing: WeightedCombo[] = [];
  for (const c of v.combos) {
    const view = publicView(after, v.index);
    view.state.players[v.index].hole = [c.cards[0], c.cards[1]];
    const opts = policyDistribution(view, profile);
    const pf = opts.filter((o) => o.kind === 'fold').reduce((a, o) => a + o.prob, 0);
    const pc = opts.filter((o) => o.kind === 'call').reduce((a, o) => a + o.prob, 0);
    const pr = opts.filter((o) => o.kind === 'raise').reduce((a, o) => a + o.prob, 0);
    const w = c.weight;
    if (pc + pr > 0) continuing.push({ ...c, weight: w * (pc + pr) });
    tw += w;
    fold += w * pf;
    call += w * pc;
    raise += w * pr;
    if (ctx.board.length >= 3) {
      const vs = evaluate([...c.cards, ...ctx.board]);
      if (vs < heroScore) worseCalls += w * (pc + pr);
      if (vs > heroScore) betterFolds += w * pf;
      if (boardFull) {
        eqNum += w * (pc + pr) * (heroScore > vs ? 1 : heroScore === vs ? 0.5 : 0);
        eqDen += w * (pc + pr);
      }
    }
  }
  if (tw <= 0) return null;
  return {
    to,
    fraction: (to - ctx.state.players[ctx.hero].streetCommitted) / Math.max(1, ctx.pot),
    fold: fold / tw,
    call: call / tw,
    raise: raise / tw,
    worseCalls: worseCalls / tw,
    betterFolds: betterFolds / tw,
    equityWhenCalled: eqDen > 0 ? eqNum / eqDen : NaN,
    continuing,
  };
}

function withHoles(s: HandState, hero: number, hole: Card[]): HandState {
  return { ...s, players: s.players.map((p) => (p.index === hero ? { ...p, hole } : p)) };
}

// ---------------- Rollouts: model-based EV estimates ----------------

export interface RolloutResult {
  action: PlayerAction;
  label: string;
  ev: number; // chips, relative to the hero's stack at the decision
  se: number;
  n: number;
  /** per-sample results aligned by sample index (NaN where skipped) for paired comparisons */
  values: number[];
}

/**
 * Estimate the EV of each candidate action against the modeled opponents:
 * opponents' hands are drawn from their inferred ranges, future cards are random (not the real
 * deck), opponents act by the policy with the shown profile, and the hero's later decisions are
 * made by the same baseline policy ("unknown" profile). Common random numbers across candidates.
 */
export function rolloutEVs(ctx: DecisionContext, candidates: { action: PlayerAction; label: string }[], samples: number, seed: number): RolloutResult[] {
  const results = candidates.map((c) => ({ action: c.action, label: c.label, sum: 0, sumSq: 0, n: 0, values: new Array<number>(samples).fill(NaN) }));
  const heroStack = ctx.state.players[ctx.hero].stack;
  const known = [...ctx.hole, ...ctx.board];
  const ranges = ctx.villains.map((v) => v.combos);
  if (ranges.some((r) => r.length === 0)) return [];
  for (let i = 0; i < samples; i++) {
    const rng = createRng(seed * 7919 + i);
    // sample villain hands jointly
    const used = new Set(known);
    const holes: Record<number, Card[]> = {};
    let ok = true;
    for (let k = 0; k < ranges.length; k++) {
      const c = sampleCombo(ranges[k], rng.next, used);
      if (!c) {
        ok = false;
        break;
      }
      used.add(c.cards[0]);
      used.add(c.cards[1]);
      holes[ctx.villains[k].index] = [c.cards[0], c.cards[1]];
    }
    if (!ok) continue;
    const deck = rng.shuffle(deckWithout(used));
    const base: HandState = {
      ...ctx.state,
      deck,
      players: ctx.state.players.map((p) => ({ ...p, hole: p.index === ctx.hero ? ctx.hole : holes[p.index] ?? [] })),
    };
    for (let ci = 0; ci < candidates.length; ci++) {
      const actRng = createRng(seed * 104729 + i);
      let s: HandState;
      try {
        s = applyAction(base, candidates[ci].action);
      } catch {
        continue;
      }
      let guard = 0;
      while (!s.complete && guard++ < 40) {
        const actor = s.toAct;
        const prof = actor === ctx.hero ? PROFILES.unknown : PROFILES[ctx.villains.find((v) => v.index === actor)?.profile ?? 'unknown'];
        const opts = policyDistribution(publicView(s, actor), prof);
        const u = actRng.next();
        let acc = 0;
        let pick = opts[opts.length - 1];
        for (const o of opts) {
          acc += o.prob;
          if (u < acc) {
            pick = o;
            break;
          }
        }
        s = applyAction(s, pick.action);
      }
      const result = s.players[ctx.hero].stack - heroStack;
      const r = results[ci];
      r.sum += result;
      r.sumSq += result * result;
      r.n++;
      r.values[i] = result;
    }
  }
  return results.map((r) => {
    const mean = r.n ? r.sum / r.n : NaN;
    const variance = r.n ? Math.max(0, r.sumSq / r.n - mean * mean) : 0;
    return { action: r.action, label: r.label, ev: mean, se: r.n ? Math.sqrt(variance / r.n) : Infinity, n: r.n, values: r.values };
  });
}

export { rangePercent };
