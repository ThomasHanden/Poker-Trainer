// Postflop templates (flop, turn, river). Evaluation combines heuristic strategic guidance
// (rated per hand class / texture) with model-based facts: equity vs the inferred range,
// bet-response under the opponent model, range advantage and blocker effects.

import { Card, rankOf, suitOf } from '../../engine/cards';
import { getChart } from '../../ranges/presets';
import { Range } from '../../ranges/hands';
import { potFractionTo } from '../../engine/rules';
import { ScenarioTemplate, ScenarioScript, BuildContext, DecisionContext, Guidance, ScriptAction, StreetScript, TemplateMeta } from '../types';
import { cashConfig, evenStacks, tableSizeFor, positionFor, stackFor, boards, cardsOn, pct, draws, made, mixWeight, STRONG_MADE } from './helpers';
import {
  bettingGuidance,
  facingBetGuidance,
  sizingForTexture,
  betMechanics,
  equityLine,
  equityMath,
  rangeText,
  pctStr,
  bbStr,
} from '../../evaluation/guides';
import { rangeAdvantage, blockersFacingBet, blockersForBet } from '../../evaluation/postflop';
import { betResponse } from '../../evaluation/analysis';
import { PROFILES } from '../../opponents/profiles';

const POSTFLOP_ASSUMPTIONS = [
  'Strategic ratings are heuristic teaching guidance (not solver output).',
  'Opponent ranges and responses come from the simulated opponent model and its stated profile.',
  'Equities are exact on the turn/river (enumeration) and simulated on the flop vs the modeled range.',
];

type Base = 'btn-bb' | 'co-btn' | 'bb-3bet-btn' | 'co-btn-bb' | 'co-btn-bb:btn' | 'co-btn-bb:bb';

interface PreflopBase {
  heroRange: Range;
  preflop: ScriptAction[];
  heroPos: string;
  villains: string[];
}

function preflopBase(kind: Base, heroSide: 'pfr' | 'caller'): PreflopBase {
  switch (kind) {
    case 'btn-bb': {
      const pfr = getChart('cash6-open-BTN')!.raise;
      const def = getChart('cash6-BB-vs-BTN')!.call;
      return {
        heroRange: heroSide === 'pfr' ? pfr : def,
        preflop: [
          { pos: 'BTN', act: 'raise', size: { kind: 'bb', to: 2.5 } },
          { pos: 'SB', act: 'fold' },
          { pos: 'BB', act: 'call' },
        ],
        heroPos: heroSide === 'pfr' ? 'BTN' : 'BB',
        villains: [heroSide === 'pfr' ? 'BB' : 'BTN'],
      };
    }
    case 'co-btn':
      return {
        heroRange: getChart('cash6-open-CO')!.raise,
        preflop: [
          { pos: 'CO', act: 'raise', size: { kind: 'bb', to: 2.5 } },
          { pos: 'BTN', act: 'call' },
          { pos: 'SB', act: 'fold' },
          { pos: 'BB', act: 'fold' },
        ],
        heroPos: 'CO',
        villains: ['BTN'],
      };
    case 'co-btn-bb':
      return {
        heroRange: getChart('cash6-open-CO')!.raise,
        preflop: [
          { pos: 'CO', act: 'raise', size: { kind: 'bb', to: 2.5 } },
          { pos: 'BTN', act: 'call' },
          { pos: 'SB', act: 'fold' },
          { pos: 'BB', act: 'call' },
        ],
        heroPos: 'CO',
        villains: ['BTN', 'BB'],
      };
    // the same three-way pot seen from the callers' seats
    case 'co-btn-bb:btn':
    case 'co-btn-bb:bb': {
      const btn = kind === 'co-btn-bb:btn';
      return {
        heroRange: btn ? getChart('cash6-BTN-vs-CO')!.call : getChart('cash6-BB-vs-CO')!.call,
        preflop: [
          { pos: 'CO', act: 'raise', size: { kind: 'bb', to: 2.5 } },
          { pos: 'BTN', act: 'call' },
          { pos: 'SB', act: 'fold' },
          { pos: 'BB', act: 'call' },
        ],
        heroPos: btn ? 'BTN' : 'BB',
        villains: btn ? ['CO', 'BB'] : ['CO', 'BTN'],
      };
    }
    case 'bb-3bet-btn':
      return {
        heroRange: getChart('cash6-BB-vs-BTN')!.raise,
        preflop: [
          { pos: 'BTN', act: 'raise', size: { kind: 'bb', to: 2.5 } },
          { pos: 'SB', act: 'fold' },
          { pos: 'BB', act: 'raise', size: { kind: 'policy' } },
          { pos: 'BTN', act: 'call' },
        ],
        heroPos: 'BB',
        villains: ['BTN'],
      };
  }
}

interface PostflopCfg {
  meta: Omit<TemplateMeta, 'version' | 'formats' | 'tableSizes' | 'evaluation'> & { assumptions?: string[] };
  base: Base;
  heroSide: 'pfr' | 'caller';
  streets: (ctx: BuildContext) => { flop?: StreetScript; turn?: StreetScript; river?: StreetScript } | null;
  heroFilter: (ctx: BuildContext) => { filter?: (h: Card[], b: Card[]) => boolean; weight?: (h: Card[], b: Card[]) => number };
  guide: (ctx: DecisionContext) => Guidance;
  params?: (ctx: BuildContext) => Record<string, unknown>;
}

function postflopTemplate(cfg: PostflopCfg): ScenarioTemplate {
  return {
    ...cfg.meta,
    version: 1,
    formats: ['cash'],
    tableSizes: [6],
    evaluation: { method: 'heuristic+model', assumptions: [...POSTFLOP_ASSUMPTIONS, ...(cfg.meta.assumptions ?? [])] },
    build(ctx) {
      if (!tableSizeFor(ctx, [6])) return null;
      const pb = preflopBase(cfg.base, cfg.heroSide);
      if (!positionFor(ctx, [pb.heroPos])) return null;
      const stack = stackFor(ctx, cfg.meta.stackBB);
      if (!stack) return null;
      const st = cfg.streets(ctx);
      if (!st) return null;
      const profiles: ScenarioScript['profiles'] = {};
      for (const v of pb.villains) profiles[v] = ctx.pickProfile();
      const hf = cfg.heroFilter(ctx);
      return {
        config: cashConfig(6),
        stacksBB: evenStacks(6, stack),
        heroPos: pb.heroPos,
        profiles,
        preflop: pb.preflop,
        ...st,
        hero: { range: pb.heroRange, filter: hf.filter, weight: hf.weight },
        params: { base: cfg.base, heroSide: cfg.heroSide, ...(cfg.params ? cfg.params(ctx) : {}) },
      };
    },
    guide(ctx) {
      const g = cfg.guide(ctx);
      g.plausibleRanges = g.plausibleRanges ?? rangeText(ctx);
      g.math = g.math ?? equityMath(ctx);
      const prof = ctx.villains[0] ? PROFILES[ctx.villains[0].profile] : undefined;
      g.tendencyNotes = [...(g.tendencyNotes ?? []), ...(prof ? prof.exploitNotes.map((n) => `${prof.short}: ${n}`) : [])];
      return g;
    },
  };
}

const heroRangeFor = (ctx: DecisionContext): Range => preflopBase(ctx.params.base as Base, ctx.params.heroSide as 'pfr' | 'caller').heroRange;

const isStrong = (h: Card[], b: Card[]) => STRONG_MADE.includes(made(h, b)) || pct(h, b) >= 0.9;
const isAir = (h: Card[], b: Card[]) => pct(h, b) < 0.5 && draws(h, b).drawEquity < 0.15;
const isMedium = (h: Card[], b: Card[]) => {
  const p = pct(h, b);
  return p >= 0.6 && p < 0.88;
};
const hasDraw = (h: Card[], b: Card[]) => draws(h, b).drawEquity >= 0.25;

const btnCheck = (pos: string): ScriptAction => ({ pos, act: 'check' });

// ---------------- Flop ----------------

