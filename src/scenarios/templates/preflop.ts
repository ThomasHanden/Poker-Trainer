// Preflop cash-game templates. Evaluation: illustrative baseline charts (see presets.ts) plus
// pot-odds facts. Chart frequencies are teaching baselines, not solver outputs.

import { getChart, Chart, chartFreq } from '../../ranges/presets';
import { POSITIONS } from '../../engine/rules';
import { ScenarioTemplate, BuildContext, DecisionContext, Guidance } from '../types';
import { cashConfig, evenStacks, tableSizeFor, positionFor, stackFor, chartHeroSpec, chartGuidance } from './helpers';
import { pctStr, bbStr, rangeText, equityLine } from '../../evaluation/guides';
import { preflopRanking } from '../../ranges/preflopEquity';

const PREFLOP_ASSUMPTIONS = [
  'Recommendations come from this app’s illustrative baseline charts (not solver output).',
  'Mixed frequencies mean several actions are acceptable; a single hand cannot show whether you mix at the right frequency.',
  'Opponent ranges are those of the simulated opponent model given its actions.',
];

function profilesFor(ctx: BuildContext, n: number, hero: string): Record<string, import('../../opponents/profiles').ProfileId> {
  const out: Record<string, import('../../opponents/profiles').ProfileId> = {};
  for (const p of POSITIONS[n]) if (p !== hero) out[p] = ctx.pickProfile();
  return out;
}

const xRaise = (preferred: [number, number], acceptable: [number, number], note: string): Guidance['sizing'] => ({ preferred, acceptable, note, unit: 'x-raise' });

function withPreflopFacts(ctx: DecisionContext, g: Guidance, chart: Chart): Guidance {
  const math: NonNullable<Guidance['math']> = [];
  if (ctx.toCall > 0) {
    math.push({ label: 'Price to call', value: `${bbStr(ctx.toCall, ctx.bb)} into ${bbStr(ctx.pot, ctx.bb)} → need ${pctStr(ctx.requiredEquity, 1)} equity (before position/realization)`, kind: 'exact' });
  }
  if (ctx.equity && Number.isFinite(ctx.equity.equity)) {
    math.push({ label: 'All-in equity vs modeled range', value: `${pctStr(ctx.equity.equity, 1)} (precomputed table, approx. ±1%)`, kind: 'table' });
  }
  return {
    ...g,
    math: [...math, ...(g.math ?? [])],
    plausibleRanges: `${chart.priorAction} ${ctx.villains.length ? rangeText(ctx) : ''}`.trim(),
    reasons: g.reasons,
  };
}

const defendTendency = [
  'Against an opener who steals very wide (LAG), defend and 3-bet more; against a tight opener (nit), fold more marginal offsuit hands.',
  'Against players who call 3-bets too much (stations), 3-bet more value hands and fewer bluffs.',
];

// ------------------------------------------------------------------------------------------

