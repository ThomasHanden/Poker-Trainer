// Tournament / short-stack templates. Evaluations use:
//  - the app's computed heads-up push/fold equilibrium (chip EV), and
//  - exact EV / ICM arithmetic given explicitly stated ranges, stacks and payouts.
// Equities come from the precomputed preflop table (Monte Carlo, ~±1%).

import { POSITIONS } from '../../engine/rules';
import { getChart } from '../../ranges/presets';
import { solvePushFold, PUSHFOLD_STACKS } from '../../ranges/pushfold';
import { Range, rangeCombos, ALL_CLASSES } from '../../ranges/hands';
import { holdingEquityVsRange } from '../../ranges/preflopEquity';
import { icmEquities } from '../../engine/icm';
import { combosToRange } from '../../opponents/inference';
import { ScenarioTemplate, DecisionContext, Guidance } from '../types';
import { tourneyConfig, positionFor, stackFor, tableSizeFor, chartHeroSpec, chartGuidance } from './helpers';
import { pctStr, bbStr, rangeText } from '../../evaluation/guides';
import { betResponse } from '../../evaluation/analysis';

const nearest = (x: number) => PUSHFOLD_STACKS.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));

const TOURNEY_ASSUMPTIONS = [
  'Tournament with a big-blind ante (1bb paid by the big blind).',
  'Chip EV unless the scenario states payouts (then ICM via the Malmuth–Harville model).',
  'Equities from this app’s precomputed preflop table (Monte Carlo, about ±1%).',
];

/** Chip-EV of shoving (relative to folding) against one opponent with a known calling range. */
function shoveEVvsRange(ctx: DecisionContext, callRange: Range) {
  const me = ctx.state.players[ctx.hero];
  const villain = ctx.villains[0];
  const vp = ctx.state.players[villain.index];
  const risk = me.stack; // chips the hero adds by shoving
  const dead = ctx.pot; // everything already in the middle
  const villainCan = Math.min(vp.stack + vp.streetCommitted, me.stack + me.streetCommitted) - vp.streetCommitted;
  const heroIn = Math.min(me.stack + me.streetCommitted, vp.stack + vp.streetCommitted) - me.streetCommitted;
  const callers = rangeCombos(callRange, ctx.hole);
  const total = rangeCombos(Object.fromEntries(ALL_CLASSES.map((h) => [h, 1])), ctx.hole);
  const pCall = callers / total;
  const eq = holdingEquityVsRange(ctx.hole, callRange);
  const finalPot = dead + heroIn + villainCan;
  const ev = (1 - pCall) * dead + pCall * (eq * finalPot - heroIn);
  void risk;
  return { ev, pCall, eq, finalPot, heroIn, dead };
}