const cbetDry = postflopTemplate({
  meta: {
    id: 'fl-cbet-dry-ip',
    title: 'C-bet in position on a dry high-card board',
    summary: 'You opened the button, the big blind called and checked. Dry A/K/Q-high flop.',
    objectives: ['Use range advantage to bet small and often.', 'Pick a size that pressures hands with little equity.'],
    street: 'flop',
    category: 'Continuation betting',
    concepts: ['cbet', 'range-advantage', 'board-texture', 'bet-sizing'],
    lessons: ['cbetting', 'range-advantage', 'board-texture', 'small-vs-large'],
    heroPositions: ['BTN'],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'checked-to',
    difficulties: ['beginner', 'intermediate', 'advanced', 'expert'],
    setupText: 'Single-raised pot, button vs big blind. The big blind checks to you.',
    hint: 'Who is more likely to have hit this high card: the preflop raiser or the big blind? How much do you need to bet to make their weak hands fold?',
  },
  base: 'btn-bb',
  heroSide: 'pfr',
  streets: () => ({ flop: { cards: boards.aceOrKingHighDry, actions: [btnCheck('BB')] } }),
  heroFilter: (ctx) => ({ weight: mixWeight(ctx, (h, b) => isStrong(h, b) || isAir(h, b), isMedium) }),
  guide(ctx) {
    const adv = rangeAdvantage(heroRangeFor(ctx), ctx.villains[0].combos, ctx.board);
    const p = ctx.percentile ?? 0;
    const mc = ctx.made?.cls ?? 'nothing';
    const topPlus = STRONG_MADE.includes(mc) || ['overpair', 'top-pair-strong', 'top-pair-weak'].includes(mc);
    const ratings: Guidance['ratings'] = {};
    const reasons: string[] = [adv.text];
    if (topPlus) {
      ratings.bet = 'preferred';
      ratings.check = 'mixed';
      reasons.push('Top pair or better bets for value: many weaker pairs and ace-high hands will call a small bet.');
    } else if (p >= 0.6) {
      ratings.bet = 'mixed';
      ratings.check = 'mixed';
      reasons.push('Medium pairs can bet small (thin value and protection against overcards) or check to control the pot and keep a balanced checking range; both are reasonable.');
    } else {
      ratings.bet = 'preferred';
      ratings.check = 'mixed';
      reasons.push('With the range advantage, a small bet makes the big blind fold many hands with little equity, so even weak hands profit from betting. Hands with backdoor draws are the best of these bets; giving up with the very worst is also fine.');
    }
    reasons.push(equityLine(ctx), ...betMechanics(ctx, [0.33, 0.75]));
    return {
      ratings,
      reasons,
      sizing: sizingForTexture(ctx, 'range'),
      alternatives: 'Checking some hands (especially medium pairs and the weakest hands with no backdoors) is reasonable. Using a larger size is not wrong in itself, but it folds out the hands you want to keep in and risks more with your weaker bets.',
      confidence: 'medium',
      source: 'heuristic',
    };
  },
});

const cbetWet = postflopTemplate({
  meta: {
    id: 'fl-cbet-wet-ip',
    title: 'C-bet in position on a low, connected board',
    summary: 'Button vs big blind; a low connected flop that favors the caller.',
    objectives: ['Recognize when the caller has the range advantage.', 'Check more, and bet bigger when you do bet.'],
    street: 'flop',
    category: 'Continuation betting',
    concepts: ['cbet', 'board-texture', 'range-advantage', 'checking-range'],
    lessons: ['cbetting', 'board-texture', 'range-advantage'],
    heroPositions: ['BTN'],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'checked-to',
    difficulties: ['intermediate', 'advanced', 'expert'],
    setupText: 'Single-raised pot, button vs big blind. Low connected flop; the big blind checks.',
    hint: 'The big blind defends many small and suited hands. Which range makes more two pair, sets and straights here?',
  },
  base: 'btn-bb',
  heroSide: 'pfr',
  streets: () => ({ flop: { cards: boards.wetLow, actions: [btnCheck('BB')] } }),
  heroFilter: (ctx) => ({ weight: mixWeight(ctx, (h, b) => isStrong(h, b) || isAir(h, b), (h, b) => isMedium(h, b) || hasDraw(h, b)) }),
  guide(ctx) {
    const adv = rangeAdvantage(heroRangeFor(ctx), ctx.villains[0].combos, ctx.board);
    const p = ctx.percentile ?? 0;
    const d = ctx.draws?.drawEquity ?? 0;
    const ratings: Guidance['ratings'] = {};
    const reasons: string[] = [adv.text];
    let sizing = sizingForTexture(ctx, 'polar');
    if (p >= 0.88) {
      ratings.bet = 'preferred';
      ratings.check = 'mixed';
      reasons.push('Strong hands bet, and bet bigger: this board has many draws, so you charge them and protect a hand that is vulnerable to the turn.');
    } else if (d >= 0.3) {
      ratings.bet = 'preferred';
      ratings.check = 'mixed';
      reasons.push('A strong draw is a good semi-bluff: you can win now, and you have plenty of equity when called.');
    } else if (d >= 0.15) {
      ratings.bet = 'mixed';
      ratings.check = 'mixed';
      reasons.push('A weaker draw can bet or check; checking takes a free card in position.');
    } else if (p >= 0.6) {
      ratings.check = 'preferred';
      ratings.bet = 'mixed';
      reasons.push('Medium one-pair hands prefer checking on a board that favors the caller: bets get called by better hands and draws and raised by strong hands.');
      sizing = { preferred: [0.25, 0.5], acceptable: [0.2, 0.7], note: 'If you bet a medium hand, keep it small.' };
    } else {
      ratings.check = 'preferred';
      ratings.bet = 'discouraged';
      reasons.push('Without the range advantage, weak hands with no draw should mostly give up: the big blind continues with many pairs and draws, and check-raises often.');
    }
    reasons.push(equityLine(ctx), ...betMechanics(ctx, [0.33, 0.75]));
    return { ratings, reasons, sizing, alternatives: 'On this texture the preflop raiser checks much more often than on dry high boards; a range-wide small bet is a common leak.', confidence: 'medium', source: 'heuristic' };
  },
});

const cbetOOP = postflopTemplate({
  meta: {
    id: 'fl-cbet-oop',
    title: 'C-bet out of position as the preflop raiser',
    summary: 'You opened the cutoff, the button called. You act first on the flop.',
    objectives: ['See how being out of position lowers c-bet frequency.', 'Build a checking range that includes some strong hands.'],
    street: 'flop',
    category: 'Continuation betting',
    concepts: ['cbet', 'position', 'checking-range'],
    lessons: ['cbetting', 'position', 'equity-denial-realization'],
    heroPositions: ['CO'],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'first-to-act',
    difficulties: ['intermediate', 'advanced', 'expert'],
    setupText: 'Single-raised pot: you opened the cutoff, the button called. You are out of position.',
    hint: 'The button will act after you on every street. What happens to your weak bets when they get called?',
  },
  base: 'co-btn',
  heroSide: 'pfr',
  streets: () => ({ flop: { cards: boards.medium, actions: [] } }),
  heroFilter: (ctx) => ({ weight: mixWeight(ctx, (h, b) => isStrong(h, b) || isAir(h, b), (h, b) => isMedium(h, b) || hasDraw(h, b)) }),
  guide(ctx) {
    const adv = rangeAdvantage(heroRangeFor(ctx), ctx.villains[0].combos, ctx.board);
    const p = ctx.percentile ?? 0;
    const d = ctx.draws?.drawEquity ?? 0;
    const dry = (ctx.texture?.wetness ?? 0.5) <= 0.3;
    const ratings: Guidance['ratings'] = {};
    const reasons: string[] = [adv.text];
    if (p >= 0.88) {
      ratings.bet = 'preferred';
      ratings.check = 'mixed';
      reasons.push('Strong hands usually bet for value, but checking some of them protects your checking range so the button cannot bet freely whenever you check.');
    } else if (d >= 0.25) {
      ratings.bet = 'mixed';
      ratings.check = 'mixed';
      reasons.push('Strong draws can bet or check (and check-raise). Out of position, betting denies equity and wins the pot now.');
    } else if (p >= 0.6) {
      ratings.check = 'preferred';
      ratings.bet = 'mixed';
      reasons.push('Medium hands do well checking out of position: they have showdown value but do not want to face a raise or build a big pot without position.');
    } else {
      ratings.check = 'preferred';
      ratings.bet = dry ? 'mixed' : 'discouraged';
      reasons.push(dry ? 'On dry boards some weak hands can still bet small, because the caller has many misses.' : 'Weak hands without a draw prefer checking: out of position, a called bluff leaves you guessing on every later street.');
    }
    reasons.push(equityLine(ctx), ...betMechanics(ctx, [0.33, 0.66]));
    return { ratings, reasons, sizing: { preferred: [0.3, 0.66], acceptable: [0.2, 0.85], note: 'Out of position, a third to two-thirds of the pot is typical.' }, confidence: 'medium', source: 'heuristic' };
  },
});