const openRaise: ScenarioTemplate = {
  id: 'pf-open',
  version: 1,
  title: 'Open or fold (raise first in)',
  summary: 'Folded to you: decide whether to open-raise, and choose a size.',
  objectives: ['Learn how opening ranges widen as fewer players remain behind you.', 'Use standard open sizes.'],
  street: 'preflop',
  category: 'Opening',
  concepts: ['preflop-open', 'position', 'domination'],
  lessons: ['opening-ranges', 'starting-hands-position', 'position', 'playability'],
  formats: ['cash'],
  tableSizes: [2, 6, 9],
  heroPositions: ['UTG', 'UTG1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB'],
  stackBB: [100],
  potType: 'srp',
  multiway: false,
  facing: 'unopened',
  difficulties: ['beginner', 'intermediate', 'advanced', 'expert'],
  evaluation: { method: 'chart', assumptions: [...PREFLOP_ASSUMPTIONS, '100bb cash game, no antes, opens of 2–2.5bb (3bb from the SB).'] },
  setupText: 'Everyone before you has folded. Do you open, and for how much?',
  hint: 'Count the players still to act behind you. The more there are, the more likely someone holds a strong hand, so the tighter you open.',
  build(ctx) {
    const n = tableSizeFor(ctx, [6, 9, 2]);
    if (!n) return null;
    const options = n === 2 ? ['BTN'] : n === 6 ? ['UTG', 'HJ', 'CO', 'BTN', 'SB'] : ['UTG', 'UTG1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB'];
    const pos = positionFor(ctx, options);
    const stack = stackFor(ctx, [100]);
    if (!pos || !stack) return null;
    const chartId = n === 2 ? 'cashhu-open-BTN' : n === 9 ? `cash9-open-${pos}` : `cash6-open-${pos}`;
    const chart = getChart(chartId)!;
    return {
      config: cashConfig(n),
      stacksBB: evenStacks(n, stack),
      heroPos: pos,
      profiles: profilesFor(ctx, n, pos),
      preflop: [],
      hero: chartHeroSpec(ctx, chart),
      params: { chartId },
    };
  },
  guide(ctx) {
    const chart = getChart(ctx.params.chartId as string)!;
    const behind = ctx.state.players.filter((p) => p.index > ctx.hero || (ctx.state.players.length === 2 && p.index !== ctx.hero)).length;
    const g = chartGuidance(ctx, chart, [
      `${behind} player${behind === 1 ? '' : 's'} still to act behind you. ${behind >= 4 ? 'With many players behind, someone often has a strong hand, so only hands that play well against strong ranges are opened.' : behind >= 2 ? 'With fewer players behind, steals succeed more often and you are more likely to have position postflop.' : 'Only the big blind is left, so you can open a wide range; the big blind will defend often because of its good price.'}`,
    ]);
    if (g.ratings.call === 'mistake' || g.ratings.call === 'discouraged') {
      g.ratings.call = 'discouraged';
      g.reasons.push(
        chart.position === 'SB'
          ? 'Limping from the small blind is a legitimate strategy used by many strong players; this baseline uses raise-or-fold for simplicity, so limping is rated as a deviation rather than an error.'
          : 'Open-limping gives up the initiative and the chance to win the blinds immediately, and invites players behind to raise. Most strategies open-raise or fold here.',
      );
    }
    g.sizing = {
      preferred: chart.position === 'SB' ? [2.5, 3.5] : [2, 3],
      acceptable: chart.position === 'SB' ? [2, 4] : [1.8, 4],
      note: chart.sizing,
      unit: 'bb-to',
    };
    g.alternatives = 'Open sizes between 2bb and 3bb are all used in practice. Mixed hands near the edge of the range can be opened or folded.';
    g.tendencyNotes = [
      'If the players behind you fold their blinds too often, open wider (especially from CO/BTN).',
      'If the players behind you 3-bet a lot, tighten the bottom of your range and keep hands that can call or 4-bet.',
      'If a very loose, passive player is in the blinds, opening slightly larger and wider for value is reasonable.',
    ];
    return withPreflopFacts(ctx, g, chart);
  },
};

const sbFirstIn: ScenarioTemplate = {
  id: 'pf-sb-first-in',
  version: 1,
  title: 'Blind vs blind: small blind first in',
  summary: 'Folded to you in the small blind. Raise, limp or fold against the big blind.',
  objectives: ['Understand why the SB can play wide but is out of position.', 'Recognize raising and limping as two valid strategies.'],
  street: 'preflop',
  category: 'Blind vs blind',
  concepts: ['blind-vs-blind', 'preflop-open', 'position'],
  lessons: ['blind-defense', 'opening-ranges', 'position'],
  formats: ['cash'],
  tableSizes: [6, 9],
  heroPositions: ['SB'],
  stackBB: [100],
  potType: 'srp',
  multiway: false,
  facing: 'unopened',
  difficulties: ['intermediate', 'advanced', 'expert'],
  evaluation: { method: 'chart', assumptions: [...PREFLOP_ASSUMPTIONS, 'Raise-or-fold baseline; limping is treated as a legitimate alternative strategy for medium hands.'] },
  setupText: 'Everyone folds to you in the small blind. Only the big blind is left.',
  hint: 'You already have half a big blind invested and face only one opponent, but you will be out of position for the whole hand.',
  build(ctx) {
    const n = tableSizeFor(ctx, [6, 9]);
    if (!n || !positionFor(ctx, ['SB']) || !stackFor(ctx, [100])) return null;
    const chart = getChart('cash6-open-SB')!;
    return { config: cashConfig(n), stacksBB: evenStacks(n, 100), heroPos: 'SB', profiles: { BB: ctx.pickProfile() }, preflop: [], hero: chartHeroSpec(ctx, chart), params: { chartId: chart.id } };
  },
  guide(ctx) {
    const chart = getChart('cash6-open-SB')!;
    const g = chartGuidance(ctx, chart, [
      'Only the big blind can call, so wide raising is profitable, but you will act first on every street, which costs equity realization.',
    ]);
    const rank = preflopRanking().indexOf(ctx.heroClass);
    const f = chartFreq(chart, ctx.heroClass);
    if (rank < 30) {
      g.ratings.call = 'discouraged';
      g.reasons.push('Strong hands prefer raising: they want to build the pot and deny the big blind a cheap flop.');
    } else if (f.raise > 0.05 || rank < 110) {
      g.ratings.call = 'mixed';
      g.reasons.push('Limping is a reasonable alternative for medium hands: it keeps the pot small out of position and lets you realize equity cheaply. Against an aggressive big blind who raises limps a lot, limping loses appeal.');
    } else {
      g.ratings.call = 'discouraged';
    }
    g.sizing = { preferred: [2.5, 3.5], acceptable: [2, 4.5], note: chart.sizing, unit: 'bb-to' };
    g.tendencyNotes = ['A passive big blind who rarely 3-bets lets you raise even wider.', 'A big blind who defends everything makes limping and value-heavy raising better than stealing with weak hands.'];
    return withPreflopFacts(ctx, g, chart);
  },
};