const sbShove: ScenarioTemplate = {
  id: 'tr-sb-shove',
  version: 1,
  title: 'Push or fold from the small blind',
  summary: 'Short-stacked in a tournament, folded to you in the small blind.',
  objectives: ['Use push/fold ranges at short stack depths.', 'Understand fold equity and the price the big blind gets.'],
  street: 'preflop',
  category: 'Short stack',
  concepts: ['push-fold', 'short-stack', 'blind-vs-blind'],
  lessons: ['push-fold', 'short-stack', 'fold-equity'],
  formats: ['tournament'],
  tableSizes: [6, 9],
  heroPositions: ['SB'],
  stackBB: [6, 8, 10, 12, 15],
  potType: 'srp',
  multiway: false,
  facing: 'unopened',
  difficulties: ['beginner', 'intermediate', 'advanced', 'expert'],
  evaluation: { method: 'computed-equilibrium', assumptions: [...TOURNEY_ASSUMPTIONS, 'Shove-or-fold model: limping and small raises are not modeled (they are valid in real play).'] },
  setupText: 'Tournament, short-stacked, folded to you in the small blind.',
  hint: 'At this depth a normal raise commits a big part of your stack. Compare how often the big blind folds with your equity when called.',
  build(ctx) {
    const n = tableSizeFor(ctx, [6, 9]);
    const stack = stackFor(ctx, [6, 8, 10, 12, 15]);
    if (!n || !stack || !positionFor(ctx, ['SB'])) return null;
    const chart = getChart(`pf-sb-shove-${stack}-ante`)!;
    const stacks = POSITIONS[n].map((p) => (p === 'SB' || p === 'BB' ? stack : 20 + ctx.rng.int(30)));
    return {
      config: tourneyConfig(n),
      stacksBB: stacks,
      heroPos: 'SB',
      profiles: { BB: ctx.pickProfile() },
      preflop: [],
      hero: chartHeroSpec(ctx, chart),
      params: { chartId: chart.id, stack },
    };
  },
  guide(ctx) {
    const st = nearest(ctx.effectiveBB);
    const chart = getChart(`pf-sb-shove-${st}-ante`)!;
    const g = chartGuidance(ctx, chart, []);
    const sol = solvePushFold(st, 1);
    const r = shoveEVvsRange(ctx, sol.call);
    g.math = [
      { label: 'Assumed BB calling range', value: `${((100 * rangeCombos(sol.call)) / 1326).toFixed(0)}% of hands (computed equilibrium at ${st}bb)`, kind: 'model' },
      { label: 'BB calls (after your card removal)', value: pctStr(r.pCall, 1), kind: 'exact' },
      { label: 'Your equity when called', value: pctStr(r.eq, 1), kind: 'table' },
      { label: 'EV(shove) − EV(fold)', value: `${r.ev >= 0 ? '+' : ''}${bbStr(r.ev, ctx.bb)} = P(fold)·pot + P(call)·(equity·final pot − risk)`, kind: 'exact' },
    ];
    g.reasons.push(
      `If the big blind calls with the assumed range, shoving wins the ${bbStr(r.dead, ctx.bb)} in the middle ${pctStr(1 - r.pCall, 0)} of the time and, when called, you have ${pctStr(r.eq, 0)} equity in a ${bbStr(r.finalPot, ctx.bb)} pot. That gives ${r.ev >= 0 ? 'a positive' : 'a negative'} expected value of ${bbStr(r.ev, ctx.bb)} relative to folding.`,
      'Fold equity is why weak hands can shove: you do not need to be ahead when called, as long as the big blind folds often enough.',
    );
    g.ratings.call = 'discouraged';
    g.ratings.raise = g.ratings.raise ?? 'mixed';
    g.alternatives = 'Limping and small raises are used by strong players at these depths; this model only compares shoving with folding.';
    g.tendencyNotes = ['If the big blind calls too tightly, shove wider; if they call too loosely, shove tighter (cut the weakest hands).'];
    g.sizing = { preferred: [ctx.la.maxTo / ctx.bb - 0.01, 1000], acceptable: [ctx.la.maxTo / ctx.bb - 0.01, 1000], note: 'This model only shoves all-in.', unit: 'bb-to' };
    return g;
  },
};

