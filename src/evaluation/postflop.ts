// Postflop analysis helpers: range advantage and blocker effects, computed from the model.

import { Card } from '../engine/cards';
import { applyAction, PlayerAction } from '../engine/rules';
import { evaluate } from '../engine/evaluator';
import { Range, expandRange, WeightedCombo } from '../ranges/hands';
import { inferRange } from '../opponents/inference';
import { policyDistribution, publicView } from '../opponents/policy';
import { PROFILES } from '../opponents/profiles';
import { DecisionContext } from '../scenarios/types';
import { rangeBreakdown } from './analysis';
import { pctStr } from './guides';

export interface RangeAdvantage {
  heroStrong: number;
  villainStrong: number;
  heroTopPlus: number;
  villainTopPlus: number;
  text: string;
}

/** Compare the share of very strong hands and top-pair-or-better between two ranges on a board. */
export function rangeAdvantage(heroRange: Range, villainCombos: WeightedCombo[], board: Card[], heroLabel = 'Your range'): RangeAdvantage {
  const heroCombos = expandRange(heroRange, board);
  const hb = rangeBreakdown(heroCombos, board);
  const vb = rangeBreakdown(villainCombos, board);
  const get = (b: typeof hb, k: string) => b.find((x) => x.key === k)?.share ?? 0;
  const heroStrong = get(hb, 'strong');
  const villainStrong = get(vb, 'strong');
  const heroTopPlus = heroStrong + get(hb, 'top');
  const villainTopPlus = villainStrong + get(vb, 'top');
  const who = heroTopPlus > villainTopPlus + 0.05 ? 'you have the range advantage' : villainTopPlus > heroTopPlus + 0.05 ? 'your opponent has the range advantage' : 'neither range is clearly ahead';
  const nut = heroStrong > villainStrong + 0.03 ? 'and the nut advantage' : villainStrong > heroStrong + 0.03 ? 'while your opponent has more very strong hands (nut advantage)' : '';
  const text = `${heroLabel} hits top pair or better ${pctStr(heroTopPlus)} of the time on this board (two pair or better: ${pctStr(heroStrong)}); the opponent’s modeled range does so ${pctStr(villainTopPlus)} (two pair or better: ${pctStr(villainStrong)}). So ${who}${nut ? ' ' + nut : ''}.`;
  return { heroStrong, villainStrong, heroTopPlus, villainTopPlus, text };
}

export interface BlockerResult {
  text: string;
  /** for bluff-catching: share of opponent value combos removed minus share of bluffs removed */
  valueRemoved?: number;
  bluffRemoved?: number;
  /** for bluffing: continue probability of blocked combos vs whole range */
  blockedContinue?: number;
  rangeContinue?: number;
}

function unblockedRange(ctx: DecisionContext): WeightedCombo[] {
  const v = ctx.villains[0];
  return inferRange(ctx.base, ctx.state.history, v.index, PROFILES[v.profile], ctx.board);
}

/** Bluff-catching (hero faces a bet on the river): do the hero's cards block value or bluffs? */
export function blockersFacingBet(ctx: DecisionContext): BlockerResult | null {
  if (ctx.villains.length !== 1 || ctx.board.length !== 5) return null;
  const combos = unblockedRange(ctx);
  const heroScore = evaluate([...ctx.hole, ...ctx.board]);
  const hs = new Set(ctx.hole);
  let valueAll = 0, bluffAll = 0, valueBlocked = 0, bluffBlocked = 0;
  for (const c of combos) {
    const s = evaluate([...c.cards, ...ctx.board]);
    const blocked = hs.has(c.cards[0]) || hs.has(c.cards[1]);
    if (s > heroScore) {
      valueAll += c.weight;
      if (blocked) valueBlocked += c.weight;
    } else if (s < heroScore) {
      bluffAll += c.weight;
      if (blocked) bluffBlocked += c.weight;
    }
  }
  const vr = valueAll ? valueBlocked / valueAll : 0;
  const br = bluffAll ? bluffBlocked / bluffAll : 0;
  const verdict = vr > br + 0.03 ? 'Your cards block more of their value than their bluffs — a point in favor of calling.' : br > vr + 0.03 ? 'Your cards block more of their bluffs than their value hands — a point against calling.' : 'Your cards have little net blocker effect here.';
  return { text: `Before removing your cards, ${pctStr(vr)} of their value combos and ${pctStr(br)} of their bluff combos contain one of your hole cards. ${verdict}`, valueRemoved: vr, bluffRemoved: br };
}

/** Bluffing: do the hero's cards remove hands that would call (good) or hands that would fold (bad)? */
export function blockersForBet(ctx: DecisionContext, action: PlayerAction): BlockerResult | null {
  if (ctx.villains.length !== 1) return null;
  const v = ctx.villains[0];
  const combos = unblockedRange(ctx);
  const full = { ...ctx.state, players: ctx.state.players.map((p) => (p.index === ctx.hero ? { ...p, hole: ctx.hole } : p)) };
  let after;
  try {
    after = applyAction(full, action);
  } catch {
    return null;
  }
  if (after.complete || after.toAct !== v.index) return null;
  const hs = new Set(ctx.hole);
  let cAll = 0, wAll = 0, cBl = 0, wBl = 0;
  for (const c of combos) {
    const view = publicView(after, v.index);
    view.state.players[v.index].hole = [c.cards[0], c.cards[1]];
    const opts = policyDistribution(view, PROFILES[v.profile]);
    const cont = opts.filter((o) => o.kind !== 'fold').reduce((a, o) => a + o.prob, 0);
    wAll += c.weight;
    cAll += c.weight * cont;
    if (hs.has(c.cards[0]) || hs.has(c.cards[1])) {
      wBl += c.weight;
      cBl += c.weight * cont;
    }
  }
  const rc = wAll ? cAll / wAll : 0;
  const bc = wBl ? cBl / wBl : rc;
  const verdict = bc > rc + 0.05 ? 'Your cards remove hands that would have continued, so your bluff gets through slightly more often — good blockers.' : bc < rc - 0.05 ? 'Your cards mostly remove hands that would have folded, which slightly hurts your bluff (you “unblock” their calls poorly).' : 'Your cards have little net blocker effect on their calling range.';
  return { text: `Combos containing your cards would continue ${pctStr(bc)} of the time, versus ${pctStr(rc)} for their whole range. ${verdict}`, blockedContinue: bc, rangeContinue: rc };
}