function defendTemplate(cfg: {
  id: string;
  title: string;
  summary: string;
  hero: string;
  openers: string[];
  chartFor: (opener: string) => string;
  concepts: ScenarioTemplate['concepts'];
  lessons: string[];
  sizing: Guidance['sizing'];
  difficulties?: ScenarioTemplate['difficulties'];
  hint: string;
  extra: (ctx: DecisionContext) => string[];
}): ScenarioTemplate {
  return {
    id: cfg.id,
    version: 1,
    title: cfg.title,
    summary: cfg.summary,
    objectives: ['Choose between folding, calling and 3-betting based on price, position and the opener’s range.'],
    street: 'preflop',
    category: 'Facing an open',
    concepts: cfg.concepts,
    lessons: cfg.lessons,
    formats: ['cash'],
    tableSizes: [6],
    heroPositions: [cfg.hero],
    stackBB: [100],
    potType: 'srp',
    multiway: false,
    facing: 'open',
    difficulties: cfg.difficulties ?? ['beginner', 'intermediate', 'advanced', 'expert'],
    evaluation: { method: 'chart', assumptions: [...PREFLOP_ASSUMPTIONS, '100bb cash, 6-max, 2.5bb open.'] },
    setupText: 'Someone has opened. Fold, call, or 3-bet?',
    hint: cfg.hint,
    build(ctx) {
      if (!tableSizeFor(ctx, [6]) || !positionFor(ctx, [cfg.hero]) || !stackFor(ctx, [100])) return null;
      const opener = ctx.rng.pick(cfg.openers);
      const chart = getChart(cfg.chartFor(opener))!;
      return {
        config: cashConfig(6),
        stacksBB: evenStacks(6, 100),
        heroPos: cfg.hero,
        profiles: profilesFor(ctx, 6, cfg.hero),
        preflop: [{ pos: opener, act: 'raise', size: { kind: 'bb', to: 2.5 } }],
        hero: chartHeroSpec(ctx, chart),
        params: { chartId: chart.id, opener },
      };
    },
    guide(ctx) {
      const chart = getChart(ctx.params.chartId as string)!;
      const g = chartGuidance(ctx, chart, cfg.extra(ctx));
      g.sizing = cfg.sizing;
      g.tendencyNotes = defendTendency;
      g.alternatives = 'Where the chart mixes, calling and 3-betting (or calling and folding) are both acceptable; the long-run frequency matters, not any single hand.';
      if (ctx.equity) g.reasons.push(equityLine(ctx));
      return withPreflopFacts(ctx, g, chart);
    },
  };
}