const bbCallShove: ScenarioTemplate = {
  id: 'tr-bb-call-shove',
  version: 1,
  title: 'Big blind facing a small-blind shove',
  summary: 'The small blind moves all-in; you are in the big blind.',
  objectives: ['Compute the price to call an all-in.', 'Compare equity against a shoving range, not a single hand.'],
  street: 'preflop',
  category: 'Short stack',
  concepts: ['push-fold', 'pot-odds', 'short-stack'],
  lessons: ['push-fold', 'pot-odds', 'equity-vs-range'],
  formats: ['tournament'],
  tableSizes: [6, 9],
  heroPositions: ['BB'],
  stackBB: [6, 8, 10, 12, 15, 20],
  potType: 'srp',
  multiway: false,
  facing: 'shove',
  difficulties: ['beginner', 'intermediate', 'advanced', 'expert'],
  evaluation: { method: 'exact-math', assumptions: [...TOURNEY_ASSUMPTIONS, 'The shover’s range is the simulated opponent’s range given its shove (based on the computed equilibrium shove range, adjusted for its profile).'] },
  setupText: 'The small blind shoves all-in. Call or fold?',
  hint: 'Work out the price first: how much do you need to call, and how big will the pot be?',
  build(ctx) {
    const n = tableSizeFor(ctx, [6, 9]);
    const stack = stackFor(ctx, [6, 8, 10, 12, 15, 20]);
    if (!n || !stack || !positionFor(ctx, ['BB'])) return null;
    const chart = getChart(`pf-bb-call-${nearest(stack)}-ante`)!;
    const stacks = POSITIONS[n].map((p) => (p === 'SB' || p === 'BB' ? stack : 20 + ctx.rng.int(30)));
    return {
      config: tourneyConfig(n),
      stacksBB: stacks,
      heroPos: 'BB',
      profiles: { SB: ctx.pickProfile() },
      preflop: [{ pos: 'SB', act: 'allin' }],
      hero: chartHeroSpec(ctx, chart, 0.5),
      params: { chartId: chart.id },
    };
  },
  guide(ctx) {
    const req = ctx.requiredEquity;
    const eq = ctx.equity?.equity ?? NaN;
    const margin = eq - req;
    const ratings: Guidance['ratings'] = {};
    if (margin >= 0.03) {
      ratings.call = 'preferred';
      ratings.fold = margin > 0.08 ? 'mistake' : 'discouraged';
    } else if (margin >= -0.02) {
      ratings.call = 'mixed';
      ratings.fold = 'mixed';
    } else {
      ratings.fold = 'preferred';
      ratings.call = margin < -0.08 ? 'mistake' : 'discouraged';
    }
    const evCall = eq * (ctx.pot + ctx.toCall) - ctx.toCall;
    const st = nearest(ctx.effectiveBB);
    const eqm = solvePushFold(st, 1).call[ctx.heroClass];
    return {
      ratings,
      reasons: [
        `Calling costs ${bbStr(ctx.toCall, ctx.bb)} to win a pot of ${bbStr(ctx.pot, ctx.bb)}, so you need ${pctStr(req, 1)} equity. All-in calls end the betting, so this pot-odds comparison is the whole decision in chip EV.`,
        `Against the modeled shoving range you have ${pctStr(eq, 1)} equity, so calling is worth ${evCall >= 0 ? '+' : ''}${bbStr(evCall, ctx.bb)} compared with folding.`,
        `For reference, the computed heads-up equilibrium calls this hand ${pctStr(eqm, 0)} of the time at ${st}bb (that assumes an equilibrium shover).`,
        'Think in ranges: the shover will not always have a monster. A wide shoving range means many medium hands are profitable calls.',
      ],
      math: [
        { label: 'Break-even equity', value: `${bbStr(ctx.toCall, ctx.bb)} / (${bbStr(ctx.pot, ctx.bb)} + ${bbStr(ctx.toCall, ctx.bb)}) = ${pctStr(req, 1)}`, kind: 'exact' },
        { label: 'Equity vs modeled shoving range', value: pctStr(eq, 1), kind: 'table' },
        { label: 'EV(call) − EV(fold)', value: `${bbStr(evCall, ctx.bb)}`, kind: 'exact' },
      ],
      plausibleRanges: rangeText(ctx),
      tendencyNotes: ['Against a tight shover (nit), call tighter; against a wide shover (LAG), call wider.', 'With payouts at stake (bubble, final table), ICM makes calls tighter than chip EV suggests.'],
      confidence: 'medium',
      source: 'exact-math',
    };
  },
};

