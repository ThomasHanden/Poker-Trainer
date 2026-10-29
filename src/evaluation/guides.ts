// Reusable guidance builders. Each produces ratings plus mechanism-level reasons computed from
// the DecisionContext. They are heuristic (instructional) unless the math is exact.

import { DecisionContext, Guidance, ActionKey } from '../scenarios/types';
import { betResponse, rangeBreakdown } from './analysis';
import { PROFILES } from '../opponents/profiles';
import { potFractionTo } from '../engine/rules';

export const pctStr = (x: number, d = 0) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : 'n/a');
export const bbStr = (chips: number, bb: number) => `${+(chips / bb).toFixed(2)}bb`;

export function equityLine(ctx: DecisionContext): string {
  const e = ctx.equity;
  if (!e || !Number.isFinite(e.equity)) return 'Equity against the modeled range is unavailable.';
  const how = e.method === 'exact' ? 'exact enumeration' : e.samples ? `simulation, ${e.samples.toLocaleString()} samples, ±${pctStr(1.96 * e.stdError, 1)}` : e.source;
  return `Your equity against the modeled range is ${pctStr(e.equity, 1)} (${how}).`;
}

export function equityMath(ctx: DecisionContext): Guidance['math'] {
  const out: NonNullable<Guidance['math']> = [];
  if (ctx.toCall > 0) {
    out.push({ label: 'Break-even equity to call', value: `${bbStr(ctx.toCall, ctx.bb)} / (${bbStr(ctx.pot, ctx.bb)} + ${bbStr(ctx.toCall, ctx.bb)}) = ${pctStr(ctx.requiredEquity, 1)}`, kind: 'exact' });
  }
  const e = ctx.equity;
  if (e && Number.isFinite(e.equity)) {
    out.push({
      label: 'Equity vs modeled range',
      value: `${pctStr(e.equity, 1)}${e.method === 'simulation' && e.samples ? ` ± ${pctStr(1.96 * e.stdError, 1)} (95%)` : ''}`,
      kind: e.method === 'exact' ? 'exact' : e.samples ? 'simulation' : 'table',
    });
  }
  out.push({ label: 'Stack-to-pot ratio (SPR)', value: ctx.spr.toFixed(1), kind: 'exact' });
  return out;
}

export function rangeText(ctx: DecisionContext): string {
  return ctx.villains
    .map((v) => {
      const b = rangeBreakdown(v.combos, ctx.board);
      const parts = b
        .filter((x) => x.share >= 0.03)
        .map((x) => `${x.label} ${pctStr(x.share)}${x.examples.length ? ` (e.g. ${x.examples.slice(0, 3).join(', ')})` : ''}`);
      return `${v.position} (${PROFILES[v.profile].short}), weighting each hand by how likely the modeled player is to have taken these actions with it: ${parts.join('; ')}.`;
    })
    .join(' ');
}

export function positionText(ctx: DecisionContext): string {
  if (ctx.board.length === 0) return ctx.inPosition ? 'You will act last after the flop (in position).' : 'You will act first after the flop (out of position), which makes it harder to realize your equity.';
  return ctx.inPosition
    ? 'You are in position: you see your opponent act before every decision, which lets you realize more equity and control the pot size.'
    : 'You are out of position: you act first on every street, so you realize less of your equity and face more difficult decisions on later streets.';
}

export function textureText(ctx: DecisionContext): string {
  const t = ctx.texture;
  if (!t) return '';
  const notes: string[] = [`Board: ${t.label}.`];
  if (t.wetness >= 0.45) notes.push('Many draws are possible, so hand strengths change a lot on later streets: equity denial and protection matter more, and the preflop raiser’s overpairs/top pairs are more vulnerable.');
  else if (t.wetness <= 0.25) notes.push('Few draws are possible, so the current best hand usually stays best. Equity denial matters less, and small bets work well.');
  if (t.paired) notes.push('A paired board reduces the number of strong combinations (trips are rare), which usually favors the player with more overpairs and high cards.');
  if (t.monotone) notes.push('With three cards of one suit, any single card of that suit is a big deal: made flushes and the nut-flush draw dominate.');
  return notes.join(' ');
}

export function sprText(ctx: DecisionContext): string {
  const spr = ctx.spr;
  if (spr <= 2) return `SPR is low (${spr.toFixed(1)}): one or two bets get the stacks in, so top pair–type hands are usually strong enough to commit and there is little room for elaborate bluffs.`;
  if (spr <= 6) return `SPR is moderate (${spr.toFixed(1)}): three bets (flop, turn, river) can get the stacks in, so plan your sizing so that strong hands can build the pot.`;
  return `SPR is high (${spr.toFixed(1)}): stacks are deep relative to the pot, so one-pair hands should be cautious about building a huge pot and drawing/nut-potential hands gain value.`;
}