const bbVsSteal = defendTemplate({
  id: 'pf-bb-vs-steal',
  title: 'Big blind defense vs a late-position open',
  summary: 'BTN or CO opens 2.5bb; you are in the big blind.',
  hero: 'BB',
  openers: ['BTN', 'CO'],
  chartFor: (o) => (o === 'BTN' ? 'cash6-BB-vs-BTN' : 'cash6-BB-vs-CO'),
  concepts: ['blind-defense', 'pot-odds', 'three-bet', 'equity-realization'],
  lessons: ['blind-defense', 'pot-odds', 'three-four-betting', 'equity-denial-realization'],
  sizing: xRaise([3.6, 4.6], [3, 5.6], 'Out of position, 3-bet to about 4x the open (≈10–11.5bb vs 2.5bb).'),
  hint: 'You already have 1bb in the pot and close the action. Compare the price you are getting with how well your hand plays out of position.',
  extra: (ctx) => [
    `Calling costs ${bbStr(ctx.toCall, ctx.bb)} to win ${bbStr(ctx.pot, ctx.bb)} (${pctStr(ctx.requiredEquity, 0)} needed). Late-position opens are wide, so many hands have enough raw equity — but out of position you will not realize all of it, which is why the weakest offsuit hands still fold.`,
  ],
});

const bbVsEP = defendTemplate({
  id: 'pf-bb-vs-ep',
  title: 'Big blind vs an under-the-gun open',
  summary: 'UTG opens 2.5bb and everyone folds to you in the big blind.',
  hero: 'BB',
  openers: ['UTG'],
  chartFor: () => 'cash6-BB-vs-UTG',
  concepts: ['blind-defense', 'domination', 'pot-odds'],
  lessons: ['blind-defense', 'playability', 'pot-odds'],
  sizing: xRaise([4, 5], [3.4, 5.8], 'Out of position vs an early open, 3-bets are about 4.5x (≈11–12bb).'),
  difficulties: ['intermediate', 'advanced', 'expert'],
  hint: 'The price is the same as against a button open, but the UTG range is much stronger. What happens when you make top pair with a weak kicker?',
  extra: () => [
    'The price is identical to defending against a button open, but an UTG range contains far more strong broadway hands and big pairs, so dominated hands (KTo, QJo, A9o) make second-best pairs. Suited and connected hands, which make straights, flushes and two pair, keep more value.',
  ],
});

const btnVsCo = defendTemplate({
  id: 'pf-btn-vs-co',
  title: 'Button vs a cutoff open',
  summary: 'CO opens 2.5bb; you are on the button with both blinds behind.',
  hero: 'BTN',
  openers: ['CO'],
  chartFor: () => 'cash6-BTN-vs-CO',
  concepts: ['facing-open', 'three-bet', 'position'],
  lessons: ['calling-vs-raising', 'three-four-betting', 'position'],
  sizing: xRaise([2.8, 3.5], [2.5, 4.2], 'In position, 3-bet to about 3x the open (≈7.5–8.5bb).'),
  hint: 'You will have position if you call, but two players behind you can still squeeze.',
  extra: () => [
    'Calling in position realizes equity well, but both blinds can squeeze behind you. A 3-bet wins the pot immediately often and isolates the opener, while calling keeps the opener’s weaker hands in.',
  ],
});

const sbVsBtn = defendTemplate({
  id: 'pf-sb-vs-btn',
  title: 'Small blind vs a button open',
  summary: 'BTN opens 2.5bb; you are in the small blind with the big blind behind.',
  hero: 'SB',
  openers: ['BTN'],
  chartFor: () => 'cash6-SB-vs-BTN',
  concepts: ['facing-open', 'three-bet', 'blind-defense'],
  lessons: ['three-four-betting', 'blind-defense', 'calling-vs-raising'],
  sizing: xRaise([3.6, 4.6], [3.2, 5.2], 'Out of position, 3-bet to about 4x (≈10–11bb).'),
  hint: 'If you call, you will be out of position and the big blind can still squeeze. How does that change calling vs 3-betting?',
  extra: () => [
    'Flatting from the small blind is unattractive: you are out of position, the big blind can squeeze, and you close nothing. That is why the baseline mostly 3-bets or folds here (lower-rake games flat a bit more).',
  ],
});

const coVsUtg = defendTemplate({
  id: 'pf-co-vs-utg',
  title: 'Cutoff vs an under-the-gun open',
  summary: 'UTG opens 2.5bb; you are in the cutoff with three players behind.',
  hero: 'CO',
  openers: ['UTG'],
  chartFor: () => 'cash6-CO-vs-UTG',
  concepts: ['facing-open', 'three-bet', 'domination'],
  lessons: ['calling-vs-raising', 'playability', 'linear-polarized'],
  sizing: xRaise([2.8, 3.5], [2.5, 4.2], 'In position, 3-bet to about 3–3.5x.'),
  difficulties: ['intermediate', 'advanced', 'expert'],
  hint: 'An early-position range is strong. Which of your hands are dominated, and which can make strong hands?',
  extra: () => [
    'Against a strong range with three players behind, most offsuit broadway hands are dominated and calls can get squeezed. A tight, partly linear 3-betting range plus some suited calls is the baseline.',
  ],
});