const reshove: ScenarioTemplate = {
  id: 'tr-reshove',
  version: 1,
  title: 'Re-shove over a late-position open',
  summary: 'A bigger stack opens from late position; you can re-shove from the big blind.',
  objectives: ['Use fold equity from the opener’s wide range.', 'Calculate re-shove EV given an assumed calling range.'],
  street: 'preflop',
  category: 'Short stack',
  concepts: ['short-stack', 'push-fold', 'stack-depth'],
  lessons: ['short-stack', 'fold-equity', 'push-fold'],
  formats: ['tournament'],
  tableSizes: [6, 9],
  heroPositions: ['BB'],
  stackBB: [12, 15, 18, 22],
  potType: 'srp',
  multiway: false,
  facing: 'open',
  difficulties: ['intermediate', 'advanced', 'expert'],
  evaluation: { method: 'exact-math', assumptions: [...TOURNEY_ASSUMPTIONS, 'Chip EV. The opener’s response to a shove comes from the simulated opponent’s policy (it calls with its equilibrium-style calling range for the effective stack).'] },
  setupText: 'Tournament: a big stack opens 2.2bb from late position. You are in the big blind, short-stacked.',
  hint: 'Late-position opens are wide. How often will the opener fold to a shove, and how good is your hand when called?',
  build(ctx) {
    const n = tableSizeFor(ctx, [6, 9]);
    const stack = stackFor(ctx, [12, 15, 18, 22]);
    if (!n || !stack || !positionFor(ctx, ['BB'])) return null;
    const opener = ctx.rng.pick(['CO', 'BTN']);
    const stacks = POSITIONS[n].map((p) => (p === 'BB' ? stack : p === opener ? 35 + ctx.rng.int(30) : 15 + ctx.rng.int(40)));
    return {
      config: tourneyConfig(n),
      stacksBB: stacks,
      heroPos: 'BB',
      profiles: { [opener]: ctx.pickProfile() },
      preflop: [{ pos: opener, act: 'raise', size: { kind: 'policy' } }],
      hero: { weight: () => 1 },
      params: { opener },
    };
  },
  guide(ctx) {
    const r = betResponse(ctx, { type: 'allin' });
    const villain = ctx.villains[0];
    const ratings: Guidance['ratings'] = {};
    const reasons: string[] = [];
    const math: NonNullable<Guidance['math']> = [];
    if (r) {
      const pContinue = r.call + r.raise;
      const sub = combosToRange(r.continuing);
      const eqCalled = holdingEquityVsRange(ctx.hole, sub);
      const me = ctx.state.players[ctx.hero];
      const vp = ctx.state.players[villain.index];
      const heroIn = Math.min(me.stack, vp.stack + vp.streetCommitted - me.streetCommitted);
      const villainAdds = Math.min(me.stack + me.streetCommitted, vp.stack + vp.streetCommitted) - vp.streetCommitted;
      const finalPot = ctx.pot + heroIn + villainAdds;
      const ev = r.fold * ctx.pot + pContinue * (eqCalled * finalPot - heroIn);
      const callEq = ctx.equity?.equity ?? NaN;
      math.push(
        { label: 'Opener folds to a shove (model)', value: pctStr(r.fold, 0), kind: 'model' },
        { label: 'Your equity when called (vs the modeled calling range)', value: pctStr(eqCalled, 1), kind: 'table' },
        { label: 'EV(shove) − EV(fold)', value: `${ev >= 0 ? '+' : ''}${bbStr(ev, ctx.bb)}`, kind: 'exact' },
        { label: 'Price to just call', value: `${pctStr(ctx.requiredEquity, 1)} needed; equity vs full opening range ${pctStr(callEq, 1)}`, kind: 'table' },
      );
      reasons.push(
        `A shove risks ${bbStr(heroIn, ctx.bb)} to win the ${bbStr(ctx.pot, ctx.bb)} already in the pot. The modeled opener folds ${pctStr(r.fold, 0)} of its opening range, and when it calls you have about ${pctStr(eqCalled, 0)} equity, for an EV of ${bbStr(ev, ctx.bb)} versus folding.`,
        'Re-shoving uses the opener’s wide range against it: hands that are too weak to call a raise profitably can still be profitable shoves, because fold equity does most of the work.',
        `Flat-calling with ${ctx.effectiveBB.toFixed(0)}bb leaves an awkward stack-to-pot ratio out of position; at short depths, shove-or-fold is usually simpler and stronger, though strong hands can call to trap.`,
      );
      if (ev > ctx.bb * 0.3) {
        ratings.raise = 'preferred';
        ratings.fold = ev > ctx.bb ? 'mistake' : 'discouraged';
      } else if (ev > -ctx.bb * 0.3) {
        ratings.raise = 'mixed';
        ratings.fold = 'mixed';
      } else {
        ratings.fold = 'preferred';
        ratings.raise = ev < -ctx.bb ? 'mistake' : 'discouraged';
      }
      ratings.call = callEq > 0.55 ? 'mixed' : callEq > ctx.requiredEquity + 0.05 && ctx.effectiveBB >= 18 ? 'mixed' : 'discouraged';
    }
    return {
      ratings,
      reasons,
      math,
      plausibleRanges: rangeText(ctx),
      tendencyNotes: ['If the opener rarely folds to shoves, shove tighter and value-heavy.', 'If the opener opens very wide and folds a lot, shove wider.'],
      confidence: 'medium',
      source: 'exact-math',
      sizing: { preferred: [ctx.la.maxTo / ctx.bb - 0.01, 1000], acceptable: [0, 1000], note: 'At this depth a re-raise is normally all-in.', unit: 'bb-to' },
    };
  },
};