const cbet3bp = postflopTemplate({
  meta: {
    id: 'fl-cbet-3bp',
    title: 'C-bet in a 3-bet pot (low SPR)',
    summary: 'You 3-bet from the big blind and the button called. You act first.',
    objectives: ['Play a low-SPR pot: commitment thresholds and small bets.', 'Use the 3-bettor’s range advantage on high boards.'],
    street: 'flop',
    category: 'Continuation betting',
    concepts: ['cbet', 'spr', 'range-advantage'],
    lessons: ['position-spr', 'cbetting', 'range-advantage'],
    heroPositions: ['BB'],
    stackBB: [100],
    potType: '3bp',
    multiway: false,
    facing: 'first-to-act',
    difficulties: ['intermediate', 'advanced', 'expert'],
    setupText: '3-bet pot: you 3-bet the button from the big blind and got called. You act first on the flop.',
    hint: 'With about four pots behind, how many bets does it take to get all-in? Which board cards favor the 3-bettor?',
  },
  base: 'bb-3bet-btn',
  heroSide: 'pfr',
  streets: () => ({ flop: { cards: boards.notMonotone, actions: [] } }),
  heroFilter: (ctx) => ({ weight: mixWeight(ctx, (h, b) => isStrong(h, b) || isAir(h, b), (h, b) => isMedium(h, b) || hasDraw(h, b)) }),
  guide(ctx) {
    const adv = rangeAdvantage(heroRangeFor(ctx), ctx.villains[0].combos, ctx.board);
    const high = (ctx.texture?.highRank ?? 0) >= 10;
    const p = ctx.percentile ?? 0;
    const d = ctx.draws?.drawEquity ?? 0;
    const ratings: Guidance['ratings'] = {};
    const reasons: string[] = [adv.text];
    if (p >= 0.85) {
      ratings.bet = 'preferred';
      ratings.check = 'mixed';
      reasons.push('At this SPR, top pair or better is usually strong enough to commit. Betting starts building the pot so that stacks go in by the river.');
    } else if (high) {
      ratings.bet = p >= 0.55 || d >= 0.15 ? 'preferred' : 'mixed';
      ratings.check = 'mixed';
      reasons.push('On high boards the 3-bettor has more big pairs and broadway hands, so a small bet with much of the range is effective.');
    } else if (d >= 0.25) {
      ratings.bet = 'mixed';
      ratings.check = 'mixed';
      reasons.push('Draws can semi-bluff; at low SPR, a raise from your opponent may put you all-in, so prefer draws with good equity.');
    } else {
      ratings.check = 'preferred';
      ratings.bet = 'mixed';
      reasons.push('Low boards connect with the caller’s pairs and suited connectors, so check more often with weak hands.');
    }
    reasons.push(equityLine(ctx), ...betMechanics(ctx, [0.25, 0.5]));
    return {
      ratings,
      reasons,
      sizing: high ? { preferred: [0.2, 0.4], acceptable: [0.15, 0.6], note: 'Small bets (about a quarter to a third of the pot) are standard in 3-bet pots: the pot is already large relative to the stacks.' } : { preferred: [0.33, 0.6], acceptable: [0.25, 0.8], note: 'On low boards bets are a bit larger and less frequent.' },
      confidence: 'medium',
      source: 'heuristic',
    };
  },
});

const defendCbet = postflopTemplate({
  meta: {
    id: 'fl-defend-cbet',
    title: 'Facing a c-bet in the big blind',
    summary: 'You defended the big blind, checked, and the button continuation-bets.',
    objectives: ['Use pot odds and equity vs a betting range.', 'Know when to raise rather than call.'],
    street: 'flop',
    category: 'Facing bets',
    concepts: ['pot-odds', 'mdf', 'facing-raise', 'equity-realization'],
    lessons: ['pot-odds', 'mdf', 'equity-denial-realization', 'check-raising'],
    heroPositions: ['BB'],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'bet',
    difficulties: ['beginner', 'intermediate', 'advanced', 'expert'],
    setupText: 'You called a button open from the big blind and checked the flop. The button bets.',
    hint: 'Start with the price: what equity do you need to call? Then ask whether your hand will realize that equity out of position.',
  },
  base: 'btn-bb',
  heroSide: 'caller',
  streets: (ctx) => ({ flop: { cards: boards.notMonotone, actions: [btnCheck('BB'), { pos: 'BTN', act: 'bet', size: { kind: ctx.difficulty === 'beginner' || ctx.rng.next() < 0.5 ? 'policy' : 'policy-large' } }] } }),
  heroFilter: (ctx) => ({ weight: mixWeight(ctx, (h, b) => isStrong(h, b) || isAir(h, b), (h, b) => isMedium(h, b) || hasDraw(h, b)) }),
  guide(ctx) {
    const g = facingBetGuidance(ctx);
    const betSize = ctx.toCall;
    const potBefore = ctx.pot - betSize;
    const mdf = potBefore / (potBefore + betSize);
    g.reasons.push(
      `Minimum defense frequency for this size is ${pctStr(mdf)}: if you fold more than ${pctStr(1 - mdf)} of your range, any two cards would profit as a bluff (in a simplified model). It is a benchmark for your whole range, not a rule for a single hand — on the flop, equity realization and future streets matter.`,
    );
    return g;
  },
});

const checkRaiseDraw = postflopTemplate({
  meta: {
    id: 'fl-checkraise-draw',
    title: 'Check-raise a strong draw',
    summary: 'You defended the big blind with a strong draw; the button c-bets small.',
    objectives: ['Combine fold equity and draw equity.', 'Choose between calling and raising with draws.'],
    street: 'flop',
    category: 'Semi-bluffing',
    concepts: ['semi-bluff', 'check-raise', 'equity-realization'],
    lessons: ['value-bluff-semibluff', 'check-raising', 'fold-equity'],
    heroPositions: ['BB'],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'bet',
    difficulties: ['intermediate', 'advanced', 'expert'],
    setupText: 'You defended your big blind and checked. The button makes a small c-bet. You have a draw.',
    hint: 'A raise wins immediately when they fold and still has lots of equity when called. What does calling give up?',
  },
  base: 'btn-bb',
  heroSide: 'caller',
  streets: () => ({ flop: { cards: (c) => boards.twoTone(c) || boards.wet(c), actions: [btnCheck('BB'), { pos: 'BTN', act: 'bet', size: { kind: 'policy' } }] } }),
  heroFilter: () => ({ filter: (h, b) => draws(h, b).drawEquity >= 0.28 && pct(h, b) < 0.85 }),
  guide(ctx) {
    const d = ctx.draws!;
    const g = facingBetGuidance(ctx);
    const combo = d.drawEquity >= 0.4 || (d.flushDraw && (d.openEnded || d.gutshot)) || d.nutFlushDraw;
    g.ratings.fold = 'mistake';
    g.ratings.raise = combo ? 'preferred' : 'mixed';
    g.ratings.call = combo ? 'mixed' : 'preferred';
    const raiseTo = potFractionTo(ctx.state, 0.75);
    const r = betResponse(ctx, { type: 'raise', to: raiseTo });
    g.reasons.unshift(
      `Your draw has about ${pctStr(d.drawEquity, 0)} raw equity from ${d.strongOuts} strong outs over two cards — far more than the ${pctStr(ctx.requiredEquity, 0)} needed to call, so folding is never right here.`,
      combo
        ? 'With a very strong draw, raising is attractive: it adds fold equity on top of your draw equity, and if you get called you still have close to a coin flip.'
        : 'With a regular draw, both calling and raising are fine: calling keeps the button’s bluffs in and realizes your equity cheaply; raising adds fold equity.',
    );
    if (r) g.reasons.push(`Under the model, a check-raise to ${bbStr(raiseTo, ctx.bb)} makes the button fold ${pctStr(r.fold)} of its betting range.`);
    g.sizing = { preferred: [0.6, 1.0], acceptable: [0.4, 1.3], note: 'Check-raises are usually around 3–4x a small c-bet (roughly 60–100% of the pot after calling).' };
    g.confidence = 'medium';
    return g;
  },
});