const squeeze: ScenarioTemplate = {
  id: 'pf-squeeze',
  version: 1,
  title: 'Squeeze from the big blind',
  summary: 'CO opens, BTN calls; you are in the big blind.',
  objectives: ['Recognize the capped range of a flat-caller.', 'Size squeezes larger because two players can continue.'],
  street: 'preflop',
  category: 'Squeeze',
  concepts: ['squeeze', 'three-bet', 'multiway'],
  lessons: ['squeezes', 'three-four-betting', 'multiway'],
  formats: ['cash'],
  tableSizes: [6],
  heroPositions: ['BB'],
  stackBB: [100],
  potType: 'srp',
  multiway: true,
  facing: 'open',
  difficulties: ['intermediate', 'advanced', 'expert'],
  evaluation: { method: 'chart', assumptions: [...PREFLOP_ASSUMPTIONS, '100bb cash, CO opens 2.5bb and BTN flat-calls.'] },
  setupText: 'An open and a call in front of you. Fold, call, or squeeze?',
  hint: 'The caller usually 3-bets its best hands, so its range is capped. There is also more dead money in the pot.',
  build(ctx) {
    if (!tableSizeFor(ctx, [6]) || !positionFor(ctx, ['BB']) || !stackFor(ctx, [100]) || ctx.settings.players === 'headsup') return null;
    const chart = getChart('cash6-BB-squeeze-vs-CO-BTN')!;
    return {
      config: cashConfig(6),
      stacksBB: evenStacks(6, 100),
      heroPos: 'BB',
      profiles: { CO: ctx.pickProfile(), BTN: ctx.pickProfile(), SB: 'unknown' },
      preflop: [
        { pos: 'CO', act: 'raise', size: { kind: 'bb', to: 2.5 } },
        { pos: 'BTN', act: 'call' },
        { pos: 'SB', act: 'fold' },
      ],
      hero: chartHeroSpec(ctx, chart),
      params: { chartId: chart.id },
    };
  },
  guide(ctx) {
    const chart = getChart('cash6-BB-squeeze-vs-CO-BTN')!;
    const g = chartGuidance(ctx, chart, [
      'The button’s flat call usually excludes its strongest hands (which would 3-bet), so a squeeze faces one uncapped range (the opener) and one capped range.',
      'The extra caller’s chips are dead money that your squeeze can win without a fight, but two players can wake up with a hand, so value hands carry more of the range than in a heads-up 3-bet.',
    ]);
    g.sizing = xRaise([4.4, 6], [3.8, 7], 'Squeeze larger than a normal 3-bet (≈13–15bb) because two players can call and you are out of position.');
    g.tendencyNotes = ['Against opener/caller pairs who fold too often to 3-bets, squeeze more bluffs.', 'If the caller is a station, squeeze for value but cut bluffs — the station will call.'];
    return withPreflopFacts(ctx, g, chart);
  },
};

