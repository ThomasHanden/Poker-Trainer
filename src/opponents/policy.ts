// Opponent policy: a probability distribution over legal actions given ONLY public information
// and the acting player's own hole cards. The same function is used
//   (1) to make opponents act (sampling with a seeded RNG), and
//   (2) to infer opponent ranges from their actions (Bayesian weighting of each combo by the
//       probability the policy would have taken the observed action with it).
// Because (1) and (2) share one model, the ranges shown in reviews are exactly the ranges of the
// simulated opponents — not a claim about real-world players.

import { Card, rankOf } from '../engine/cards';
import {
  HandState,
  PlayerAction,
  legalActions,
  potSize,
  potFractionTo,
  bbIndex,
  sbIndex,
  isInPositionOver,
  Street,
} from '../engine/rules';
import { strengthPercentile, drawInfo, boardTexture } from '../engine/board';
import { classOf, HandClass } from '../ranges/hands';
import { getChart, openRangeFor, Chart, chartFreq } from '../ranges/presets';
import { preflopRanking } from '../ranges/preflopEquity';
import { pushFoldShoveFreq, solvePushFold, PUSHFOLD_STACKS } from '../ranges/pushfold';
import { OpponentProfile, PROFILES } from './profiles';

export interface ActionOption {
  action: PlayerAction;
  prob: number;
  /** coarse type used for matching observed actions */
  kind: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  label: string;
}

/** A view of the hand with all hidden information removed except the actor's own cards. */
export interface PublicView {
  state: HandState; // deck emptied, other players' hole cards removed
  actor: number;
}