// ---------------- Facing a bet ----------------

export function facingBetGuidance(ctx: DecisionContext, opts: { allowImplied?: boolean } = {}): Guidance {
  const eq = ctx.equity?.equity ?? NaN;
  const req = ctx.requiredEquity;
  const margin = eq - req;
  const draw = ctx.draws && ctx.street !== 'river' && ctx.draws.drawEquity >= 0.15;
  const implied = (opts.allowImplied ?? true) && draw && ctx.spr >= 3 && ctx.street !== 'river';
  const strong = (ctx.percentile ?? 0) >= 0.95 || eq >= 0.72;
  const ratings: Guidance['ratings'] = {};
  const reasons: string[] = [];
  reasons.push(`You must call ${bbStr(ctx.toCall, ctx.bb)} to win a pot of ${bbStr(ctx.pot, ctx.bb)}, so a call breaks even with ${pctStr(req, 1)} equity if no more money goes in (pot odds).`);
  reasons.push(equityLine(ctx));
  if (!Number.isFinite(eq)) {
    return { ratings: {}, reasons, confidence: 'low', source: 'heuristic' };
  }
  if (margin >= 0.06) {
    ratings.call = 'preferred';
    ratings.fold = margin >= 0.12 ? 'mistake' : 'discouraged';
    reasons.push(`Your equity exceeds the price by ${pctStr(margin, 0)}, so folding gives up a clearly profitable continue.`);
  } else if (margin >= -0.03) {
    ratings.call = 'mixed';
    ratings.fold = 'mixed';
    reasons.push('This is close: equity is roughly equal to the price. Position, how well your hand plays on later streets, and the opponent’s tendencies decide it.');
  } else if (implied && margin >= -0.12) {
    ratings.call = 'mixed';
    ratings.fold = 'mixed';
    reasons.push(`Your immediate equity is ${pctStr(-margin, 0)} short of the price, but with SPR ${ctx.spr.toFixed(1)} you can win more when the draw completes (implied odds). That only works if your opponent will pay off — and if your draw is to the nuts or near-nuts.`);
  } else {
    ratings.fold = 'preferred';
    ratings.call = margin < -0.15 ? 'mistake' : 'discouraged';
    reasons.push(`You are ${pctStr(-margin, 0)} short of the required equity and ${implied ? 'implied odds are not enough to close a gap that large' : 'there is little to win on later streets to make up for it'}.`);
  }
  if (ctx.la.canRaise) {
    if (strong) {
      ratings.raise = 'preferred';
      if (ratings.call === 'preferred') ratings.call = 'mixed';
      reasons.push('Your hand is strong enough to raise for value: many worse hands in the modeled range can continue, and raising builds the pot while you are ahead.');
    } else if (draw && ctx.draws!.drawEquity >= 0.3 && ctx.facing === 'bet') {
      ratings.raise = 'mixed';
      reasons.push('A strong draw can raise as a semi-bluff: you win immediately when they fold and still have plenty of equity when called.');
    } else {
      ratings.raise = eq < 0.3 && !draw ? 'discouraged' : 'discouraged';
    }
  }
  return {
    ratings,
    reasons,
    confidence: ctx.street === 'river' && ctx.villains.length === 1 ? 'medium' : 'low',
    source: 'heuristic',
    math: equityMath(ctx),
    plausibleRanges: rangeText(ctx),
    tendencyNotes: tendencyFacing(ctx),
  };
}

export function tendencyFacing(ctx: DecisionContext): string[] {
  const out: string[] = [];
  out.push('Against players who bluff more than the model (aggressive, LAG), call more often with bluff-catchers; against players who rarely bluff (nits, stations), fold more of your medium hands to big bets.');
  if (ctx.street !== 'river') out.push('Players who pay off when draws complete increase your implied odds; tight players who shut down on scary cards reduce them.');
  return out;
}

// ---------------- Betting (checked to / first to act) ----------------

export interface BetOpts {
  valueThreshold?: number; // equity vs range needed to call it a value bet
  smallBoard?: boolean; // prefer small sizing
  bluffOk?: boolean;
}

export function sizingForTexture(ctx: DecisionContext, kind: 'range' | 'polar' | 'value'): Guidance['sizing'] {
  const wet = ctx.texture?.wetness ?? 0.4;
  if (kind === 'range') {
    return wet <= 0.3
      ? { preferred: [0.2, 0.4], acceptable: [0.15, 0.6], note: 'On a dry board where you have the range advantage, a small bet (about 25–40% pot) gets folds from hands with little equity and keeps worse hands in.' }
      : { preferred: [0.45, 0.8], acceptable: [0.3, 1.0], note: 'On a wetter board, bets are usually larger (about half to three-quarters pot) to charge draws and protect vulnerable hands.' };
  }
  if (kind === 'polar') return { preferred: [0.66, 1.3], acceptable: [0.5, 2.0], note: 'A polarized range (very strong hands and bluffs) can use a large size: the strong hands want to build the pot, and the bluffs need maximum fold equity.' };
  return { preferred: [0.33, 0.8], acceptable: [0.25, 1.1], note: 'Value bet a size that worse hands can still call.' };
}