function vs3betTemplate(cfg: { id: string; title: string; hero: string; threeBettor: string; chartId: string; sizing: Guidance['sizing']; hint: string; extra: string[]; openPos: string }): ScenarioTemplate {
  return {
    id: cfg.id,
    version: 1,
    title: cfg.title,
    summary: `You open from the ${cfg.hero}; the ${cfg.threeBettor} 3-bets.`,
    objectives: ['Decide when to fold, call or 4-bet facing a 3-bet.', 'Account for position and the 3-bettor’s range.'],
    street: 'preflop',
    category: 'Facing a 3-bet',
    concepts: ['three-bet', 'four-bet', 'position', 'spr'],
    lessons: ['three-four-betting', 'linear-polarized', 'position-spr'],
    formats: ['cash'],
    tableSizes: [6],
    heroPositions: [cfg.hero],
    stackBB: [100],
    potType: '3bp',
    multiway: false,
    facing: '3bet',
    difficulties: ['intermediate', 'advanced', 'expert'],
    evaluation: { method: 'chart', assumptions: [...PREFLOP_ASSUMPTIONS, '100bb cash, 6-max.'] },
    setupText: 'You opened and got 3-bet. What now?',
    hint: cfg.hint,
    build(ctx) {
      if (!tableSizeFor(ctx, [6]) || !positionFor(ctx, [cfg.hero]) || !stackFor(ctx, [100])) return null;
      const open = getChart(`cash6-open-${cfg.openPos}`)!;
      const chart = getChart(cfg.chartId)!;
      const spec = chartHeroSpec(ctx, chart);
      return {
        config: cashConfig(6),
        stacksBB: evenStacks(6, 100),
        heroPos: cfg.hero,
        profiles: { [cfg.threeBettor]: ctx.pickProfile() },
        preflop: [
          { pos: cfg.hero, act: 'raise', size: { kind: 'bb', to: 2.5 } },
          { pos: cfg.threeBettor, act: 'raise', size: { kind: 'policy' } },
        ],
        hero: { range: open.raise, weight: spec.weight },
        params: { chartId: cfg.chartId },
      };
    },
    guide(ctx) {
      const chart = getChart(cfg.chartId)!;
      const g = chartGuidance(ctx, chart, cfg.extra);
      g.sizing = cfg.sizing;
      g.tendencyNotes = [
        'Against players who 3-bet rarely (nits), fold more and 4-bet bluff less; their 3-bets are strong.',
        'Against frequent 3-bettors, defend wider and add 4-bet bluffs with blockers (A5s, A4s).',
      ];
      g.reasons.push(equityLine(ctx));
      return withPreflopFacts(ctx, g, chart);
    },
  };
}

const vs3betIP = vs3betTemplate({
  id: 'pf-vs-3bet-ip',
  title: 'Facing a 3-bet in position',
  hero: 'BTN',
  threeBettor: 'BB',
  openPos: 'BTN',
  chartId: 'cash6-BTN-open-vs-BB-3bet',
  sizing: xRaise([2.1, 2.6], [1.9, 3], 'In position, 4-bet to about 2.2–2.5x the 3-bet.'),
  hint: 'You will have position for the rest of the hand. The big blind 3-bets fairly wide against button opens.',
  extra: ['In position, calling realizes equity well, so suited and connected hands can call. Your strongest hands and a few blocker bluffs 4-bet.'],
});

const vs3betOOP = vs3betTemplate({
  id: 'pf-vs-3bet-oop',
  title: 'Facing a 3-bet out of position',
  hero: 'UTG',
  threeBettor: 'BTN',
  openPos: 'UTG',
  chartId: 'cash6-UTG-open-vs-BTN-3bet',
  sizing: xRaise([2.5, 3.2], [2.2, 3.6], 'Out of position, 4-bet larger: about 2.7–3x the 3-bet.'),
  hint: 'You will be out of position in a bloated pot. Which hands can continue profitably?',
  extra: ['Out of position you realize less equity in a 3-bet pot, so continue with fewer marginal hands than when in position. The button’s range is stronger than a blind-vs-button 3-bet range.'],
});

const vs4bet: ScenarioTemplate = {
  id: 'pf-vs-4bet',
  version: 1,
  title: 'Facing a 4-bet',
  summary: 'You 3-bet the button from the big blind and get 4-bet.',
  objectives: ['Know which hands continue against a 4-bet at 100bb, and why calls commit you.'],
  street: 'preflop',
  category: 'Facing a 4-bet',
  concepts: ['four-bet', 'spr', 'blockers'],
  lessons: ['three-four-betting', 'position-spr', 'blockers'],
  formats: ['cash'],
  tableSizes: [6],
  heroPositions: ['BB'],
  stackBB: [100],
  potType: '4bp',
  multiway: false,
  facing: '4bet',
  difficulties: ['advanced', 'expert'],
  evaluation: { method: 'chart', assumptions: [...PREFLOP_ASSUMPTIONS, '100bb cash; at this depth a 5-bet is all-in.'] },
  setupText: 'You 3-bet and the button 4-bets. Fold, call, or 5-bet all-in?',
  hint: 'After calling a 4-bet the stack-to-pot ratio is about 1.5. Which hands are happy to get all-in?',
  build(ctx) {
    if (!tableSizeFor(ctx, [6]) || !positionFor(ctx, ['BB']) || !stackFor(ctx, [100])) return null;
    const def = getChart('cash6-BB-vs-BTN')!;
    const chart = getChart('cash6-BB-3bet-vs-BTN-4bet')!;
    const spec = chartHeroSpec(ctx, chart, 0.6);
    return {
      config: cashConfig(6),
      stacksBB: evenStacks(6, 100),
      heroPos: 'BB',
      profiles: { BTN: ctx.pickProfile() },
      preflop: [
        { pos: 'BTN', act: 'raise', size: { kind: 'bb', to: 2.5 } },
        { pos: 'SB', act: 'fold' },
        { pos: 'BB', act: 'raise', size: { kind: 'policy' } },
        { pos: 'BTN', act: 'raise', size: { kind: 'policy' } },
      ],
      hero: { range: def.raise, weight: spec.weight },
      params: { chartId: chart.id },
    };
  },
  guide(ctx) {
    const chart = getChart('cash6-BB-3bet-vs-BTN-4bet')!;
    const g = chartGuidance(ctx, chart, [
      'Calling leaves an SPR around 1.5, so you will usually get all-in on the flop anyway. Hands that hate getting all-in (weak suited aces without a pair) should fold or be used only as bluffs with blockers.',
      'Holding an ace or king removes some of the opponent’s AA/KK/AK combos (blockers), which makes a 5-bet bluff more likely to work and makes the opponent’s range weaker on average.',
    ]);
    g.tendencyNotes = ['Many players 4-bet too few bluffs at lower stakes; against them, fold more and call/jam only strong hands.', 'Against aggressive 4-bettors, 5-bet jam wider with QQ, JJ and AQs.'];
    g.reasons.push(equityLine(ctx));
    return withPreflopFacts(ctx, g, chart);
  },
};