const slowplayDry = postflopTemplate({
  meta: {
    id: 'fl-check-strong',
    title: 'Checking a strong hand on a dry board',
    summary: 'You flopped a very strong hand on a dry board as the in-position raiser.',
    objectives: ['Understand when checking strong hands is reasonable.', 'Protect your checking range.'],
    street: 'flop',
    category: 'Checking strong hands',
    concepts: ['checking-range', 'value-bet', 'exploit'],
    lessons: ['cbetting', 'value-bluff-semibluff', 'exploitative-adjustments'],
    heroPositions: ['BTN'],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'checked-to',
    difficulties: ['advanced', 'expert'],
    setupText: 'Button vs big blind. You flopped a very strong hand on a dry board; the big blind checks.',
    hint: 'How many cards can hurt you on the turn? How much of their range can call a bet right now?',
  },
  base: 'btn-bb',
  heroSide: 'pfr',
  streets: () => ({ flop: { cards: boards.veryDry, actions: [btnCheck('BB')] } }),
  heroFilter: () => ({ filter: (h, b) => pct(h, b) >= 0.96 }),
  guide(ctx) {
    const prof = ctx.villains[0].profile;
    const ratings: Guidance['ratings'] = { bet: 'mixed', check: 'mixed' };
    const reasons: string[] = [
      'On a dry board few turn cards change who is ahead, so checking a very strong hand costs little in protection. It also keeps the opponent’s bluffs and weak pairs in, and makes your checking range harder to attack.',
      'Betting small is also good: it gets value from the pairs and ace-high hands that call small bets.',
    ];
    if (prof === 'lag') {
      ratings.check = 'preferred';
      reasons.push('Against an aggressive opponent, checking is attractive: they will often bet or bluff into you later.');
    } else if (prof === 'station') {
      ratings.bet = 'preferred';
      reasons.push('Against a calling station, betting is better: they call bets with weak hands, so you do not need to trap.');
    }
    reasons.push(equityLine(ctx), ...betMechanics(ctx, [0.33, 0.75]));
    return {
      ratings,
      reasons,
      sizing: { preferred: [0.2, 0.45], acceptable: [0.15, 0.66], note: 'If you bet, bet small: big bets fold out almost everything you beat on such a dry board.' },
      confidence: 'medium',
      source: 'heuristic',
      mixed: true,
    };
  },
});

const multiwayCbet = postflopTemplate({
  meta: {
    id: 'fl-multiway-cbet',
    title: 'C-bet in a three-way pot',
    summary: 'You opened the cutoff; the button and big blind called. Big blind checks.',
    objectives: ['Bet less often multiway.', 'Favor value and strong draws over pure bluffs.'],
    street: 'flop',
    category: 'Multiway',
    concepts: ['multiway', 'cbet', 'bluff'],
    lessons: ['multiway', 'cbetting'],
    heroPositions: ['CO'],
    stackBB: [100],
    potType: 'srp',
    multiway: true,
    facing: 'checked-to',
    difficulties: ['intermediate', 'advanced', 'expert'],
    setupText: 'Three-way single-raised pot. The big blind checks to you; the button is still to act behind you.',
    hint: 'With two opponents, how likely is it that at least one of them connected with the board?',
  },
  base: 'co-btn-bb',
  heroSide: 'pfr',
  streets: () => ({ flop: { cards: boards.notMonotone, actions: [btnCheck('BB')] } }),
  heroFilter: (ctx) => ({ weight: mixWeight(ctx, (h, b) => isStrong(h, b) || isAir(h, b), (h, b) => isMedium(h, b) || hasDraw(h, b)) }),
  guide(ctx) {
    const p = ctx.percentile ?? 0;
    const d = ctx.draws?.drawEquity ?? 0;
    const ratings: Guidance['ratings'] = {};
    const reasons: string[] = [
      'Against two opponents, a bluff must get through both of them. If each folds 55% of the time independently, both fold only about 30% of the time.',
      'The player behind you can also raise, and you are sandwiched; medium hands should mostly check.',
    ];
    if (p >= 0.88) {
      ratings.bet = 'preferred';
      ratings.check = 'mixed';
      reasons.push('Strong hands bet: with two opponents there are more hands that can call you.');
    } else if (d >= 0.3) {
      ratings.bet = 'mixed';
      ratings.check = 'mixed';
      reasons.push('Strong draws can bet as semi-bluffs; they have equity when called.');
    } else if (p >= 0.6) {
      ratings.check = 'preferred';
      ratings.bet = 'mixed';
    } else {
      ratings.check = 'preferred';
      ratings.bet = 'discouraged';
      reasons.push('Pure bluffs lose value multiway.');
    }
    reasons.push(equityLine(ctx));
    return { ratings, reasons, sizing: { preferred: [0.33, 0.66], acceptable: [0.25, 0.85], note: 'Multiway bets are value-heavy, so medium-to-large sizes are common.' }, confidence: 'medium', source: 'heuristic' };
  },
});

const facingCheckRaise = postflopTemplate({
  meta: {
    id: 'fl-facing-checkraise',
    title: 'Facing a flop check-raise',
    summary: 'You c-bet the button and the big blind check-raises.',
    objectives: ['Read the strength of a check-raising range.', 'Continue with hands that have enough equity.'],
    street: 'flop',
    category: 'Facing raises',
    concepts: ['facing-raise', 'check-raise', 'pot-odds'],
    lessons: ['check-raising', 'pot-odds', 'narrowing-ranges'],
    heroPositions: ['BTN'],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'raise',
    difficulties: ['intermediate', 'advanced', 'expert'],
    setupText: 'You c-bet small on the button and the big blind check-raises.',
    hint: 'Which hands does the big blind check-raise with, and how do you do against them?',
  },
  base: 'btn-bb',
  heroSide: 'pfr',
  streets: () => ({ flop: { cards: boards.notMonotone, actions: [btnCheck('BB'), { pos: 'BTN', act: 'bet', size: { kind: 'pot', fraction: 0.33 } }, { pos: 'BB', act: 'raise', size: { kind: 'policy' } }] } }),
  heroFilter: (ctx) => ({ weight: mixWeight(ctx, (h, b) => pct(h, b) >= 0.93 || isAir(h, b), (h, b) => isMedium(h, b) || hasDraw(h, b) || made(h, b) === 'overpair') }),
  guide(ctx) {
    const g = facingBetGuidance(ctx);
    g.reasons.unshift('A check-raise range is polarized toward strong hands and draws; one-pair hands that were happy to bet small are often in a much worse spot now.');
    return g;
  },
});

// ---------------- Turn ----------------