// ---------------- ICM templates ----------------

function icmOutcomes(ctx: DecisionContext, villainIdx: number) {
  const s = ctx.state;
  const hero = s.players[ctx.hero];
  const v = s.players[villainIdx];
  const heroTotal = hero.stack + hero.totalCommitted;
  const vTotal = v.stack + v.totalCommitted;
  const matched = Math.min(heroTotal, vTotal);
  const dead = s.players.filter((p) => p.index !== ctx.hero && p.index !== villainIdx).reduce((a, p) => a + p.totalCommitted, 0);
  const others = (fn: (i: number) => number) => s.players.map((p) => fn(p.index));
  const base = (i: number) => s.players[i].stack;
  const fold = others((i) => (i === ctx.hero ? hero.stack : i === villainIdx ? vTotal + hero.totalCommitted + dead : base(i)));
  const win = others((i) => (i === ctx.hero ? heroTotal + matched + dead : i === villainIdx ? vTotal - matched : base(i)));
  const lose = others((i) => (i === ctx.hero ? heroTotal - matched : i === villainIdx ? vTotal + matched + dead : base(i)));
  const steal = others((i) => (i === ctx.hero ? heroTotal + v.totalCommitted + dead : i === villainIdx ? v.stack : base(i)));
  return { fold, win, lose, steal };
}

const bubbleCall: ScenarioTemplate = {
  id: 'tr-bubble-call',
  version: 1,
  title: 'Bubble: calling an all-in under ICM',
  summary: 'Four players left, three get paid. The chip leader shoves into your big blind.',
  objectives: ['See why ICM makes calls tighter than chip EV.', 'Understand risk premium and the covering stack.'],
  street: 'preflop',
  category: 'Tournament pressure',
  concepts: ['icm', 'push-fold', 'pot-odds'],
  lessons: ['icm', 'chip-ev-vs-icm', 'payouts'],
  formats: ['tournament'],
  tableSizes: [6],
  heroPositions: ['BB'],
  stackBB: [10, 12, 15, 20],
  potType: 'srp',
  multiway: false,
  facing: 'shove',
  difficulties: ['advanced', 'expert'],
  evaluation: {
    method: 'icm',
    assumptions: [
      ...TOURNEY_ASSUMPTIONS,
      'Payouts 50% / 30% / 20% of the prize pool for 1st–3rd; 4th gets nothing.',
      'ICM via the Malmuth–Harville model: ignores skill, position and future blind pressure.',
      'The shover’s range is the simulated opponent’s chip-EV shoving range (real chip leaders shove even wider on the bubble).',
    ],
  },
  setupText: 'Bubble: 4 players left, 3 paid (50/30/20). The chip leader in the small blind shoves; you are in the big blind.',
  hint: 'Losing this pot busts you in 4th with nothing, while folding keeps you alive with two shorter stacks at the table. Chips you lose are worth more than chips you win.',
  build(ctx) {
    if (!positionFor(ctx, ['BB'])) return null;
    const hero = stackFor(ctx, [10, 12, 15, 20]);
    if (!hero) return null;
    // 6-max table with UTG and HJ empty-folded: model 4 players as CO, BTN, SB, BB
    const shorts = [6 + ctx.rng.int(6), 8 + ctx.rng.int(8)];
    const leader = 40 + ctx.rng.int(25);
    const n = 4;
    const stacksBB = [shorts[0], shorts[1], leader, hero];
    const payouts = [50, 30, 20];
    return {
      config: tourneyConfig(n),
      stacksBB,
      heroPos: 'BB',
      profiles: { SB: ctx.pickProfile() },
      preflop: [
        { pos: 'CO', act: 'fold' },
        { pos: 'BTN', act: 'fold' },
        { pos: 'SB', act: 'allin' },
      ],
      hero: { weight: () => 1 },
      icm: { payouts, stacksBB, playersLeft: 4, description: '4 players left, 3 paid: 50% / 30% / 20%.' },
      params: {},
    };
  },
  guide: icmGuide('call'),
};