const isoLimper: ScenarioTemplate = {
  id: 'pf-iso',
  version: 1,
  title: 'Isolation raise vs a limper',
  summary: 'A loose-passive player limps; it folds to you on the button.',
  objectives: ['Isolate weak limpers in position with a wide value range.', 'Size iso-raises larger than normal opens.'],
  street: 'preflop',
  category: 'Limped pots',
  concepts: ['isolation', 'position', 'exploit'],
  lessons: ['isolation-limped', 'exploitative-adjustments', 'position'],
  formats: ['cash'],
  tableSizes: [6],
  heroPositions: ['BTN'],
  stackBB: [100],
  potType: 'limped',
  multiway: false,
  facing: 'limp',
  difficulties: ['beginner', 'intermediate', 'advanced', 'expert'],
  evaluation: { method: 'chart', assumptions: [...PREFLOP_ASSUMPTIONS, 'The limper is modeled as a calling station.'] },
  setupText: 'A recreational player limps in. Isolate, over-limp, or fold?',
  hint: 'The limper’s range is wide and weak, and you would have position. What do you gain by raising instead of limping behind?',
  build(ctx) {
    if (!tableSizeFor(ctx, [6]) || !positionFor(ctx, ['BTN']) || !stackFor(ctx, [100])) return null;
    const chart = getChart('cash6-BTN-iso-vs-limper')!;
    return {
      config: cashConfig(6),
      stacksBB: evenStacks(6, 100),
      heroPos: 'BTN',
      profiles: { HJ: 'station', SB: 'unknown', BB: 'unknown' },
      preflop: [{ pos: 'HJ', act: 'call' }],
      hero: chartHeroSpec(ctx, chart),
      params: { chartId: chart.id },
    };
  },
  guide(ctx) {
    const chart = getChart('cash6-BTN-iso-vs-limper')!;
    const g = chartGuidance(ctx, chart, [
      'Raising isolates the limper: you play heads-up, in position, with the initiative, against a range that has already declined to raise (so it is capped and weak).',
      'Over-limping keeps the pot small with hands that want to see a cheap multiway flop (small pairs, suited connectors), but gives the blinds a cheap look.',
    ]);
    g.sizing = { preferred: [4, 5.5], acceptable: [3.5, 6.5], note: chart.sizing, unit: 'bb-to' };
    g.tendencyNotes = ['Against a station, iso-raise larger and with a value-heavier range — they call too much, so you get paid but cannot bluff.', 'If the blinds are aggressive and squeeze iso-raises, tighten up.'];
    return withPreflopFacts(ctx, g, chart);
  },
};