const turnBarrel = postflopTemplate({
  meta: {
    id: 'tu-barrel',
    title: 'Turn barrel after a called c-bet',
    summary: 'You c-bet the flop on the button, got called, and the big blind checks the turn.',
    objectives: ['Choose which turn cards are good to keep betting.', 'Barrel with value and equity; give up with hopeless hands.'],
    street: 'turn',
    category: 'Turn play',
    concepts: ['barreling', 'board-texture', 'semi-bluff'],
    lessons: ['turn-river-planning', 'geometric-sizing', 'value-bluff-semibluff'],
    heroPositions: ['BTN'],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'checked-to',
    difficulties: ['intermediate', 'advanced', 'expert'],
    setupText: 'You c-bet the flop and the big blind called. On the turn they check again.',
    hint: 'Did the turn card improve your range or theirs? Does your hand have equity if called?',
  },
  base: 'btn-bb',
  heroSide: 'pfr',
  streets: (ctx) => {
    const tt = ctx.rng.pick(['overcard', 'brick', 'flush']);
    return {
      flop: { cards: tt === 'flush' ? boards.twoTone : boards.notMonotone, actions: [btnCheck('BB'), { pos: 'BTN', act: 'bet', size: { kind: 'pot', fraction: 0.33 } }, { pos: 'BB', act: 'call' }] },
      turn: { cards: tt === 'overcard' ? cardsOn.overcard : tt === 'flush' ? cardsOn.flushCompleting : cardsOn.brick, actions: [btnCheck('BB')] },
    };
  },
  heroFilter: (ctx) => ({ weight: mixWeight(ctx, (h, b) => isStrong(h, b) || isAir(h, b), (h, b) => isMedium(h, b) || hasDraw(h, b)) }),
  guide(ctx) {
    const turn = ctx.board[3];
    const prior = ctx.board.slice(0, 3);
    const over = rankOf(turn) > Math.max(...prior.map(rankOf));
    const flushy = prior.filter((c) => suitOf(c) === suitOf(turn)).length >= 2;
    const p = ctx.percentile ?? 0;
    const d = ctx.draws?.drawEquity ?? 0;
    const ratings: Guidance['ratings'] = {};
    const reasons: string[] = [];
    reasons.push(
      over
        ? 'The turn is an overcard. High cards favor the preflop raiser (more big cards in your range, fewer in the big blind’s flop-calling range), so this is a good card to continue betting.'
        : flushy
          ? 'The turn completes a flush draw. The big blind called the flop with many draws, so this card improves their range; barrel mostly with strong hands and with hands holding a card of the flush suit (blockers).'
          : 'The turn is a low, mostly blank card: it changes little, so the big blind’s flop calls (pairs and draws) are still there.',
    );
    if (p >= 0.85) {
      ratings.bet = 'preferred';
      ratings.check = 'mixed';
      reasons.push('Strong hands keep betting for value: worse pairs and draws still call.');
    } else if (d >= 0.18) {
      ratings.bet = over ? 'preferred' : 'mixed';
      ratings.check = 'mixed';
      reasons.push('Draws make good barrels: you win when they fold now, and you can still hit on the river.');
    } else if (p >= 0.6) {
      ratings.check = 'preferred';
      ratings.bet = 'mixed';
      reasons.push('Medium hands prefer pot control: betting again is called mostly by better hands and draws.');
    } else {
      const blocker = flushy && ctx.hole.some((c) => suitOf(c) === suitOf(turn));
      ratings.check = over || blocker ? 'mixed' : 'preferred';
      ratings.bet = over || blocker ? 'mixed' : 'discouraged';
      reasons.push(over || blocker ? 'A weak hand can bluff on a card that favors you (or with a blocker), but it has no equity if called — choose these bluffs selectively.' : 'Hands with no equity and no good card to represent should usually give up.');
    }
    reasons.push(equityLine(ctx), ...betMechanics(ctx, [0.5, 0.75]));
    return { ratings, reasons, sizing: { preferred: [0.5, 0.8], acceptable: [0.33, 1.1], note: 'Turn barrels are typically half to three-quarters of the pot, setting up a river shove or large bet (geometric sizing).' }, confidence: 'medium', source: 'heuristic' };
  },
});

const turnProbe = postflopTemplate({
  meta: {
    id: 'tu-probe',
    title: 'Turn probe after the raiser checks back',
    summary: 'The button checked back the flop. You are first to act on the turn from the big blind.',
    objectives: ['Recognize a capped checking range.', 'Bet for value and protection when the aggressor declined to bet.'],
    street: 'turn',
    category: 'Turn play',
    concepts: ['probe', 'range-advantage', 'value-bet'],
    lessons: ['probe-donk', 'range-advantage', 'capped-uncapped'],
    heroPositions: ['BB'],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'first-to-act',
    difficulties: ['intermediate', 'advanced', 'expert'],
    setupText: 'You defended the big blind; the flop went check-check. You act first on the turn.',
    hint: 'The button would usually bet its strong hands on the flop. What does its check say about its range?',
  },
  base: 'btn-bb',
  heroSide: 'caller',
  streets: () => ({ flop: { cards: boards.notMonotone, actions: [btnCheck('BB'), btnCheck('BTN')] }, turn: { cards: cardsOn.any, actions: [] } }),
  heroFilter: (ctx) => ({ weight: mixWeight(ctx, (h, b) => isStrong(h, b) || isAir(h, b), (h, b) => isMedium(h, b) || hasDraw(h, b)) }),
  guide(ctx) {
    const eq = ctx.equity?.equity ?? 0;
    const d = ctx.draws?.drawEquity ?? 0;
    const ratings: Guidance['ratings'] = {};
    const reasons: string[] = ['The button checked back the flop, so its range is capped: it contains fewer very strong hands, and many medium and weak hands that want a cheap showdown.'];
    if (eq >= 0.6) {
      ratings.bet = 'preferred';
      ratings.check = 'mixed';
      reasons.push('You are ahead of most of that capped range: bet to get value from the medium hands that will call.');
    } else if (eq >= 0.45) {
      ratings.bet = 'mixed';
      ratings.check = 'mixed';
      reasons.push('Medium hands can probe for thin value and protection, or check to control the pot.');
    } else if (d >= 0.18) {
      ratings.bet = 'mixed';
      ratings.check = 'mixed';
      reasons.push('Draws are good probes: weak hands in the capped range fold, and you have equity when called.');
    } else {
      ratings.check = 'preferred';
      ratings.bet = 'mixed';
      reasons.push('Some weak hands can probe as bluffs because the capped range folds often, but most should check.');
    }
    reasons.push(equityLine(ctx), ...betMechanics(ctx, [0.5, 0.75]));
    return { ratings, reasons, sizing: { preferred: [0.4, 0.75], acceptable: [0.25, 1.0], note: 'Probes are commonly half to three-quarters of the pot.' }, confidence: 'medium', source: 'heuristic' };
  },
});

const delayedCbet = postflopTemplate({
  meta: {
    id: 'tu-delayed-cbet',
    title: 'Delayed c-bet on the turn',
    summary: 'You checked back the flop on the button; the big blind checks the turn too.',
    objectives: ['Use a delayed c-bet when the opponent shows weakness twice.'],
    street: 'turn',
    category: 'Turn play',
    concepts: ['delayed-cbet', 'cbet', 'bluff'],
    lessons: ['delayed-cbet', 'cbetting'],
    heroPositions: ['BTN'],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'checked-to',
    difficulties: ['intermediate', 'advanced', 'expert'],
    setupText: 'You checked back the flop as the preflop raiser. The big blind checks again on the turn.',
    hint: 'The big blind has checked twice. Strong hands would often have bet by now.',
  },
  base: 'btn-bb',
  heroSide: 'pfr',
  streets: () => ({ flop: { cards: boards.notMonotone, actions: [btnCheck('BB'), btnCheck('BTN')] }, turn: { cards: cardsOn.any, actions: [btnCheck('BB')] } }),
  heroFilter: (ctx) => ({ weight: mixWeight(ctx, (h, b) => isStrong(h, b) || isAir(h, b), (h, b) => isMedium(h, b) || hasDraw(h, b)) }),
  guide(ctx) {
    const g = bettingGuidance(ctx, { bluffOk: true, valueThreshold: 0.58 });
    g.reasons.unshift('The big blind checked twice, which weakens its range (it would probe-bet many strong hands and draws). Your own flop check means you also have fewer strong hands, so bets do not need to be huge.');
    g.reasons.push(...betMechanics(ctx, [0.5, 0.75]));
    g.sizing = { preferred: [0.4, 0.75], acceptable: [0.3, 1.0], note: 'Delayed c-bets are commonly half to two-thirds of the pot.' };
    g.confidence = 'medium';
    return g;
  },
});