const ftShove: ScenarioTemplate = {
  id: 'tr-icm-shove',
  version: 1,
  title: 'Final table: shove or fold under ICM',
  summary: 'Six-handed final table, folded to you in the small blind; the big blind covers you.',
  objectives: ['Compare chip-EV and ICM shoving decisions.', 'Account for being covered by the big blind.'],
  street: 'preflop',
  category: 'Tournament pressure',
  concepts: ['icm', 'push-fold', 'short-stack'],
  lessons: ['icm', 'final-table', 'push-fold'],
  formats: ['tournament'],
  tableSizes: [6],
  heroPositions: ['SB'],
  stackBB: [8, 10, 12, 15],
  potType: 'srp',
  multiway: false,
  facing: 'unopened',
  difficulties: ['advanced', 'expert'],
  evaluation: {
    method: 'icm',
    assumptions: [
      ...TOURNEY_ASSUMPTIONS,
      'Payouts 36/23/16/11/8/6% for 1st–6th.',
      'ICM via the Malmuth–Harville model.',
      'The big blind calls with the simulated opponent’s chip-EV calling range. Under ICM a real big blind should call tighter, which would make shoving better than shown.',
    ],
  },
  setupText: 'Final table, six players left. Everyone folds to you in the small blind. The big blind has you covered.',
  hint: 'You are not the shortest stack. Busting now costs you the chance to ladder up while shorter stacks bust first.',
  build(ctx) {
    if (!positionFor(ctx, ['SB'])) return null;
    const hero = stackFor(ctx, [8, 10, 12, 15]);
    if (!hero) return null;
    const stacksBB = [4 + ctx.rng.int(5), 15 + ctx.rng.int(20), 20 + ctx.rng.int(20), 12 + ctx.rng.int(15), hero, 30 + ctx.rng.int(30)];
    const payouts = [36, 23, 16, 11, 8, 6];
    return {
      config: tourneyConfig(6),
      stacksBB,
      heroPos: 'SB',
      profiles: { BB: ctx.pickProfile() },
      preflop: [],
      hero: chartHeroSpec(ctx, getChart(`pf-sb-shove-${nearest(hero)}-ante`)!),
      icm: { payouts, stacksBB, playersLeft: 6, description: '6 players left: 36 / 23 / 16 / 11 / 8 / 6%.' },
      params: {},
    };
  },
  guide: icmGuide('shove'),
};