const deepVs3bet: ScenarioTemplate = {
  id: 'pf-deep-vs-3bet',
  version: 1,
  title: 'Deep-stacked: facing a 3-bet at 200bb',
  summary: 'You open the button with 200bb stacks and the big blind 3-bets.',
  objectives: ['See how implied odds favor suited/connected hands and pairs when deep.', 'See how reverse implied odds hurt offsuit broadway hands.'],
  street: 'preflop',
  category: 'Stack depth',
  concepts: ['stack-depth', 'implied-odds', 'three-bet', 'domination'],
  lessons: ['stack-depth-preflop', 'implied-odds', 'playability'],
  formats: ['cash'],
  tableSizes: [6],
  heroPositions: ['BTN'],
  stackBB: [200],
  potType: '3bp',
  multiway: false,
  facing: '3bet',
  difficulties: ['advanced', 'expert'],
  evaluation: {
    method: 'chart',
    assumptions: [
      ...PREFLOP_ASSUMPTIONS,
      '200bb stacks. Guidance adjusts the 100bb chart with stack-depth heuristics: no 200bb chart is provided, so confidence is lower.',
    ],
  },
  setupText: 'Stacks are 200bb deep. You opened the button and the big blind 3-bets.',
  hint: 'With deeper stacks, hands that make the nuts gain value, and hands that make second-best pairs lose more.',
  build(ctx) {
    if (!tableSizeFor(ctx, [6]) || !positionFor(ctx, ['BTN']) || !stackFor(ctx, [200])) return null;
    const open = getChart('cash6-open-BTN')!;
    const chart = getChart('cash6-BTN-open-vs-BB-3bet')!;
    return {
      config: cashConfig(6),
      stacksBB: evenStacks(6, 200),
      heroPos: 'BTN',
      profiles: { BB: ctx.pickProfile() },
      preflop: [
        { pos: 'BTN', act: 'raise', size: { kind: 'bb', to: 2.5 } },
        { pos: 'SB', act: 'fold' },
        { pos: 'BB', act: 'raise', size: { kind: 'bb', to: 12 } },
      ],
      hero: { range: open.raise, weight: chartHeroSpec(ctx, chart).weight },
      params: { chartId: chart.id },
    };
  },
  guide(ctx) {
    const chart = getChart('cash6-BTN-open-vs-BB-3bet')!;
    const g = chartGuidance(ctx, chart, []);
    const h = ctx.heroClass;
    const suitedConn = h.length === 3 && h[2] === 's' && 'AKQJT98765432'.indexOf(h[1]) - 'AKQJT98765432'.indexOf(h[0]) <= 2;
    const smallPair = h.length === 2 && 'AKQJT98765432'.indexOf(h[0]) >= 5;
    const offBroadway = h.length === 3 && h[2] === 'o' && 'AKQJT'.includes(h[0]) && 'AKQJT'.includes(h[1]) && !['AKo', 'AQo'].includes(h);
    if (suitedConn || smallPair) {
      if (g.ratings.fold === 'preferred' || g.ratings.fold === 'mixed') g.ratings.call = 'mixed';
      g.reasons.unshift('Deep stacks raise implied odds: when a pair, suited connector or suited gapper makes a set, straight or flush, there is much more left to win. In position, these hands can call deeper than at 100bb.');
    }
    if (offBroadway) {
      if (g.ratings.call === 'preferred') g.ratings.call = 'mixed';
      g.ratings.fold = g.ratings.fold === 'mistake' ? 'discouraged' : g.ratings.fold === 'discouraged' ? 'mixed' : g.ratings.fold;
      g.reasons.unshift('Deep stacks increase reverse implied odds for offsuit broadway hands: they make top pair with a kicker that is often dominated by a 3-betting range, and losing a big pot with one pair costs more when stacks are deep.');
    }
    g.reasons.push('With 200bb, 4-bets must be larger and get called/5-bet more often, so 4-bet bluffs carry more risk; value 4-bets remain strong.');
    g.confidence = 'low';
    g.sizing = xRaise([2.2, 2.8], [2, 3.2], '4-bet to about 2.3–2.6x the 3-bet when deep (slightly larger out of position).');
    g.tendencyNotes = ['Implied odds depend on the opponent paying off: against a tight player who stops when scared, set-mining and speculative calls are worth less.'];
    return withPreflopFacts(ctx, g, chart);
  },
};

export const PREFLOP_TEMPLATES: ScenarioTemplate[] = [openRaise, sbFirstIn, bbVsSteal, bbVsEP, btnVsCo, sbVsBtn, coVsUtg, squeeze, vs3betIP, vs3betOOP, vs4bet, isoLimper, deepVs3bet];