const turnDrawCall = postflopTemplate({
  meta: {
    id: 'tu-draw-call',
    title: 'Calling a turn bet with a draw',
    summary: 'You have a draw on the turn and face a sizeable bet.',
    objectives: ['Compare outs with pot odds.', 'Account for implied and reverse implied odds.'],
    street: 'turn',
    category: 'Drawing hands',
    concepts: ['pot-odds', 'implied-odds', 'semi-bluff'],
    lessons: ['outs', 'implied-odds', 'pot-odds'],
    heroPositions: ['BB'],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'bet',
    difficulties: ['beginner', 'intermediate', 'advanced', 'expert'],
    setupText: 'You called a flop c-bet from the big blind with a draw. The button bets again on the turn.',
    hint: 'Count your outs. With one card to come, each out is worth about 2%. Do you get enough from the pot — and from future bets?',
  },
  base: 'btn-bb',
  heroSide: 'caller',
  streets: () => ({
    flop: { cards: (c) => boards.twoTone(c) || boards.wet(c), actions: [btnCheck('BB'), { pos: 'BTN', act: 'bet', size: { kind: 'policy' } }, { pos: 'BB', act: 'call' }] },
    turn: { cards: cardsOn.blank, actions: [btnCheck('BB'), { pos: 'BTN', act: 'bet', size: { kind: 'policy-large' } }] },
  }),
  heroFilter: () => ({ filter: (h, b) => draws(h, b).drawEquity >= 0.15 && pct(h, b) < 0.75 }),
  guide(ctx) {
    const d = ctx.draws!;
    const g = facingBetGuidance(ctx);
    const outsEq = d.strongOuts / 46;
    g.reasons.unshift(
      `You have about ${d.strongOuts} clean outs to a straight or better: ${d.strongOuts}/46 ≈ ${pctStr(outsEq, 1)} to hit on the river (rule of 2: ${d.strongOuts * 2}%). Outs can be “dirty” if they also improve the opponent.`,
      `Implied odds: if you hit, you may win more on the river. To break even you would need to win about ${bbStr(Math.max(0, (ctx.toCall - outsEq * (ctx.pot + ctx.toCall)) / Math.max(0.01, outsEq)), ctx.bb)} more on average when you hit.`,
    );
    g.math = [
      ...(g.math ?? []),
      { label: 'Outs-based equity (one card)', value: `${d.strongOuts}/46 = ${pctStr(outsEq, 1)}`, kind: 'exact' },
    ];
    return g;
  },
});

const turnOverbet = postflopTemplate({
  meta: {
    id: 'tu-overbet',
    title: 'Turn overbet with a nut advantage',
    summary: 'You have a very strong hand on the turn; the big blind’s range is capped.',
    objectives: ['Use overbets when you have many nut hands and the opponent has few.'],
    street: 'turn',
    category: 'Bet sizing',
    concepts: ['overbet', 'bet-sizing', 'range-advantage'],
    lessons: ['overbets-underbets', 'range-advantage', 'geometric-sizing'],
    heroPositions: ['BTN'],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'checked-to',
    difficulties: ['advanced', 'expert'],
    setupText: 'You c-bet the flop and were called. The big blind checks the turn and you hold a very strong hand.',
    hint: 'How many very strong hands can the big blind have after calling the flop and checking? How big can you bet to get stacks in by the river?',
  },
  base: 'btn-bb',
  heroSide: 'pfr',
  streets: () => ({
    flop: { cards: boards.notMonotone, actions: [btnCheck('BB'), { pos: 'BTN', act: 'bet', size: { kind: 'pot', fraction: 0.33 } }, { pos: 'BB', act: 'call' }] },
    turn: { cards: cardsOn.any, actions: [btnCheck('BB')] },
  }),
  heroFilter: () => ({ filter: (h, b) => pct(h, b) >= 0.97 }),
  guide(ctx) {
    const adv = rangeAdvantage(heroRangeFor(ctx), ctx.villains[0].combos, ctx.board);
    const capped = adv.villainStrong < 0.12;
    const ratings: Guidance['ratings'] = { bet: 'preferred', check: ctx.villains[0].profile === 'lag' ? 'mixed' : 'discouraged' };
    const reasons = [
      adv.text,
      'With a very strong hand you want the pot as large as possible by the river. Two streets remain, so a large bet now plus a river bet can get the stacks in (geometric sizing).',
      capped
        ? 'Their range has few very strong hands (it is capped), so they cannot raise you often, and their medium hands face a tough decision against a big bet — the classic overbet spot.'
        : 'Their range still contains a fair number of strong hands, so a large but not extreme size is enough.',
      equityLine(ctx),
      ...betMechanics(ctx, [0.75, 1.25]),
    ];
    return {
      ratings,
      reasons,
      sizing: capped ? { preferred: [1.0, 1.6], acceptable: [0.6, 2.2], note: 'Overbets (100–150% pot) maximize value when you have the nut advantage.' } : { preferred: [0.66, 1.25], acceptable: [0.5, 1.8], note: 'A large bet builds the pot for the river.' },
      confidence: 'medium',
      source: 'heuristic',
    };
  },
});

// ---------------- River ----------------

const riverCheckedTo: StreetScript['actions'] = [btnCheck('BB')];
const pfrLine = (turnBet: boolean): { flop: StreetScript; turn: StreetScript } => ({
  flop: { cards: boards.notMonotone, actions: [btnCheck('BB'), { pos: 'BTN', act: 'bet', size: { kind: 'pot', fraction: 0.33 } }, { pos: 'BB', act: 'call' }] },
  turn: { cards: cardsOn.any, actions: turnBet ? [btnCheck('BB'), { pos: 'BTN', act: 'bet', size: { kind: 'pot', fraction: 0.66 } }, { pos: 'BB', act: 'call' }] : [btnCheck('BB'), btnCheck('BTN')] },
});

const riverThinValue = postflopTemplate({
  meta: {
    id: 'rv-thin-value',
    title: 'River thin value bet',
    summary: 'Checked to you on the river with a decent but not dominant hand.',
    objectives: ['Bet only when worse hands call often enough.', 'Size small for thin value.'],
    street: 'river',
    category: 'River play',
    concepts: ['thin-value', 'value-bet', 'bet-sizing'],
    lessons: ['thin-value', 'value-bluff-semibluff', 'what-a-bet-does'],
    heroPositions: ['BTN'],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'checked-to',
    difficulties: ['beginner', 'intermediate', 'advanced', 'expert'],
    setupText: 'You c-bet the flop, checked the turn, and the big blind checks the river to you.',
    hint: 'A value bet needs worse hands to call. Which worse hands in their range can call, and which better hands might raise?',
  },
  base: 'btn-bb',
  heroSide: 'pfr',
  streets: () => ({ ...pfrLine(false), river: { cards: cardsOn.any, actions: riverCheckedTo } }),
  heroFilter: () => ({ filter: (h, b) => {
    const p = pct(h, b);
    return p >= 0.68 && p < 0.94;
  } }),
  guide(ctx) {
    const small = betResponse(ctx, { type: 'bet', to: potFractionTo(ctx.state, 0.33) });
    const big = betResponse(ctx, { type: 'bet', to: potFractionTo(ctx.state, 0.75) });
    const ratings: Guidance['ratings'] = {};
    const reasons: string[] = [];
    const e = small?.equityWhenCalled ?? NaN;
    if (small) {
      reasons.push(
        `If you bet a third of the pot, the modeled opponent calls or raises ${pctStr(small.call + small.raise)} of the time and you win ${pctStr(e)} when called. A value bet is profitable when you win more than half the time when called (and are rarely raised off the best hand).`,
      );
    }
    if (Number.isFinite(e) && e >= 0.55) {
      ratings.bet = 'preferred';
      ratings.check = 'mixed';
    } else if (Number.isFinite(e) && e >= 0.45) {
      ratings.bet = 'mixed';
      ratings.check = 'mixed';
      reasons.push('This is close to the break-even line for a value bet; checking back is reasonable.');
    } else {
      ratings.check = 'preferred';
      ratings.bet = 'discouraged';
      reasons.push('When called, you lose more often than you win, so betting turns a hand with showdown value into a bluff that rarely makes better hands fold.');
    }
    if (big && small) reasons.push(`A larger bet (75% pot) gets called ${pctStr(big.call + big.raise)} of the time; you win ${pctStr(big.equityWhenCalled)} when called. Bigger sizes fold out the worse hands that pay off small bets.`);
    reasons.push(equityLine(ctx));
    return {
      ratings,
      reasons,
      sizing: { preferred: [0.25, 0.55], acceptable: [0.2, 0.8], note: 'Thin value bets are usually small, so that more worse hands call.' },
      confidence: 'medium',
      source: 'heuristic',
      math: [...(equityMath(ctx) ?? []), ...(small ? [{ label: 'Win rate when called (33% bet)', value: pctStr(small.equityWhenCalled, 1), kind: 'model' as const }] : [])],
    };
  },
});