function icmGuide(kind: 'call' | 'shove') {
  return (ctx: DecisionContext): Guidance => {
    const payouts = ctx.icm!.payouts;
    const reasons: string[] = [];
    const math: NonNullable<Guidance['math']> = [];
    const ratings: Guidance['ratings'] = {};
    const v = ctx.villains[0];
    if (!v) return { ratings, reasons: ['No opponent'], confidence: 'low', source: 'icm' };
    const o = icmOutcomes(ctx, v.index);
    const pay = (stacks: number[]) => icmEquities(stacks, payouts)[ctx.hero];
    const eFold = pay(o.fold);
    const eWin = pay(o.win);
    const eLose = pay(o.lose);
    const eSteal = pay(o.steal);
    if (kind === 'call') {
      const eq = ctx.equity?.equity ?? NaN;
      const eCall = eq * eWin + (1 - eq) * eLose;
      const reqIcm = (eFold - eLose) / (eWin - eLose);
      const reqChip = ctx.requiredEquity;
      math.push(
        { label: 'Chip-EV break-even equity', value: pctStr(reqChip, 1), kind: 'exact' },
        { label: 'ICM break-even equity', value: pctStr(reqIcm, 1), kind: 'exact' },
        { label: 'Risk premium', value: pctStr(reqIcm - reqChip, 1), kind: 'exact' },
        { label: 'Equity vs modeled shoving range', value: pctStr(eq, 1), kind: 'table' },
        { label: 'Prize equity: fold / call', value: `${eFold.toFixed(2)}% / ${eCall.toFixed(2)}% of the prize pool`, kind: 'exact' },
      );
      reasons.push(
        `In chips you would need ${pctStr(reqChip, 1)} equity, but in prize equity (ICM) you need ${pctStr(reqIcm, 1)}. The extra ${pctStr(reqIcm - reqChip, 1)} is the risk premium: busting costs you your guaranteed share of the payouts, while doubling up adds less prize equity than the chips suggest.`,
        `Your equity against the modeled shoving range is ${pctStr(eq, 1)}, so calling is ${eCall > eFold ? 'better' : 'worse'} than folding by ${Math.abs(eCall - eFold).toFixed(2)}% of the prize pool.`,
        'Shorter stacks at the table matter: while they are at risk of busting first, folding has extra value for you.',
      );
      const d = eCall - eFold;
      if (d > 0.4) {
        ratings.call = 'preferred';
        ratings.fold = d > 1.5 ? 'mistake' : 'discouraged';
      } else if (d > -0.4) {
        ratings.call = 'mixed';
        ratings.fold = 'mixed';
      } else {
        ratings.fold = 'preferred';
        ratings.call = d < -1.5 ? 'mistake' : 'discouraged';
      }
      if (eq > reqChip && eq < reqIcm) reasons.push('This hand would be a call in chip EV but not under ICM — exactly the kind of spot where tournament and cash strategy differ.');
    } else {
      const r = betResponse(ctx, { type: 'allin' });
      const st = nearest(ctx.effectiveBB);
      const callRange = r && r.continuing.length ? combosToRange(r.continuing) : solvePushFold(st, 1).call;
      const eqCalled = holdingEquityVsRange(ctx.hole, callRange);
      const pFold = r ? r.fold : 0.5;
      const eShove = pFold * eSteal + (1 - pFold) * (eqCalled * eWin + (1 - eqCalled) * eLose);
      const chip = shoveEVvsRange(ctx, callRange);
      math.push(
        { label: 'Big blind folds (model)', value: pctStr(pFold, 0), kind: 'model' },
        { label: 'Equity when called', value: pctStr(eqCalled, 1), kind: 'table' },
        { label: 'Chip EV of shove vs fold', value: `${chip.ev >= 0 ? '+' : ''}${bbStr(chip.ev, ctx.bb)}`, kind: 'exact' },
        { label: 'Prize equity: fold / shove', value: `${eFold.toFixed(2)}% / ${eShove.toFixed(2)}%`, kind: 'exact' },
      );
      reasons.push(
        `Folding keeps ${eFold.toFixed(2)}% of the prize pool; shoving is worth ${eShove.toFixed(2)}% under the stated assumptions (big blind folds ${pctStr(pFold, 0)}, you have ${pctStr(eqCalled, 0)} when called).`,
        'Being covered means a call can bust you, so losses are costly under ICM; the big blind, also under ICM pressure, should call tighter than shown here — which would make shoving more attractive.',
        `For comparison, in chip EV the shove is worth ${bbStr(chip.ev, ctx.bb)}.`,
      );
      const d = eShove - eFold;
      if (d > 0.15) {
        ratings.raise = 'preferred';
        ratings.fold = d > 0.6 ? 'mistake' : 'discouraged';
      } else if (d > -0.15) {
        ratings.raise = 'mixed';
        ratings.fold = 'mixed';
      } else {
        ratings.fold = 'preferred';
        ratings.raise = d < -0.6 ? 'mistake' : 'discouraged';
      }
      ratings.call = 'discouraged';
    }
    return {
      ratings,
      reasons,
      math,
      plausibleRanges: rangeText(ctx),
      tendencyNotes: [
        'Real chip leaders on the bubble shove wider than a chip-EV range, which improves your calls somewhat — but the risk premium still applies.',
        'Payout structures with large jumps (top-heavy) increase ICM pressure for medium stacks.',
      ],
      confidence: 'medium',
      source: 'icm',
    };
  };
}

export const TOURNAMENT_TEMPLATES: ScenarioTemplate[] = [sbShove, bbCallShove, reshove, bubbleCall, ftShove];