export function betSizeFraction(ctx: DecisionContext, to: number): number {
  const mine = ctx.state.players[ctx.hero].streetCommitted;
  if (ctx.toCall > 0 || ctx.state.currentBet > 0) {
    // pot-relative raise: increment over call, divided by pot after calling
    const callAmt = ctx.state.currentBet - mine;
    return (to - ctx.state.currentBet) / Math.max(1, ctx.pot + callAmt);
  }
  return (to - mine) / Math.max(1, ctx.pot);
}

/** Describe what a bet does under the model: who calls, who folds. */
export function betMechanics(ctx: DecisionContext, fractions: number[]): string[] {
  if (ctx.villains.length !== 1) return [];
  const out: string[] = [];
  for (const f of fractions) {
    const to = potFractionTo(ctx.state, f);
    if (!(ctx.la.canBet || ctx.la.canRaise)) break;
    const r = betResponse(ctx, { type: ctx.la.canBet ? 'bet' : 'raise', to });
    if (!r) continue;
    out.push(
      `Betting ${Math.round(f * 100)}% pot: the modeled opponent folds ${pctStr(r.fold)}, calls ${pctStr(r.call)}, raises ${pctStr(r.raise)}. ` +
        `${pctStr(r.worseCalls)} of their range is currently worse than you and continues (value), while ${pctStr(r.betterFolds)} is currently better and folds.` +
        (Number.isFinite(r.equityWhenCalled) ? ` When called you win ${pctStr(r.equityWhenCalled)} of the time.` : ''),
    );
  }
  return out;
}

export function rate(map: Partial<Record<ActionKey, Guidance['ratings'][ActionKey]>>): Guidance['ratings'] {
  return map;
}

/** Generic betting guidance when checked to or first to act. */
export function bettingGuidance(ctx: DecisionContext, opts: BetOpts = {}): Guidance {
  const eq = ctx.equity?.equity ?? NaN;
  const vt = opts.valueThreshold ?? (ctx.street === 'river' ? 0.6 : 0.62);
  const draw = ctx.draws && ctx.street !== 'river' ? ctx.draws.drawEquity : 0;
  const reasons: string[] = [equityLine(ctx)];
  const ratings: Guidance['ratings'] = {};
  let sizing: Guidance['sizing'];
  if (eq >= vt + 0.15) {
    ratings.bet = 'preferred';
    ratings.check = 'mixed';
    reasons.push('You are well ahead of the modeled range, so betting gets value from worse hands and denies equity to draws. Checking can still be reasonable to keep bluffs in or to protect your checking range.');
    sizing = sizingForTexture(ctx, ctx.street === 'river' ? 'polar' : 'value');
  } else if (eq >= vt) {
    ratings.bet = 'preferred';
    ratings.check = 'mixed';
    reasons.push('You are ahead of enough of the range to bet for value, but some better hands will continue, so moderate sizes are usually best.');
    sizing = sizingForTexture(ctx, 'value');
  } else if (eq >= 0.4) {
    ratings.check = 'preferred';
    ratings.bet = 'mixed';
    reasons.push('Medium-strength hands have showdown value. Betting tends to fold out worse hands and get called by better ones; checking realizes your equity cheaply.');
    sizing = { preferred: [0.25, 0.45], acceptable: [0.2, 0.66], note: 'If you bet a medium hand, keep it small so worse hands can call.' };
  } else if (draw >= 0.25) {
    ratings.bet = 'mixed';
    ratings.check = 'mixed';
    reasons.push('With a strong draw, betting as a semi-bluff wins the pot now when they fold and keeps equity when called. Checking takes a free card.');
    sizing = sizingForTexture(ctx, 'polar');
  } else {
    ratings.check = 'preferred';
    ratings.bet = opts.bluffOk ? 'mixed' : 'discouraged';
    reasons.push('With little showdown value and little equity, a bet must win mostly through folds. Choose bluffs that have blockers or backdoor equity, and only when the opponent folds enough.');
    sizing = sizingForTexture(ctx, 'polar');
  }
  return { ratings, reasons, sizing, confidence: 'low', source: 'heuristic', math: equityMath(ctx), plausibleRanges: rangeText(ctx) };
}