export function publicView(s: HandState, actor: number): PublicView {
  const st: HandState = {
    ...s,
    deck: [],
    players: s.players.map((p) => ({ ...p, hole: p.index === actor ? p.hole : [] })),
    history: s.history,
    result: undefined,
  };
  return { state: st, actor };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// ------------------------------------------------------------------------------------------
// Preflop
// ------------------------------------------------------------------------------------------

export interface PreflopSituation {
  raises: number; // number of bets/raises so far (blinds excluded)
  limpers: number;
  callersAfterRaise: number;
  lastRaiser: number;
  firstRaiser: number;
  actorRaisedBefore: boolean;
  facingAllIn: boolean;
}

export function preflopSituation(s: HandState, actor: number): PreflopSituation {
  let raises = 0;
  let limpers = 0;
  let callersAfterRaise = 0;
  let lastRaiser = -1;
  let firstRaiser = -1;
  let actorRaisedBefore = false;
  for (const h of s.history) {
    if (h.street !== 'preflop') continue;
    if (h.type === 'raise' || h.type === 'bet') {
      raises++;
      lastRaiser = h.player;
      if (firstRaiser < 0) firstRaiser = h.player;
      callersAfterRaise = 0;
      if (h.player === actor) actorRaisedBefore = true;
    } else if (h.type === 'call') {
      if (raises === 0) limpers++;
      else callersAfterRaise++;
    }
  }
  const facingAllIn = lastRaiser >= 0 && s.players[lastRaiser].allIn;
  return { raises, limpers, callersAfterRaise, lastRaiser, firstRaiser, actorRaisedBefore, facingAllIn };
}

/** Widen (looseness > 0) or tighten (< 0) a frequency using the hand's rank in the playability ordering. */
function adjustFreq(base: number, h: HandClass, baseShare: number, looseness: number): number {
  if (looseness === 0) return base;
  const rank = preflopRanking().indexOf(h) / 169; // 0 = best
  const target = clamp01(baseShare * (1 + looseness));
  const inTarget = sigmoid((target - rank) / 0.03);
  return looseness > 0 ? Math.max(base, inTarget * 0.9) : base * inTarget;
}

function share(r: Record<string, number>): number {
  let tot = 0;
  let n = 0;
  for (const k in r) {
    const c = k.length === 2 ? 6 : k[2] === 's' ? 4 : 12;
    tot += (r[k] ?? 0) * c;
    n += c;
  }
  return n ? tot / 1326 : 0;
}

function effectiveBB(s: HandState, actor: number): number {
  const me = s.players[actor];
  const mine = me.stack + me.totalCommitted;
  const others = s.players.filter((p) => p.index !== actor && !p.folded).map((p) => p.stack + p.totalCommitted);
  return Math.min(mine, Math.max(0, ...others)) / s.config.bb;
}

function nearestPushFold(bb: number) {
  return PUSHFOLD_STACKS.reduce((a, b) => (Math.abs(b - bb) < Math.abs(a - bb) ? b : a));
}

/** Chart used for an unopened/facing-open decision; null if none applies. */
export function defendChartFor(s: HandState, actor: number, opener: number, multiway: boolean): Chart | undefined {
  const me = s.players[actor].position;
  const op = s.players[opener].position;
  const late = ['CO', 'BTN', 'SB'].includes(op);
  if (s.players.length === 2) return getChart('cash6-BB-vs-BTN');
  if (multiway && (me === 'BB' || me === 'SB')) return getChart('cash6-BB-squeeze-vs-CO-BTN');
  if (me === 'BB') return getChart(op === 'BTN' || op === 'SB' ? 'cash6-BB-vs-BTN' : op === 'CO' ? 'cash6-BB-vs-CO' : 'cash6-BB-vs-UTG');
  if (me === 'SB') return getChart('cash6-SB-vs-BTN');
  if (late) return getChart('cash6-BTN-vs-CO');
  return getChart('cash6-CO-vs-UTG');
}

export function sizePreflopRaise(s: HandState, actor: number, sit: PreflopSituation = preflopSituation(s, actor)): number {
  const bb = s.config.bb;
  const la = legalActions(s)!;
  let to: number;
  if (sit.raises === 0) {
    if (sit.limpers > 0) to = 4 * bb + sit.limpers * bb;
    else if (s.players.length === 2) to = 2.5 * bb;
    else if (s.players[actor].position === 'SB') to = 3 * bb;
    else to = s.config.format === 'tournament' ? 2.2 * bb : 2.5 * bb;
  } else {
    const ip = isInPositionOver(s, actor, sit.lastRaiser);
    const mult = sit.raises === 1 ? (ip ? 3 : 4) + sit.callersAfterRaise : sit.raises === 2 ? 2.3 : 100;
    to = s.currentBet * mult;
  }
  to = Math.round(to);
  if (to >= la.maxTo * 0.4) to = la.maxTo; // commit: just shove
  return Math.max(la.minTo, Math.min(la.maxTo, to));
}

function preflopPolicy(view: PublicView, profile: OpponentProfile): ActionOption[] {
  const s = view.state;
  const actor = view.actor;
  const me = s.players[actor];
  const la = legalActions(s)!;
  const h = classOf(me.hole[0], me.hole[1]);
  const sit = preflopSituation(s, actor);
  const effBB = effectiveBB(s, actor);
  const L = profile.looseness;
  const aggr = profile.aggression / 0.5; // 1 = baseline

  let raiseP = 0;
  let callP = 0;

  const shortStack = effBB <= 20 && s.config.format === 'tournament';

  if (shortStack && sit.raises === 0 && sit.limpers === 0) {
    // push/fold: SB heads-up equilibrium, tightened for earlier positions with more players behind
    const behind = s.players.filter((p) => !p.folded && p.index > actor).length;
    const st = nearestPushFold(effBB);
    const base = pushFoldShoveFreq(st, h, s.config.anteType === 'none' ? 0 : 1);
    const baseShare = share(solvePushFold(st, s.config.anteType === 'none' ? 0 : 1).shove);
    const tight = Math.max(0.25, 1 - 0.18 * Math.max(0, behind - 1));
    const target = baseShare * tight * (1 + L);
    const rank = preflopRanking().indexOf(h) / 169;
    raiseP = behind <= 1 ? adjustFreq(base, h, baseShare, L) : sigmoid((target - rank) / 0.02);
    if (me.position === 'BB' && la.canCheck) {
      raiseP = 0;
    }
    return finishPreflop(s, actor, la, sit, raiseP, 0, true);
  }

  if (sit.raises === 0) {
    if (sit.limpers === 0) {
      if (la.canCheck) {
        // BB option after SB complete: raise strong hands, otherwise check
        raiseP = clamp01((preflopRanking().indexOf(h) < 30 ? 0.8 : 0.05) * aggr);
        return finishPreflop(s, actor, la, sit, raiseP, 0);
      }
      const open = openRangeFor(s.players.length, me.position);
      if (!open) return finishPreflop(s, actor, la, sit, 0, 0);
      const base = open[h] ?? 0;
      const f = adjustFreq(base, h, share(open), L);
      // passive players limp a portion of their opens
      const limpShare = profile.aggression < 0.3 ? 0.5 : 0;
      raiseP = f * (1 - limpShare);
      callP = me.position === 'SB' || limpShare ? f * limpShare : 0;
      if (me.position === 'SB' && profile.id === 'station') callP = Math.max(callP, adjustFreq(0, h, 0.3, L));
      return finishPreflop(s, actor, la, sit, raiseP, callP);
    }
    // facing limpers
    if (la.canCheck) {
      raiseP = clamp01((preflopRanking().indexOf(h) < 25 ? 0.75 : 0.03) * aggr);
      return finishPreflop(s, actor, la, sit, raiseP, 0);
    }
    const iso = getChart('cash6-BTN-iso-vs-limper')!;
    const fr = chartFreq(iso, h);
    const posFactor = ['BTN', 'CO'].includes(me.position) ? 1 : 0.6;
    raiseP = clamp01(fr.raise * posFactor * aggr);
    callP = clamp01(fr.call + (L > 0 ? adjustFreq(0, h, 0.25, L) : 0));
    return finishPreflop(s, actor, la, sit, raiseP, callP);
  }

  if (sit.facingAllIn || sit.raises >= 3) {
    // facing a shove or a 4-bet+: continue with premium hands, calling vs short shoves wider
    const toCall = la.toCall;
    const pot = potSize(s);
    const required = toCall / (pot + toCall);
    const rank = preflopRanking().indexOf(h);
    if (sit.facingAllIn && effBB <= 25) {
      // compare against the equilibrium calling range at this depth
      const st = nearestPushFold(effBB);
      const base = solvePushFold(st, s.config.anteType === 'none' ? 0 : 1).call[h];
      callP = adjustFreq(base * (required < 0.45 ? 1 : 0.8), h, 0.25, L);
      return finishPreflop(s, actor, la, sit, 0, callP);
    }
    if (sit.raises >= 3 && sit.actorRaisedBefore) {
      const c = getChart('cash6-BB-3bet-vs-BTN-4bet')!;
      const fr = chartFreq(c, h);
      raiseP = fr.raise * Math.min(1.3, aggr);
      callP = fr.call;
      return finishPreflop(s, actor, la, sit, raiseP, callP);
    }
    raiseP = rank < 3 ? 0.7 : 0;
    callP = rank < 6 ? 1 - raiseP : rank < 10 && L > 0.3 ? 0.5 : 0;
    return finishPreflop(s, actor, la, sit, raiseP, callP);
  }

  if (sit.raises === 2) {
    if (sit.actorRaisedBefore) {
      const ip = isInPositionOver(s, actor, sit.lastRaiser);
      const c = getChart(ip ? 'cash6-BTN-open-vs-BB-3bet' : 'cash6-UTG-open-vs-BTN-3bet')!;
      const fr = chartFreq(c, h);
      raiseP = clamp01(fr.raise * aggr);
      callP = clamp01(adjustFreq(fr.call, h, share(c.call), L * 0.5));
      return finishPreflop(s, actor, la, sit, raiseP, callP);
    }
    // cold facing a 3-bet
    const rank = preflopRanking().indexOf(h);
    raiseP = rank < 4 ? 0.6 * aggr : 0;
    callP = rank < 12 ? 1 - raiseP : 0;
    return finishPreflop(s, actor, la, sit, raiseP, callP);
  }

  // facing a single raise
  const chart = defendChartFor(s, actor, sit.lastRaiser, sit.callersAfterRaise > 0);
  if (chart) {
    const fr = chartFreq(chart, h);
    if (sit.callersAfterRaise > 0 && me.position === 'BB') {
      // the big blind closes the action with a caller already in: the price is better than heads-up,
      // so it overcalls at least as wide as it would defend against the opener alone
      const hu = defendChartFor(s, actor, sit.lastRaiser, false);
      const play = hu ? chartFreq(hu, h) : null;
      if (play) fr.call = Math.max(fr.call, Math.min(1 - fr.raise, play.call + play.raise - fr.raise));
    }
    raiseP = clamp01(fr.raise * aggr);
    const transfer = fr.raise - raiseP; // passive players flat instead of raising
    // loose players also flat-call hands the baseline would 3-bet or fold, so widen from the whole playing range
    callP = clamp01(adjustFreq(fr.call + Math.max(0, transfer), h, L > 0 ? share(chart.call) + share(chart.raise) : share(chart.call), L));
    if (raiseP + callP > 1) callP = 1 - raiseP;
  }
  return finishPreflop(s, actor, la, sit, raiseP, callP);
}

function finishPreflop(
  s: HandState,
  actor: number,
  la: NonNullable<ReturnType<typeof legalActions>>,
  sit: PreflopSituation,
  raiseP: number,
  callP: number,
  shove = false,
): ActionOption[] {
  const out: ActionOption[] = [];
  raiseP = clamp01(raiseP);
  callP = clamp01(Math.min(callP, 1 - raiseP));
  if (!la.canRaise) {
    callP = clamp01(callP + raiseP);
    raiseP = 0;
  }
  if (raiseP > 0) {
    const to = shove ? la.maxTo : sizePreflopRaise(s, actor, sit);
    out.push({ action: { type: 'raise', to }, prob: raiseP, kind: 'raise', label: to === la.maxTo ? 'all-in' : 'raise' });
  }
  if (la.canCheck) {
    out.push({ action: { type: 'check' }, prob: 1 - raiseP, kind: 'check', label: 'check' });
  } else {
    if (callP > 0) out.push({ action: { type: 'call' }, prob: callP, kind: 'call', label: 'call' });
    const foldP = 1 - raiseP - callP;
    if (foldP > 1e-9) out.push({ action: { type: 'fold' }, prob: foldP, kind: 'fold', label: 'fold' });
  }
  return normalize(out);
}

function normalize(opts: ActionOption[]): ActionOption[] {
  const filtered = opts.filter((o) => o.prob > 1e-9);
  const t = filtered.reduce((a, o) => a + o.prob, 0);
  if (t <= 0) return opts.slice(0, 1).map((o) => ({ ...o, prob: 1 }));
  // merge identical actions
  const merged: ActionOption[] = [];
  for (const o of filtered) {
    const m = merged.find((x) => x.action.type === o.action.type && x.action.to === o.action.to);
    if (m) m.prob += o.prob / t;
    else merged.push({ ...o, prob: o.prob / t });
  }
  return merged;
}

// ------------------------------------------------------------------------------------------
// Postflop
// ------------------------------------------------------------------------------------------

const STREET_IDX: Record<Street, number> = { preflop: 0, flop: 1, turn: 2, river: 3 };

export interface PostflopFeatures {
  pct: number; // strength percentile vs random holdings
  drawEq: number;
  strongDraw: boolean;
  wetness: number;
}

export function postflopFeatures(hole: Card[], board: Card[]): PostflopFeatures {
  const pct = strengthPercentile(hole, board);
  const d = drawInfo(hole, board);
  const tex = boardTexture(board);
  return { pct, drawEq: d.drawEquity, strongDraw: d.drawEquity >= 0.3 || (d.flushDraw && d.openEnded), wetness: tex.wetness };
}

function postflopPolicy(view: PublicView, profile: OpponentProfile): ActionOption[] {
  const s = view.state;
  const actor = view.actor;
  const me = s.players[actor];
  const la = legalActions(s)!;
  const f = postflopFeatures(me.hole, s.board);
  const street = STREET_IDX[s.street];
  const pot = potSize(s);
  const opponents = s.players.filter((p) => !p.folded && p.index !== actor).length;
  const multi = Math.max(0, opponents - 1);
  const isPFR = s.preflopAggressor === actor;
  const ipVsAll = s.players.filter((p) => !p.folded && p.index !== actor).every((p) => isInPositionOver(s, actor, p.index));
  const aggr = profile.aggression;
  const pfBets = s.history.filter((h) => h.street === 'preflop' && (h.type === 'raise' || h.type === 'bet')).length;
  const spr = me.stack / Math.max(1, pot);
  const out: ActionOption[] = [];

  // Strength adjusted for range narrowing: later streets and 3-bet pots demand more.
  const pct = f.pct;

  if (la.toCall > 0) {
    const betFrac = la.toCall / Math.max(1, pot - la.toCall);
    const facingRaise = s.history.filter((h) => h.street === s.street && (h.type === 'bet' || h.type === 'raise')).length >= 2;
    const required = la.toCall / (pot + la.toCall);
    let T = 0.53 + 0.32 * (betFrac / (1 + betFrac)) + 0.04 * (street - 1) + (street === 3 ? 0.03 : 0) + (facingRaise ? 0.08 : 0) + 0.025 * multi + profile.callShift;
    if (pfBets >= 2) T += 0.02;
    // Never demand more than near-nut strength: even against huge bets, strong hands continue.
    T = Math.min(T, 0.935 + Math.max(0, profile.callShift) * 0.25);
    let madeContinue = sigmoid((pct - T) / 0.025);
    if (pct >= 0.975) madeContinue = Math.max(madeContinue, 0.99);
    const impliedBonus = street < 3 ? (profile.id === 'station' ? 0.08 : 0.04) * Math.min(1, spr / 3) : 0;
    const drawContinue = street < 3 ? sigmoid((f.drawEq + impliedBonus - required) / 0.03) : 0;
    let cont = Math.max(madeContinue, drawContinue);
    // raises: value with very strong hands, semi-bluff with strong draws
    let raiseP = 0;
    if (la.canRaise) {
      const R = 0.95 - aggr * 0.03 + (facingRaise ? 0.025 : 0) + (street === 3 ? 0.01 : 0);
      const valueRaise = sigmoid((pct - R) / 0.012) * (0.25 + 0.6 * aggr) * (1 - profile.slowplay);
      const semiBluff = street < 3 && f.strongDraw && !facingRaise ? 0.45 * aggr : 0;
      const bluffRaise = street < 3 && !facingRaise && pct < 0.5 && f.drawEq > 0.12 ? 0.08 * aggr : 0;
      raiseP = clamp01(Math.max(valueRaise, semiBluff, bluffRaise));
      raiseP = Math.min(raiseP, Math.max(cont, raiseP));
    }
    cont = Math.max(cont, raiseP);
    const callP = Math.max(0, cont - raiseP);
    const foldP = 1 - cont;
    if (raiseP > 0) {
      const to = policyRaiseSize(s, f.pct > 0.97, aggr > 0.6);
      out.push({ action: { type: 'raise', to }, prob: raiseP, kind: 'raise', label: to === la.maxTo ? 'all-in' : 'raise' });
    }
    if (callP > 0) out.push({ action: { type: 'call' }, prob: callP, kind: 'call', label: 'call' });
    if (foldP > 0) out.push({ action: { type: 'fold' }, prob: foldP, kind: 'fold', label: 'fold' });
    return normalize(out);
  }

  // Not facing a bet: check or bet.
  if (!la.canBet) return [{ action: { type: 'check' }, prob: 1, kind: 'check', label: 'check' }];
  const V = 0.8 + 0.025 * (street - 1) + 0.03 * multi + profile.valueShift - (ipVsAll ? 0.03 : 0) + (pfBets >= 2 ? 0.02 : 0);
  const value = sigmoid((pct - V) / 0.02);
  let betP = value * (1 - profile.slowplay * (pct > 0.95 ? 1 : 0.4));
  // Draws: semi-bluff
  if (street < 3) betP = Math.max(betP, (f.strongDraw ? 0.65 : f.drawEq > 0.15 ? 0.35 : 0) * (aggr / 0.5) * (multi ? 0.6 : 1));
  // Continuation bets as the preflop aggressor
  const lastStreetAggressor = lastAggressorOnPreviousStreet(s);
  const hasInitiative = street === 1 ? isPFR : lastStreetAggressor === actor;
  if (hasInitiative) {
    const textureFactor = 1.25 - f.wetness * 0.6; // more c-bets on dry boards
    const cb = profile.cbet * textureFactor * (multi ? 0.55 : 1) * (street === 1 ? 1 : 0.7);
    betP = Math.max(betP, clamp01(cb) * (pct < V ? 1 : 0));
  }
  // Pure bluffs with weak hands
  if (pct < 0.5) {
    const bluff = profile.bluff * (street === 3 ? 1 : 0.6) * (multi ? 0.4 : 1) * (ipVsAll ? 1.2 : 0.8);
    betP = Math.max(betP, clamp01(bluff));
  }
  // Medium hands: mostly check for showdown value; occasional thin bet IP
  if (pct >= 0.6 && pct < V) betP = Math.max(betP * 0.7, ipVsAll ? 0.12 : 0.05);
  betP = clamp01(betP);

  if (betP > 0) {
    // sizing: small on dry boards / range bets; larger for polar value & bluffs and on wet boards
    const big = profile.bigSizing;
    const strongOrBluff = pct > V || pct < 0.5;
    const largeP = clamp01((strongOrBluff ? big + 0.15 : big - 0.2) + f.wetness * 0.2 - (hasInitiative && street === 1 ? 0.25 : 0));
    const sz = policyBetSizes(s, street === 3 && pct > 0.95 && aggr > 0.6);
    out.push({ action: { type: 'bet', to: sz.small }, prob: betP * (1 - largeP), kind: 'bet', label: sz.smallLabel });
    out.push({ action: { type: 'bet', to: sz.large }, prob: betP * largeP, kind: 'bet', label: sz.largeLabel });
  }
  out.push({ action: { type: 'check' }, prob: 1 - betP, kind: 'check', label: 'check' });
  return normalize(out);
}

/** The two bet sizes the policy uses in this public state (independent of hole cards except the overbet flag). */
export function policyBetSizes(s: HandState, overbet = false) {
  const la = legalActions(s)!;
  const pot = potSize(s);
  const wet = boardTexture(s.board).wetness;
  const spr = s.players[s.toAct].stack / Math.max(1, pot);
  const smallFrac = wet < 0.3 ? 0.33 : 0.5;
  const largeFrac = overbet ? 1.25 : 0.75;
  const small = potFractionTo(s, smallFrac);
  let large = potFractionTo(s, largeFrac);
  if (large >= la.maxTo * 0.7 || spr <= 1) large = la.maxTo;
  return {
    small,
    large,
    smallFrac,
    largeFrac,
    smallLabel: `bet ${Math.round(smallFrac * 100)}%`,
    largeLabel: large === la.maxTo ? 'all-in' : `bet ${Math.round(largeFrac * 100)}%`,
  };
}

/** Raise size the policy uses when facing a bet postflop. */
export function policyRaiseSize(s: HandState, strongest: boolean, aggressive: boolean): number {
  const la = legalActions(s)!;
  const pot = potSize(s);
  const spr = s.players[s.toAct].stack / Math.max(1, pot);
  const facingRaise = s.history.filter((h) => h.street === s.street && (h.type === 'bet' || h.type === 'raise')).length >= 2;
  const frac = facingRaise ? 1 : strongest && aggressive ? 1 : 0.75;
  let to = potFractionTo(s, frac);
  if (to >= la.maxTo * 0.6 || spr < 1.5) to = la.maxTo;
  return to;
}

function lastAggressorOnPreviousStreet(s: HandState): number {
  const order: Street[] = ['preflop', 'flop', 'turn', 'river'];
  const prev = order[order.indexOf(s.street) - 1];
  if (!prev) return -1;
  let last = -1;
  for (const h of s.history) if (h.street === prev && (h.type === 'bet' || h.type === 'raise')) last = h.player;
  return last;
}

// ------------------------------------------------------------------------------------------

export function policyDistribution(view: PublicView, profile: OpponentProfile = PROFILES.unknown): ActionOption[] {
  const s = view.state;
  if (s.toAct !== view.actor) throw new Error('policy called for a player who is not to act');
  const me = s.players[view.actor];
  if (me.hole.length !== 2) throw new Error('policy needs the actor’s hole cards');
  const opts = s.street === 'preflop' ? preflopPolicy(view, profile) : postflopPolicy(view, profile);
  return opts;
}

/** Probability that the policy takes an observed action (matched by type, and by size within tolerance). */
export function actionLikelihood(opts: ActionOption[], observed: { type: string; to: number }, la: { maxTo: number }): number {
  const sameKind = opts.filter((o) => o.kind === observed.type || (observed.type === 'raise' && o.kind === 'raise'));
  if (sameKind.length === 0) return 0;
  if (observed.type !== 'bet' && observed.type !== 'raise') return sameKind.reduce((a, o) => a + o.prob, 0);
  // size match: exact all-in matches all-in; otherwise nearest option by ratio, within 25%
  let best = 0;
  let bestDist = Infinity;
  for (const o of sameKind) {
    const to = o.action.to ?? 0;
    const allInMatch = observed.to === la.maxTo && to === la.maxTo;
    const dist = allInMatch ? 0 : Math.abs(Math.log((to || 1) / Math.max(1, observed.to)));
    if (dist < bestDist) {
      bestDist = dist;
      best = o.prob;
    } else if (dist === bestDist) best += o.prob;
  }
  // a size the policy never uses: fall back to the total bet/raise probability (coarse match)
  if (bestDist > 0.25) return sameKind.reduce((a, o) => a + o.prob, 0) * 0.5;
  return best;
}

export function sampleAction(opts: ActionOption[], u: number): ActionOption {
  let acc = 0;
  for (const o of opts) {
    acc += o.prob;
    if (u < acc) return o;
  }
  return opts[opts.length - 1];
}

/** Helper: does the hand have high-card blockers (an ace or king)? */
export function hasBlocker(hole: Card[], rank: number): boolean {
  return hole.some((c) => rankOf(c) === rank);
}

export { sbIndex, bbIndex };