const riverBluff = postflopTemplate({
  meta: {
    id: 'rv-bluff-blockers',
    title: 'River bluff with blockers',
    summary: 'You barrelled flop and turn, missed, and the big blind checks the river.',
    objectives: ['Compare fold probability with the bluff’s break-even point.', 'Choose bluffs with useful blockers.'],
    street: 'river',
    category: 'River play',
    concepts: ['bluff', 'blockers', 'bet-sizing'],
    lessons: ['blockers', 'value-bluff-semibluff', 'fold-equity'],
    heroPositions: ['BTN'],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'checked-to',
    difficulties: ['intermediate', 'advanced', 'expert'],
    setupText: 'You bet flop and turn and were called twice. The river misses you and the big blind checks.',
    hint: 'A bluff of B into a pot of P needs to work B / (P + B) of the time. Do your cards make their calls more or less likely?',
  },
  base: 'btn-bb',
  heroSide: 'pfr',
  streets: () => ({ ...pfrLine(true), river: { cards: cardsOn.any, actions: riverCheckedTo } }),
  heroFilter: () => ({ filter: (h, b) => pct(h, b) < 0.45 }),
  guide(ctx) {
    const to = potFractionTo(ctx.state, 0.75);
    const r = betResponse(ctx, { type: 'bet', to });
    const be = (to - ctx.state.players[ctx.hero].streetCommitted) / (ctx.pot + to);
    const bl = blockersForBet(ctx, { type: 'bet', to });
    const ratings: Guidance['ratings'] = {};
    const reasons: string[] = [`Your hand cannot win at showdown often (${equityLine(ctx).replace('Your equity against the modeled range is ', '')}), so a bet is a bluff: it profits only through folds.`];
    if (r) {
      reasons.push(`A 75% pot bet needs folds ${pctStr(be, 0)} of the time to break even. The modeled opponent folds ${pctStr(r.fold, 0)}.`);
      if (r.fold >= be + 0.05) {
        ratings.bet = 'preferred';
        ratings.check = 'mixed';
      } else if (r.fold >= be - 0.05) {
        ratings.bet = 'mixed';
        ratings.check = 'mixed';
      } else {
        ratings.check = 'preferred';
        ratings.bet = 'discouraged';
      }
    }
    if (bl) reasons.push(bl.text);
    reasons.push(...betMechanics(ctx, [0.5, 1.25]));
    return {
      ratings,
      reasons,
      sizing: { preferred: [0.66, 1.3], acceptable: [0.45, 2.0], note: 'River bluffs usually use the same large size as your value bets so the two are hard to tell apart.' },
      confidence: 'medium',
      source: 'heuristic',
      math: [{ label: 'Bluff break-even fold rate (75% pot)', value: `B/(P+B) = ${pctStr(be, 1)}`, kind: 'exact' }, ...(r ? [{ label: 'Modeled fold rate', value: pctStr(r.fold, 1), kind: 'model' as const }] : [])],
    };
  },
});

const riverBluffCatch = postflopTemplate({
  meta: {
    id: 'rv-bluff-catch',
    title: 'River bluff-catch facing a big bet',
    summary: 'You hold a one-pair hand and face a large river bet.',
    objectives: ['Use pot odds against a polarized betting range.', 'Weigh blockers and opponent tendencies.'],
    street: 'river',
    category: 'River play',
    concepts: ['bluff-catch', 'pot-odds', 'mdf', 'blockers'],
    lessons: ['bluff-catching', 'mdf', 'pot-odds', 'blockers'],
    heroPositions: ['BB'],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'bet',
    difficulties: ['beginner', 'intermediate', 'advanced', 'expert'],
    setupText: 'You defended the big blind and called a flop c-bet. The turn went check-check, and the button bets big on the river.',
    hint: 'Your hand beats only bluffs. What fraction of the time must they be bluffing for a call to profit?',
  },
  base: 'btn-bb',
  heroSide: 'caller',
  streets: () => ({
    flop: { cards: boards.notMonotone, actions: [btnCheck('BB'), { pos: 'BTN', act: 'bet', size: { kind: 'policy' } }, { pos: 'BB', act: 'call' }] },
    turn: { cards: cardsOn.any, actions: [btnCheck('BB'), btnCheck('BTN')] },
    river: { cards: cardsOn.any, actions: [btnCheck('BB'), { pos: 'BTN', act: 'bet', size: { kind: 'policy-large' } }] },
  }),
  heroFilter: () => ({ filter: (h, b) => {
    const p = pct(h, b);
    return p >= 0.6 && p < 0.9;
  } }),
  guide(ctx) {
    const g = facingBetGuidance(ctx);
    const bl = blockersFacingBet(ctx);
    if (bl) g.reasons.push(bl.text);
    const potBefore = ctx.pot - ctx.toCall;
    g.reasons.push(
      `In a simplified river model, a bettor making you indifferent would bluff ${pctStr(ctx.toCall / (potBefore + 2 * ctx.toCall), 0)} of its betting range at this size. Real players often bluff less than that (especially passive players), which favors folding marginal bluff-catchers; aggressive players often bluff more.`,
    );
    g.confidence = 'medium';
    return g;
  },
});

const riverOverbet = postflopTemplate({
  meta: {
    id: 'rv-overbet',
    title: 'River overbet with a polarized hand',
    summary: 'You hold either the nuts or nothing; the big blind checks the river after a capped line.',
    objectives: ['Use large sizes with polarized ranges.', 'Size up when the opponent cannot have many strong hands.'],
    street: 'river',
    category: 'Bet sizing',
    concepts: ['overbet', 'bluff', 'value-bet', 'bet-sizing'],
    lessons: ['overbets-underbets', 'polarized-merged', 'value-bluff-semibluff'],
    heroPositions: ['BTN'],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'checked-to',
    difficulties: ['advanced', 'expert'],
    setupText: 'You c-bet the flop, checked back the turn, and the big blind checks the river to you.',
    hint: 'When your hand is either very strong or very weak, what size gets the most value — and makes your bluffs most effective?',
  },
  base: 'btn-bb',
  heroSide: 'pfr',
  streets: () => ({ ...pfrLine(false), river: { cards: cardsOn.any, actions: riverCheckedTo } }),
  heroFilter: () => ({ filter: (h, b) => {
    const p = pct(h, b);
    return p >= 0.97 || p < 0.3;
  } }),
  guide(ctx) {
    const adv = rangeAdvantage(heroRangeFor(ctx), ctx.villains[0].combos, ctx.board);
    const strong = (ctx.percentile ?? 0) >= 0.97;
    const to = potFractionTo(ctx.state, 1.25);
    const r = betResponse(ctx, { type: 'bet', to });
    const be = (to - ctx.state.players[ctx.hero].streetCommitted) / (ctx.pot + to);
    const ratings: Guidance['ratings'] = {};
    const reasons = [adv.text];
    if (strong) {
      ratings.bet = 'preferred';
      ratings.check = 'mistake';
      reasons.push('With the nuts or near-nuts, checking gives up value. The opponent checked the turn back to you and the river, so their range is capped and your big bets get called by their best one-pair hands.');
      if (r) reasons.push(`A 125% pot bet is called ${pctStr(r.call + r.raise)} of the time by the modeled opponent.`);
    } else {
      if (r) {
        reasons.push(`As a bluff, a 125% pot bet needs ${pctStr(be, 0)} folds; the model folds ${pctStr(r.fold, 0)}.`);
        ratings.bet = r.fold >= be + 0.05 ? 'preferred' : r.fold >= be - 0.05 ? 'mixed' : 'discouraged';
        ratings.check = ratings.bet === 'preferred' ? 'mixed' : 'preferred';
      }
      const bl = blockersForBet(ctx, { type: 'bet', to });
      if (bl) reasons.push(bl.text);
    }
    reasons.push(...betMechanics(ctx, [0.66, 1.25]));
    return {
      ratings,
      reasons,
      sizing: { preferred: [1.0, 2.0], acceptable: [0.66, 2.5], note: 'A polarized range with a nut advantage can bet 100–200% of the pot.' },
      confidence: 'medium',
      source: 'heuristic',
    };
  },
});

