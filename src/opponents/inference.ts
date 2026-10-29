// Bayesian range inference against the shared opponent policy.
// Starting from all combos not blocked by known cards, each observed action multiplies a combo's
// weight by the probability that the policy would take that action holding that combo.

import { Card } from '../engine/cards';
import { HandState, applyAction, legalActions, ActionRecord } from '../engine/rules';
import { ALL_CLASSES, combosOf, WeightedCombo, Range, emptyRange, comboCount } from '../ranges/hands';
import { policyDistribution, publicView, actionLikelihood } from './policy';
import { OpponentProfile } from './profiles';

/** All combos not containing any dead card, weight 1. */
export function allCombos(dead: Card[]): WeightedCombo[] {
  const d = new Set(dead);
  const out: WeightedCombo[] = [];
  for (const h of ALL_CLASSES) for (const c of combosOf(h)) if (!d.has(c[0]) && !d.has(c[1])) out.push({ cards: c, weight: 1, cls: h });
  return out;
}

/**
 * Replay `history` from `base` (the state right after blinds were posted) and weight each of the
 * villain's candidate combos by the likelihood of each villain action.
 * `dead` = cards the observer knows (their own hole cards + visible board).
 * `upTo` = number of history records to consider (default all).
 */
export function inferRange(
  base: HandState,
  history: ActionRecord[],
  villain: number,
  profile: OpponentProfile,
  dead: Card[],
  upTo = history.length,
  candidates?: WeightedCombo[],
): WeightedCombo[] {
  let combos = (candidates ?? allCombos(dead)).map((c) => ({ ...c }));
  let st = base;
  const startIdx = base.history.length;
  for (let i = startIdx; i < upTo; i++) {
    const rec = history[i];
    if (rec.type === 'post-sb' || rec.type === 'post-bb' || rec.type === 'post-ante') continue;
    if (rec.player === villain) {
      const la = legalActions(st)!;
      for (const c of combos) {
        if (c.weight <= 0) continue;
        // public view with the candidate combo in the villain's hand
        const view = publicView(st, villain);
        view.state.players[villain].hole = [c.cards[0], c.cards[1]];
        const opts = policyDistribution(view, profile);
        c.weight *= actionLikelihood(opts, { type: rec.type, to: rec.to }, la);
      }
      combos = combos.filter((c) => c.weight > 1e-12);
    }
    st = applyRecord(st, rec);
  }
  return normaliseCombos(combos);
}

export function applyRecord(st: HandState, rec: ActionRecord): HandState {
  const a = rec.type === 'bet' || rec.type === 'raise' ? { type: rec.type, to: rec.to } : { type: rec.type as 'fold' | 'check' | 'call' };
  // board cards are dealt from st.deck; the replay base must have the same deck order
  return applyAction(st, a, rec.scripted);
}

export function normaliseCombos(combos: WeightedCombo[]): WeightedCombo[] {
  const max = combos.reduce((m, c) => Math.max(m, c.weight), 0);
  if (max <= 0) return [];
  return combos.map((c) => ({ ...c, weight: c.weight / max }));
}

/** Aggregate combos into a class-level weighted range for display (fraction of each class's combos). */
export function combosToRange(combos: WeightedCombo[]): Range {
  const r = emptyRange();
  for (const c of combos) r[c.cls] += c.weight;
  for (const h of ALL_CLASSES) r[h] = Math.min(1, r[h] / comboCount(h));
  return r;
}

export function totalWeight(combos: WeightedCombo[]): number {
  return combos.reduce((a, c) => a + c.weight, 0);
}

/** Sample a combo proportionally to weight, avoiding `used` cards. Returns null if impossible. */
export function sampleCombo(combos: WeightedCombo[], u: () => number, used: Set<Card>): WeightedCombo | null {
  const live = combos.filter((c) => !used.has(c.cards[0]) && !used.has(c.cards[1]) && c.weight > 0);
  const t = totalWeight(live);
  if (t <= 0) return null;
  let x = u() * t;
  for (const c of live) {
    x -= c.weight;
    if (x <= 0) return c;
  }
  return live[live.length - 1];
}