const riverFacingRaise = postflopTemplate({
  meta: {
    id: 'rv-facing-raise',
    title: 'River: your value bet gets raised',
    summary: 'You value bet the river after betting flop and turn; the big blind check-raises.',
    objectives: ['Read the strength of river raises.', 'Fold good-but-not-great hands when the raise is rarely a bluff.'],
    street: 'river',
    category: 'Facing raises',
    concepts: ['facing-raise', 'bluff-catch', 'exploit'],
    lessons: ['check-raising', 'bluff-catching', 'exploitative-adjustments'],
    heroPositions: ['BTN'],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'raise',
    difficulties: ['advanced', 'expert'],
    setupText: 'You bet flop, turn and river for value. The big blind check-raises the river.',
    hint: 'Which hands raise the river after calling twice? How often is that a bluff?',
  },
  base: 'btn-bb',
  heroSide: 'pfr',
  streets: () => ({
    ...pfrLine(true),
    river: { cards: cardsOn.any, actions: [btnCheck('BB'), { pos: 'BTN', act: 'bet', size: { kind: 'pot', fraction: 0.5 } }, { pos: 'BB', act: 'raise', size: { kind: 'policy' } }] },
  }),
  heroFilter: () => ({ filter: (h, b) => {
    const p = pct(h, b);
    return p >= 0.86 && p < 0.985;
  } }),
  guide(ctx) {
    const g = facingBetGuidance(ctx);
    g.reasons.unshift('A check-raise on the river after calling two streets represents a very strong hand. Under this model, river raises are almost always value; many real player pools also under-bluff here, though aggressive players do raise some bluffs.');
    g.confidence = 'medium';
    return g;
  },
});

const multiwayFacingBet = postflopTemplate({
  meta: {
    id: 'fl-multiway-facing-bet',
    title: 'Facing a c-bet with a player behind',
    summary: 'CO opened, you called on the button and the big blind called. The big blind checks and the CO bets.',
    objectives: ['Continue with stronger hands when a player is still to act behind you.', 'Prefer hands that can make the nuts over weak pairs.'],
    street: 'flop',
    category: 'Multiway',
    concepts: ['multiway', 'pot-odds', 'equity-realization'],
    lessons: ['multiway', 'pot-odds', 'equity-denial-realization'],
    heroPositions: ['BTN'],
    stackBB: [100],
    potType: 'srp',
    multiway: true,
    facing: 'bet',
    difficulties: ['intermediate', 'advanced', 'expert'],
    setupText: 'Three-way pot. The big blind checks, the cutoff bets, and the big blind is still to act behind you.',
    hint: 'The price looks good, but the big blind can still raise or call behind you. Is your hand strong enough against two ranges?',
  },
  base: 'co-btn-bb:btn',
  heroSide: 'caller',
  streets: (ctx) => ({ flop: { cards: boards.notMonotone, actions: [btnCheck('BB'), { pos: 'CO', act: 'bet', size: { kind: ctx.rng.next() < 0.5 ? 'policy' : 'policy-large' } }] } }),
  heroFilter: (ctx) => ({ weight: mixWeight(ctx, (h, b) => isStrong(h, b) || isAir(h, b), (h, b) => isMedium(h, b) || hasDraw(h, b)) }),
  guide(ctx) {
    const g = facingBetGuidance(ctx);
    g.reasons.splice(
      2,
      0,
      'The big blind still acts after you. It can raise (and you would often have to fold), and when it calls you split the pot’s chances three ways. So you need a bit more than the raw price suggests.',
      'Hands that can make very strong hands — sets, strong draws to the nuts — gain value multiway. Weak one-pair hands lose value, because one of two players often has you beat.',
    );
    return g;
  },
});

const multiwayBBOvercall = postflopTemplate({
  meta: {
    id: 'fl-multiway-bb-overcall',
    title: 'Big blind: a bet and a call in front of you',
    summary: 'CO opened, the button and you called. You check, the CO bets and the button calls.',
    objectives: ['Use the better price you get when someone has already called.', 'Remember that out of position against two players you realize less equity.'],
    street: 'flop',
    category: 'Multiway',
    concepts: ['multiway', 'pot-odds', 'equity-realization'],
    lessons: ['multiway', 'pot-odds', 'equity-denial-realization'],
    heroPositions: ['BB'],
    stackBB: [100],
    potType: 'srp',
    multiway: true,
    facing: 'bet',
    difficulties: ['intermediate', 'advanced', 'expert'],
    setupText: 'Three-way pot. You check, the cutoff bets and the button calls. You close the action.',
    hint: 'The call in front of you makes the price better. But the button’s call also shows strength — how do you do against both ranges?',
  },
  base: 'co-btn-bb:bb',
  heroSide: 'caller',
  streets: () => ({ flop: { cards: boards.notMonotone, actions: [btnCheck('BB'), { pos: 'CO', act: 'bet', size: { kind: 'policy' } }, { pos: 'BTN', act: 'call' }] } }),
  heroFilter: (ctx) => ({ weight: mixWeight(ctx, (h, b) => isStrong(h, b) || isAir(h, b), (h, b) => isMedium(h, b) || hasDraw(h, b)) }),
  guide(ctx) {
    const g = facingBetGuidance(ctx);
    g.reasons.splice(
      2,
      0,
      'Nobody can raise behind you, and the button’s call made the pot bigger, so the price is better than heads-up.',
      'But you are out of position against two players for the rest of the hand, so you realize less of your equity, and the button’s call means its range is stronger than before. Draws to the nuts call more easily than weak pairs.',
    );
    return g;
  },
});

const multiwayStab = postflopTemplate({
  meta: {
    id: 'fl-multiway-checked-to',
    title: 'Checked to you in a three-way pot',
    summary: 'CO opened, you called on the button and the big blind called. Both players check to you.',
    objectives: ['Decide when a bet works against two players.', 'Bet for value and with strong draws; check medium hands.'],
    street: 'flop',
    category: 'Multiway',
    concepts: ['multiway', 'bluff', 'position'],
    lessons: ['multiway', 'value-bluff-semibluff', 'position'],
    heroPositions: ['BTN'],
    stackBB: [100],
    potType: 'srp',
    multiway: true,
    facing: 'checked-to',
    difficulties: ['beginner', 'intermediate', 'advanced', 'expert'],
    setupText: 'Three-way pot. The big blind and the preflop raiser both check to you on the button.',
    hint: 'Two checks often mean weakness, but a bet still has to get through two players. Which hands want a bet here?',
  },
  base: 'co-btn-bb:btn',
  heroSide: 'caller',
  streets: () => ({ flop: { cards: boards.notMonotone, actions: [btnCheck('BB'), btnCheck('CO')] } }),
  heroFilter: (ctx) => ({ weight: mixWeight(ctx, (h, b) => isStrong(h, b) || isAir(h, b), (h, b) => isMedium(h, b) || hasDraw(h, b)) }),
  guide(ctx) {
    const g = bettingGuidance(ctx, { bluffOk: false });
    g.reasons.unshift(
      'Two checks usually mean neither player has a very strong hand, and you have position. But a pure bluff must get folds from both: if each folds 60% of the time, both fold only about 36%.',
    );
    if ((ctx.draws?.drawEquity ?? 0) >= 0.3 && g.ratings.bet === 'mixed') {
      g.ratings.bet = 'preferred';
      g.reasons.push('A strong draw is a good bet here: it wins the pot when both fold and has plenty of equity when called.');
    }
    return g;
  },
});

export const POSTFLOP_TEMPLATES: ScenarioTemplate[] = [
  cbetDry,
  cbetWet,
  cbetOOP,
  cbet3bp,
  defendCbet,
  checkRaiseDraw,
  slowplayDry,
  multiwayCbet,
  multiwayFacingBet,
  multiwayBBOvercall,
  multiwayStab,
  facingCheckRaise,
  turnBarrel,
  turnProbe,
  delayedCbet,
  turnDrawCall,
  turnOverbet,
  riverThinValue,
  riverBluff,
  riverBluffCatch,
  riverOverbet,
  riverFacingRaise,
];
