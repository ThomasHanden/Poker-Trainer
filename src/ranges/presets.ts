// Preset preflop charts.
//
// HONESTY NOTE: Unless marked `computed`, these charts are ILLUSTRATIVE baselines written for this
// app from widely taught principles (position, playability, blockers, domination). They are not
// solver outputs and are not copied from any commercial chart pack. Real equilibrium strategies
// depend on rake, sizing, stack depth and the exact population, and they mix many hands.
// `computed` charts (heads-up push/fold) are produced by this app's own equilibrium calculation
// (see src/ranges/pushfold.ts) under the simplified model stated in their assumptions.

import { Range, parseRange, emptyRange, ALL_CLASSES, HandClass, availableCombos, combosOf, comboCount } from './hands';
import type { Card } from '../engine/cards';

export type ChartAction = 'raise' | 'call' | 'fold';

export interface Chart {
  id: string;
  name: string;
  group: 'open' | 'defend' | 'vs3bet' | 'vs4bet' | 'squeeze' | 'iso' | 'pushfold' | 'call-shove';
  format: 'cash' | 'tournament';
  tableSize: 2 | 6 | 9;
  position: string; // hero position
  vsPosition?: string;
  stackBB: number;
  priorAction: string;
  sizing: string;
  assumptions: string[];
  confidence: 'illustrative' | 'computed';
  /** frequency of the aggressive action (raise/3-bet/4-bet/shove) per class */
  raise: Range;
  /** frequency of calling per class (raise + call <= 1) */
  call: Range;
  /** label of the aggressive action for display */
  raiseLabel: string;
  callLabel?: string;
  /** when (and why) flat-calling is used in this spot, for charts with a call range */
  callWhy?: string;
  /** short label for chart pickers, e.g. "BB vs BTN" */
  short?: string;
  /**
   * Hands that can actually be in this spot (e.g. your opening range when facing a 3-bet), as a
   * weight per class. Undefined = every hand can be dealt into the spot. The `raise`/`call`
   * frequencies are conditional on holding the hand here.
   */
  reach?: Range;
  /** what `reach` is, in words ("your BTN opening range") */
  reachLabel?: string;
  notes?: string;
}

const CASH_ASSUMPTIONS = [
  'No-limit hold’em cash game, 100bb effective stacks.',
  'Typical online-style rake (roughly 5% capped) — rake punishes flatting and limping.',
  'Opens are 2.5bb (3bb from the SB). No antes.',
  'Opponents are unknown, reasonably competent regulars.',
  'Illustrative baseline, not a solver output. Equilibrium strategies mix more hands.',
];

function chart(c: Omit<Chart, 'raise' | 'call' | 'reach'> & { raise: string; call?: string; reach?: string | Range }): Chart {
  const raise = parseRange(c.raise);
  const call = c.call ? parseRange(c.call) : emptyRange();
  // make raise + call <= 1, prioritizing the raise frequency
  for (const h of ALL_CLASSES) call[h] = Math.max(0, Math.min(call[h], 1 - raise[h]));
  const reach = typeof c.reach === 'string' ? parseRange(c.reach) : c.reach;
  return { ...c, raise, call, reach };
}

// ---------------- 6-max, 100bb cash: raise-first-in ----------------

export const OPEN_6MAX: Record<string, string> = {
  UTG: '55+,44:0.5,A2s+,K9s+,Q9s+,J9s+,T9s,98s,87s:0.5,76s:0.5,65s:0.25,ATo+,KJo+,QJo:0.5',
  HJ: '44+,33:0.5,A2s+,K7s+,Q9s+,J9s+,T8s+,98s,97s:0.5,87s,76s,65s:0.5,A9o+,KTo+,QJo,QTo:0.5,JTo:0.5',
  CO: '22+,A2s+,K5s+,Q8s+,J8s+,T8s+,97s+,86s+,75s+,65s,54s,A8o+,A5o:0.5,KTo+,K9o:0.5,QTo+,JTo,T9o:0.25',
  BTN: '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,74s+,64s+,53s+,43s:0.5,A2o+,K8o+,K7o:0.5,Q9o+,Q8o:0.5,J9o+,T9o,98o:0.5,87o:0.25',
  SB: '22+,A2s+,K2s+,Q5s+,J7s+,T7s+,97s+,86s+,75s+,64s+,54s,A2o+,K9o+,K8o:0.5,Q9o+,J9o+,T9o,98o:0.25',
};

// Full ring (9-max): early seats tighter; LJ..SB reuse the 6-max seat with the same number of players behind.
export const OPEN_9MAX: Record<string, string> = {
  UTG: '77+,66:0.5,55:0.25,ATs+,A5s:0.5,A4s:0.5,KTs+,QTs+,JTs,T9s:0.5,98s:0.25,AJo+,KQo',
  UTG1: '66+,55:0.5,A9s+,A5s-A4s,A3s:0.5,KTs+,K9s:0.5,QTs+,JTs,T9s,98s:0.5,87s:0.25,AJo+,ATo:0.5,KQo,KJo:0.5',
  MP: '55+,44:0.5,A7s+,A5s-A2s,K9s+,Q9s+,J9s+,T9s,98s,87s:0.5,76s:0.25,ATo+,KJo+,QJo:0.5',
  LJ: OPEN_6MAX.UTG,
  HJ: OPEN_6MAX.HJ,
  CO: OPEN_6MAX.CO,
  BTN: OPEN_6MAX.BTN,
  SB: OPEN_6MAX.SB,
};

// Heads-up 100bb: the button (who is also the SB) opens very wide.
// About 80% of hands: raise-or-fold folds only the weakest offsuit hands.
export const OPEN_HU_BTN =
  '22+,A2s+,K2s+,Q2s+,J2s+,T2s+,92s+,82s+,72s+,62s+,52s+,42s+,32s,A2o+,K2o+,Q2o+,J4o+,J3o:0.5,T6o+,T5o:0.5,96o+,95o:0.5,86o+,85o:0.5,75o+,74o:0.5,65o,64o:0.5,54o';

const openCharts: Chart[] = [
  ...Object.entries(OPEN_6MAX).map(([pos, r]) =>
    chart({
      id: `cash6-open-${pos}`,
      name: `6-max ${pos} open (100bb cash)`,
      group: 'open',
      format: 'cash',
      tableSize: 6,
      position: pos,
      stackBB: 100,
      priorAction: 'Folded to you (raise first in).',
      sizing: pos === 'SB' ? 'Raise to 3bb (raise-or-fold simplification).' : 'Raise to 2.5bb (2.2–2.5bb are all common).',
      assumptions:
        pos === 'SB'
          ? [...CASH_ASSUMPTIONS, 'SB strategy simplified to raise-or-fold. Many modern strategies also limp a large part of the SB range; limping is a legitimate alternative, not an error.']
          : CASH_ASSUMPTIONS,
      confidence: 'illustrative',
      raise: r,
      raiseLabel: 'Open-raise',
    }),
  ),
  ...Object.keys(OPEN_9MAX).map((pos) =>
    chart({
      id: `cash9-open-${pos}`,
      name: `Full ring ${pos} open (100bb cash)`,
      group: 'open',
      format: 'cash',
      tableSize: 9,
      position: pos,
      stackBB: 100,
      priorAction: 'Folded to you (raise first in).',
      sizing: pos === 'SB' ? 'Raise to 3bb (raise-or-fold simplification).' : 'Raise to 2.5–3bb.',
      assumptions: [
        ...CASH_ASSUMPTIONS.map((a) => a.replace('100bb effective stacks.', '100bb, 9-handed.')),
        ['UTG', 'UTG1', 'MP'].includes(pos)
          ? `With ${{ UTG: 8, UTG1: 7, MP: 6 }[pos]} players still to act behind you, the chance someone wakes up with a strong hand is much higher than in 6-max, so early ranges are tighter.`
          : 'From this seat the number of players behind is the same as from the equivalent 6-max seat, so the same baseline range is used.',
        ...(pos === 'SB' ? ['SB strategy simplified to raise-or-fold. Many modern strategies also limp a large part of the SB range; limping is a legitimate alternative, not an error.'] : []),
      ],
      confidence: 'illustrative',
      raise: OPEN_9MAX[pos],
      raiseLabel: 'Open-raise',
    }),
  ),
  chart({
    id: 'cashhu-open-BTN',
    name: 'Heads-up button open (100bb cash)',
    group: 'open',
    format: 'cash',
    tableSize: 2,
    position: 'BTN',
    stackBB: 100,
    priorAction: 'Heads-up: you are on the button (small blind) and act first preflop.',
    sizing: 'Raise to 2–2.5bb.',
    assumptions: [
      'Heads-up cash, 100bb, button min-raises or raises to 2.5bb.',
      'Only one opponent, and the button has position for the whole hand, so very wide opens are profitable.',
      'Raise-or-fold simplification: about 80% of hands are opened and only the weakest offsuit hands fold.',
      'Illustrative baseline. Heads-up equilibrium strategies also limp some hands.',
    ],
    confidence: 'illustrative',
    raise: OPEN_HU_BTN,
    raiseLabel: 'Open-raise',
  }),
];

// ---------------- Defending vs opens ----------------

const BB_VS_BTN_3BET = 'QQ+,AKs,AKo,JJ:0.8,TT:0.6,99:0.4,88:0.2,AQs,AJs:0.8,ATs:0.6,A9s:0.3,KQs,KJs:0.6,KTs:0.5,QJs:0.5,QTs:0.4,JTs:0.4,A5s,A4s,A3s:0.7,A2s:0.6,K9s:0.6,K8s:0.5,K7s:0.4,K6s:0.4,K5s:0.4,Q9s:0.5,Q8s:0.4,J9s:0.5,J8s:0.3,T9s:0.4,T8s:0.5,98s:0.4,97s:0.4,87s:0.4,86s:0.4,76s:0.4,75s:0.3,65s:0.4,54s:0.4,AQo,AJo:0.6,ATo:0.4,A9o:0.2,KQo:0.7,KJo:0.5,KTo:0.3,QJo:0.4,QTo:0.2,JTo:0.2';

const WHY_FLAT_IP = (behind: string) =>
  `Call (flat) with hands that play well in position but don’t want to face a 4-bet: medium pairs, suited broadways and the best suited connectors. They are too good to fold and not strong enough to 3-bet for value. ${behind}`;
const WHY_FLAT_SB =
  'The small blind is out of position and the big blind can still squeeze, so the baseline is 3-bet or fold. Flat only a few hands that hate facing a 4-bet but play well after the flop (medium pairs, strong suited hands), and only some of the time.';
const WHY_FLAT_BB =
  'The big blind closes the action and already has 1bb in, so it gets the best price and calls the most. Call anything with enough equity and playability; 3-bet value hands plus a mix of suited hands (wheel aces, suited kings, suited connectors) that make good bluffs because they still have equity when called.';

const defendCharts: Chart[] = [
  chart({
    id: 'cash6-BB-vs-BTN',
    callWhy: WHY_FLAT_BB,
    name: 'BB vs BTN 2.5bb open',
    group: 'defend',
    format: 'cash',
    tableSize: 6,
    position: 'BB',
    vsPosition: 'BTN',
    stackBB: 100,
    priorAction: 'BTN opens to 2.5bb, SB folds.',
    sizing: '3-bet to about 11bb (OOP 3-bets are larger).',
    assumptions: [
      ...CASH_ASSUMPTIONS,
      'You are getting 1.5bb to call into a 4bb pot: you need about 27% raw equity before accounting for being out of position, so the defend range is wide.',
    ],
    confidence: 'illustrative',
    raise: BB_VS_BTN_3BET,
    call: '22+,A2s+,K2s+,Q4s+,J5s+,T6s+,96s+,85s+,74s+,64s+,53s+,43s,A5o+,A4o:0.5,A3o:0.4,A2o:0.3,K9o+,K8o:0.6,K7o:0.3,Q9o+,Q8o:0.4,J9o+,J8o:0.3,T9o,T8o:0.4,98o:0.6,87o:0.4',
    raiseLabel: '3-bet',
    callLabel: 'Call',
  }),
  chart({
    id: 'cash6-BB-vs-CO',
    callWhy: WHY_FLAT_BB,
    name: 'BB vs CO 2.5bb open',
    group: 'defend',
    format: 'cash',
    tableSize: 6,
    position: 'BB',
    vsPosition: 'CO',
    stackBB: 100,
    priorAction: 'CO opens to 2.5bb, BTN and SB fold.',
    sizing: '3-bet to about 11–12bb.',
    assumptions: [...CASH_ASSUMPTIONS, 'CO opens tighter than BTN, so the BB defends somewhat tighter, especially with weak offsuit hands.'],
    confidence: 'illustrative',
    raise: 'QQ+,AKs,AKo,JJ:0.7,TT:0.4,99:0.2,AQs,AJs:0.6,ATs:0.4,KQs:0.7,KJs:0.4,KTs:0.3,A5s,A4s,A3s:0.6,A2s:0.5,K9s:0.5,K8s:0.3,K7s:0.2,Q9s:0.4,Q8s:0.2,J9s:0.4,T8s:0.4,97s:0.4,86s:0.4,75s:0.3,64s:0.2,76s:0.4,65s:0.4,54s:0.4,AQo:0.7,AJo:0.3,ATo:0.2,KQo:0.4,KJo:0.2,99:0.4,88:0.2,ATs:0.6,K6s:0.3,K5s:0.3,QJs:0.3,JTs:0.3,AJo:0.5,KJo:0.3,A9o:0.2',
    call: '22+,A2s+,K2s+,Q5s+,J6s+,T6s+,96s+,85s+,74s+,64s+,53s+,43s:0.5,A9o+,A8o:0.5,KTo+,K9o:0.4,Q9o+,J9o:0.5,JTo,T9o:0.4',
    raiseLabel: '3-bet',
    callLabel: 'Call',
  }),
  chart({
    id: 'cash6-BB-vs-UTG',
    callWhy: WHY_FLAT_BB,
    name: 'BB vs UTG 2.5bb open',
    group: 'defend',
    format: 'cash',
    tableSize: 6,
    position: 'BB',
    vsPosition: 'UTG',
    stackBB: 100,
    priorAction: 'UTG opens to 2.5bb, everyone else folds.',
    sizing: '3-bet to about 12bb.',
    assumptions: [...CASH_ASSUMPTIONS, 'UTG’s range is strong, so dominated offsuit hands lose a lot when they make top pair: A9o, K9o and Q9o fold, and KTo and QTo are only part-time calls. Prefer suited and connected hands that make strong hands or draws.'],
    confidence: 'illustrative',
    raise: 'QQ+,AKs,AKo,JJ:0.5,TT:0.2,AQs:0.7,AJs:0.4,KQs:0.5,KJs:0.2,A5s,A4s:0.7,A3s:0.4,K9s:0.3,Q9s:0.2,J9s:0.2,T8s:0.3,97s:0.3,86s:0.3,76s:0.3,65s:0.3,54s:0.3,AQo:0.4,KQo:0.1,KJs:0.3,AJs:0.5,98s:0.2,AJo:0.1',
    call: '22+,A2s+,K6s+,Q8s+,J8s+,T7s+,97s+,86s+,75s+,64s+,54s,AJo+,KJo+,QJo:0.5,KTo:0.3,ATo:0.4,K5s+,Q7s+,J7s+,96s+,85s+,53s+,ATo,KTo:0.6,QTo:0.4,JTo:0.4',
    raiseLabel: '3-bet',
    callLabel: 'Call',
  }),
  chart({
    id: 'cash6-SB-vs-BTN',
    callWhy: WHY_FLAT_SB,
    name: 'SB vs BTN 2.5bb open',
    group: 'defend',
    format: 'cash',
    tableSize: 6,
    position: 'SB',
    vsPosition: 'BTN',
    stackBB: 100,
    priorAction: 'BTN opens to 2.5bb.',
    sizing: '3-bet to about 11bb.',
    assumptions: [
      ...CASH_ASSUMPTIONS,
      'SB will be out of position and the BB is still behind and can squeeze, so the baseline is mostly 3-bet-or-fold. A minority of medium pairs and suited hands flat some of the time (more at lower rake).',
    ],
    confidence: 'illustrative',
    raise: 'TT+,99:0.7,88:0.5,77:0.3,AJs+,ATs:0.8,A9s:0.6,A8s:0.5,A7s:0.4,A6s:0.3,A5s-A2s,KQs,KJs:0.8,KTs:0.7,K9s:0.5,K8s:0.3,QJs:0.7,QTs:0.6,Q9s:0.4,JTs:0.6,J9s:0.4,T9s:0.5,T8s:0.3,98s:0.4,87s:0.4,76s:0.3,65s:0.3,54s:0.2,AKo,AQo,AJo:0.7,ATo:0.5,A9o:0.2,KQo:0.7,KJo:0.5,KTo:0.2,QJo:0.3',
    call: '99,88,77,66:0.6,55:0.5,44:0.4,33:0.3,22:0.3,ATs,A9s,A8s:0.5,A7s:0.4,KTs,K9s:0.4,QTs,Q9s:0.4,JTs,J9s:0.4,T9s,T8s:0.3,98s,87s:0.5,76s:0.4,66:0.8,55:0.7,44:0.6,33:0.5,22:0.5,A6s:0.4,K8s:0.3,T8s:0.4,87s:0.6,76s:0.5,65s:0.4',
    raiseLabel: '3-bet',
    callLabel: 'Call',
  }),
  chart({
    id: 'cash6-BTN-vs-CO',
    callWhy: WHY_FLAT_IP('Only the blinds are behind and you have position, so the button flats a wide range of pairs, suited hands and good offsuit broadways.'),
    name: 'BTN vs CO 2.5bb open',
    group: 'defend',
    format: 'cash',
    tableSize: 6,
    position: 'BTN',
    vsPosition: 'CO',
    stackBB: 100,
    priorAction: 'CO opens to 2.5bb.',
    sizing: '3-bet to about 7.5–8bb (IP 3-bets are smaller).',
    assumptions: [...CASH_ASSUMPTIONS, 'You will have position postflop if you call, but both blinds are behind and can squeeze. Flatting is reasonable with hands that play well in position.'],
    confidence: 'illustrative',
    raise: 'QQ+,AKs,AKo,JJ:0.8,TT:0.6,99:0.3,AQs,AJs:0.8,ATs:0.6,A9s:0.4,A8s:0.3,KQs,KJs:0.7,KTs:0.6,K9s:0.4,A5s,A4s,A3s:0.7,A2s:0.5,QJs:0.5,QTs:0.4,Q9s:0.3,JTs:0.5,J9s:0.3,T9s:0.5,98s:0.4,87s:0.4,76s:0.3,65s:0.3,AQo:0.8,AJo:0.5,ATo:0.2,KQo:0.5,KJo:0.2',
    call: 'JJ,TT-22,AJs,ATs,A9s,A8s:0.7,A7s:0.5,A6s:0.3,KQs,KJs,KTs,K9s:0.6,QJs,QTs,Q9s:0.6,JTs,J9s:0.6,T9s,T8s:0.4,98s,87s,76s:0.7,65s:0.6,54s:0.4,AQo:0.2,AJo:0.5,ATo:0.3,KQo:0.5,KJo:0.3,QJo:0.2',
    raiseLabel: '3-bet',
    callLabel: 'Call',
  }),
  chart({
    id: 'cash6-CO-vs-UTG',
    callWhy: WHY_FLAT_IP('Three players are still behind you and UTG is strong, so flats are limited to pairs and the best suited hands.'),
    name: 'CO vs UTG 2.5bb open',
    group: 'defend',
    format: 'cash',
    tableSize: 6,
    position: 'CO',
    vsPosition: 'UTG',
    stackBB: 100,
    priorAction: 'UTG opens to 2.5bb.',
    sizing: '3-bet to about 8bb.',
    assumptions: [...CASH_ASSUMPTIONS, 'Three players remain behind, and the opener’s range is strong. A tight, mostly 3-bet-or-fold strategy avoids playing dominated hands multiway.'],
    confidence: 'illustrative',
    raise: 'QQ+,AKs,AKo,JJ:0.6,TT:0.4,AQs,AJs:0.6,ATs:0.4,KQs:0.8,KJs:0.5,KTs:0.3,A5s,A4s,A3s:0.5,QJs:0.3,JTs:0.3,T9s:0.3,98s:0.2,AQo:0.6,KQo:0.2,KJs:0.6,ATs:0.5,A2s:0.3,99:0.2,AJo:0.3',
    call: 'JJ,TT,99,88:0.8,77:0.6,66:0.5,55:0.3,AJs,ATs,KQs,KJs:0.6,QJs:0.6,JTs:0.5,T9s:0.3,AQo:0.3,66:0.7,55:0.5,44:0.3,KTs:0.5,QTs:0.4,98s:0.4,T9s:0.5',
    raiseLabel: '3-bet',
    callLabel: 'Call',
  }),
];


function defend(pos: string, vs: string, raise: string, call: string, opts: { sizing: string; why: string; extra: string[]; priorAction?: string }): Chart {
  return chart({
    id: `cash6-${pos}-vs-${vs}`,
    name: `${pos} vs ${vs} ${vs === 'SB' ? '3bb' : '2.5bb'} open`,
    group: 'defend',
    format: 'cash',
    tableSize: 6,
    position: pos,
    vsPosition: vs,
    stackBB: 100,
    priorAction: opts.priorAction ?? `${vs} opens to 2.5bb, folded to you.`,
    sizing: opts.sizing,
    assumptions: [...CASH_ASSUMPTIONS, ...opts.extra],
    confidence: 'illustrative',
    raise,
    call,
    raiseLabel: '3-bet',
    callLabel: 'Call',
    callWhy: opts.why,
  });
}

const moreDefendCharts: Chart[] = [
  defend('HJ', 'UTG', 'QQ+,AKs,AKo,JJ:0.6,TT:0.3,AQs,AJs:0.5,ATs:0.3,KQs:0.7,KJs:0.4,A5s,A4s:0.8,A3s:0.4,QJs:0.2,JTs:0.2,T9s:0.2,AQo:0.5,99:0.2,AJo:0.2', 'JJ,TT,99,88:0.8,77:0.6,66:0.4,AJs,ATs,KQs,KJs:0.6,QJs:0.6,JTs:0.5,AQo:0.3,66:0.6,55:0.4,T9s:0.4,KTs:0.4,QTs:0.3,98s:0.2', {
    sizing: '3-bet to about 7.5–8bb.',
    why: WHY_FLAT_IP('Four players are still behind you and any of them can squeeze, so this is the tightest flatting range.'),
    extra: ['UTG’s range is the strongest opening range, so weak offsuit hands (AJo, KQo) are mostly dominated and fold.'],
  }),
  defend('CO', 'HJ', 'QQ+,AKs,AKo,JJ:0.7,TT:0.5,99:0.2,AQs,AJs:0.7,ATs:0.5,A9s:0.3,KQs:0.8,KJs:0.6,KTs:0.4,A5s,A4s,A3s:0.6,A2s:0.3,QJs:0.4,QTs:0.3,JTs:0.4,T9s:0.4,98s:0.3,87s:0.2,AQo:0.7,AJo:0.3,KQo:0.3,A2s:0.5,KQo:0.4,K9s:0.3,AJo:0.4', 'JJ,TT,99,88,77:0.8,66:0.6,55:0.4,AJs,ATs,A9s:0.5,KQs,KJs,KTs:0.6,QJs,QTs:0.5,JTs,T9s:0.6,98s:0.4,AQo:0.3,AJo:0.2,44:0.4,A8s:0.4,J9s:0.4,87s:0.3', {
    sizing: '3-bet to about 7.5–8bb.',
    why: WHY_FLAT_IP('Three players are still behind you (BTN and both blinds), so keep flats to hands that can handle a squeeze.'),
    extra: ['HJ opens a little wider than UTG, so you continue with more hands than CO vs UTG.'],
  }),
  defend('BTN', 'UTG', 'QQ+,AKs,AKo,JJ:0.6,TT:0.4,AQs,AJs:0.6,ATs:0.4,KQs:0.7,KJs:0.5,KTs:0.3,A5s,A4s,A3s:0.5,A2s:0.3,QJs:0.3,JTs:0.3,T9s:0.3,98s:0.3,87s:0.2,76s:0.2,AQo:0.6,KQo:0.2,AJo:0.3,99:0.2,K9s:0.2,A2s:0.5', 'JJ,TT-22,AJs,ATs,A9s:0.6,A8s:0.3,KQs,KJs,KTs:0.7,QJs,QTs:0.6,JTs,T9s,98s:0.7,87s:0.5,76s:0.3,AQo:0.4,AJo:0.3,KQo:0.4', {
    sizing: '3-bet to about 7.5–8bb.',
    why: WHY_FLAT_IP('Only the blinds are behind and you are guaranteed position for the whole hand, so the button flats more than any other seat — including small pairs that hope to flop a set.'),
    extra: ['UTG’s range is strong, so 3-bet mostly for value and flat hands that make strong pairs, sets and draws.'],
  }),
  defend('BTN', 'HJ', 'QQ+,AKs,AKo,JJ:0.7,TT:0.5,99:0.2,AQs,AJs:0.7,ATs:0.5,A9s:0.3,KQs:0.8,KJs:0.6,KTs:0.5,K9s:0.3,A5s,A4s,A3s:0.6,A2s:0.4,QJs:0.4,QTs:0.3,JTs:0.4,T9s:0.4,98s:0.3,87s:0.3,76s:0.2,65s:0.2,AQo:0.7,AJo:0.3,KQo:0.3,AJo:0.4,KJo:0.2,A8s:0.3,K9s:0.4,QJs:0.5', 'JJ,TT-22,AJs,ATs,A9s:0.7,A8s:0.5,A7s:0.3,KQs,KJs,KTs,K9s:0.4,QJs,QTs,Q9s:0.3,JTs,J9s:0.4,T9s,98s,87s:0.7,76s:0.5,65s:0.3,AQo:0.3,AJo:0.5,KQo:0.6', {
    sizing: '3-bet to about 7.5–8bb.',
    why: WHY_FLAT_IP('Only the blinds are behind and you have position, so flatting is attractive with a wide range of pairs, suited hands and the best offsuit broadways.'),
    extra: ['HJ opens wider than UTG, so the button continues wider than BTN vs UTG.'],
  }),
  defend('SB', 'UTG', 'QQ+,AKs,AKo,JJ:0.8,TT:0.5,99:0.3,AQs,AJs:0.8,ATs:0.5,KQs:0.8,KJs:0.5,KTs:0.3,A5s,A4s,A3s:0.5,QJs:0.4,JTs:0.3,T9s:0.3,AQo:0.7,KQo:0.2,AJo:0.3,KQo:0.4,99:0.4,88:0.2,KTs:0.5,QJs:0.6,JTs:0.5,A2s:0.3,T9s:0.4,98s:0.2', 'JJ,TT,99,88:0.6,77:0.4,AJs,ATs:0.5,KQs,KJs:0.4,QJs:0.4,JTs:0.3,88:0.8,77:0.7,66:0.5,55:0.4,44:0.3,ATs:0.5,KTs:0.3,QTs:0.3,T9s:0.4,98s:0.3', {
    sizing: '3-bet to about 11–12bb (larger out of position).',
    why: WHY_FLAT_SB,
    extra: ['UTG’s range is strong and you are out of position, so the SB plays a very tight range here.'],
  }),
  defend('SB', 'HJ', 'QQ+,AKs,AKo,JJ:0.9,TT:0.6,99:0.4,88:0.2,AQs,AJs:0.9,ATs:0.6,A9s:0.3,KQs:0.9,KJs:0.6,KTs:0.4,A5s,A4s,A3s:0.6,A2s:0.3,QJs:0.5,QTs:0.3,JTs:0.4,T9s:0.3,98s:0.2,AQo:0.8,AJo:0.3,KQo:0.3,AJo:0.5,KQo:0.5,99:0.5,88:0.3,KTs:0.6,QJs:0.7,JTs:0.6,A2s:0.5,T9s:0.5,98s:0.3,87s:0.2,KJo:0.2', 'JJ,TT,99,88:0.7,77:0.5,66:0.3,AJs,ATs:0.4,KQs,KJs:0.4,QJs:0.4,JTs:0.4,T9s:0.3,88:0.7,77:0.7,66:0.6,55:0.4,44:0.3,ATs:0.5,A9s:0.3,KTs:0.3,QTs:0.4,98s:0.3,87s:0.2', {
    sizing: '3-bet to about 11bb.',
    why: WHY_FLAT_SB,
    extra: ['Out of position against a fairly strong range: mostly 3-bet or fold.'],
  }),
  defend('SB', 'CO', 'QQ+,AKs,AKo,JJ,TT:0.7,99:0.5,88:0.3,AQs,AJs,ATs:0.7,A9s:0.4,A8s:0.3,KQs,KJs:0.7,KTs:0.5,K9s:0.3,A5s,A4s,A3s:0.7,A2s:0.4,QJs:0.6,QTs:0.4,JTs:0.5,T9s:0.4,98s:0.3,87s:0.2,AQo,AJo:0.5,ATo:0.2,KQo:0.5,KJo:0.2,AJo:0.6,KQo:0.6,KJo:0.3,QJs:0.7,JTs:0.6,76s:0.2,65s:0.2', 'TT,99,88:0.7,77:0.6,66:0.4,55:0.3,ATs:0.3,A9s:0.3,KJs:0.3,KTs:0.4,QJs:0.4,QTs:0.3,JTs:0.5,T9s:0.4,98s:0.3,88:0.8,77:0.7,66:0.6,55:0.5,44:0.4,33:0.3,A8s:0.3,K9s:0.3,Q9s:0.3,J9s:0.3,87s:0.3,76s:0.3', {
    sizing: '3-bet to about 11bb.',
    why: WHY_FLAT_SB,
    extra: ['CO opens wide enough that the SB 3-bets a wider, more aggressive range than against early seats.'],
  }),
  defend('BB', 'HJ', 'QQ+,AKs,AKo,JJ:0.6,TT:0.3,AQs:0.8,AJs:0.5,ATs:0.3,KQs:0.6,KJs:0.3,A5s,A4s:0.8,A3s:0.5,A2s:0.3,K9s:0.4,K8s:0.2,Q9s:0.3,J9s:0.3,T8s:0.3,97s:0.3,86s:0.3,75s:0.2,76s:0.3,65s:0.3,54s:0.3,AQo:0.5,AJo:0.2,KQo:0.2,99:0.2,KTs:0.3,K7s:0.2,K6s:0.2,Q8s:0.2,J8s:0.2,ATo:0.2,KJo:0.2,QJo:0.1', '22+,A2s+,K4s+,Q7s+,J7s+,T7s+,96s+,85s+,75s+,64s+,53s+,ATo+,A9o:0.4,KTo+,QTo+,JTo', {
    sizing: '3-bet to about 12bb.',
    why: WHY_FLAT_BB,
    extra: ['You are getting 1.5bb to call into a 4bb pot, so you need about 27% raw equity before accounting for being out of position. HJ’s range is fairly strong, so weak offsuit hands still fold.'],
  }),
  defend('BB', 'SB', 'TT+,99:0.7,88:0.5,77:0.4,AJs+,ATs:0.8,A9s:0.6,A8s:0.5,A5s-A2s:0.7,KQs,KJs:0.8,KTs:0.7,K9s:0.6,K8s:0.5,K7s:0.4,K6s:0.4,K5s:0.3,QJs:0.6,QTs:0.6,Q9s:0.5,Q8s:0.4,JTs:0.5,J9s:0.5,J8s:0.4,T9s:0.5,T8s:0.5,97s:0.4,98s:0.4,87s:0.4,86s:0.4,76s:0.4,75s:0.3,65s:0.4,54s:0.4,AKo,AQo,AJo:0.7,ATo:0.5,A9o:0.3,A8o:0.2,KQo:0.8,KJo:0.6,KTo:0.4,K9o:0.3,QJo:0.5,QTo:0.4,JTo:0.4,J9o:0.2,T9o:0.2,66:0.3,K4s:0.3,Q7s:0.3,J7s:0.3,96s:0.3,85s:0.3,64s:0.3,53s:0.3', '22+,A2s+,K2s+,Q2s+,J4s+,T5s+,95s+,85s+,74s+,63s+,53s+,43s,A2o+,K5o+,Q7o+,J8o+,T8o+,97o+,87o,76o:0.5', {
    priorAction: 'Folded to the SB, who raises to 3bb.',
    sizing: '3-bet to about 9–10bb (you have position).',
    why: 'Calling is at its best here: you close the action, you have position for the whole hand, and the SB opens a wide range. Call most hands with reasonable equity; 3-bet strong hands and some suited hands that play well as bluffs.',
    extra: ['You are getting 2bb to call into a 4bb pot, so you need about 33% raw equity, but position lets you realize more of it than in other big-blind spots.'],
  }),
];

// ---------------- Facing 3-bets and 4-bets ----------------

const vs3betCharts: Chart[] = [
  chart({
    id: 'cash6-BTN-open-vs-BB-3bet',
    callWhy: 'You have position, so calling the 3-bet is often better than 4-betting with hands that play well postflop: pairs, suited aces and broadways, suited connectors. 4-bet your best hands and a few blockers (A5s, A4s); fold the weakest opens.',
    short: 'BTN vs BB 3-bet',
    reach: OPEN_6MAX.BTN,
    reachLabel: 'your BTN opening range',
    name: 'BTN open, facing BB 3-bet (in position)',
    group: 'vs3bet',
    format: 'cash',
    tableSize: 6,
    position: 'BTN',
    vsPosition: 'BB',
    stackBB: 100,
    priorAction: 'You open BTN to 2.5bb, BB 3-bets to 11bb.',
    sizing: '4-bet to about 24–25bb.',
    assumptions: [...CASH_ASSUMPTIONS, 'You have position, so you can call 3-bets wider than you could OOP. The BB’s 3-bet range vs a BTN open is fairly wide.'],
    confidence: 'illustrative',
    raise: 'QQ+,AKs,AKo,JJ:0.4,AQs:0.3,A5s:0.6,A4s:0.6,A3s:0.4,K9s:0.3,K8s:0.3,Q9s:0.2,AQo:0.3,AJo:0.2,KJo:0.1,76s:0.2,65s:0.2',
    call: 'JJ,TT-22,AQs,AJs,ATs,A9s,A8s,A7s,A6s:0.8,A5s,A4s,A3s,A2s:0.6,KQs,KJs,KTs,K9s,K8s:0.4,K7s:0.3,QJs,QTs,Q9s,Q8s:0.3,JTs,J9s,J8s:0.3,T9s,T8s:0.7,98s,97s:0.7,87s,86s:0.5,76s,75s:0.3,65s,64s:0.3,54s:0.7,53s:0.3,AQo,AJo,ATo:0.6,KQo,KJo:0.7,KTo:0.5,QJo:0.8,QTo:0.3,JTo:0.5',
    raiseLabel: '4-bet',
    callLabel: 'Call',
  }),
  chart({
    id: 'cash6-UTG-open-vs-BTN-3bet',
    callWhy: 'Out of position in a 3-bet pot, so call with strong hands that are not good enough to 4-bet: JJ–66, suited broadways, AK/AQ some of the time and a few suited connectors. Weak offsuit hands and small pairs fold.',
    short: 'UTG vs BTN 3-bet',
    reach: OPEN_6MAX.UTG,
    reachLabel: 'your UTG opening range',
    name: 'UTG open, facing BTN 3-bet (out of position)',
    group: 'vs3bet',
    format: 'cash',
    tableSize: 6,
    position: 'UTG',
    vsPosition: 'BTN',
    stackBB: 100,
    priorAction: 'You open UTG to 2.5bb, BTN 3-bets to 8bb, blinds fold.',
    sizing: '4-bet to about 22bb.',
    assumptions: [...CASH_ASSUMPTIONS, 'You will be out of position in a bloated pot, so you continue with fewer marginal hands than when in position.'],
    confidence: 'illustrative',
    raise: 'KK+,AKs,QQ:0.4,AKo:0.6,A5s:0.5,A4s:0.4,AQo:0.1',
    call: 'QQ,JJ-66,55:0.6,AQs,AJs,ATs,A9s:0.2,KQs,KJs,KTs:0.5,QJs,QTs:0.3,JTs,T9s:0.8,98s:0.4,87s:0.3,76s:0.2,AKo,AQo,KQo:0.2',
    raiseLabel: '4-bet',
    callLabel: 'Call',
  }),
  chart({
    id: 'cash6-BB-3bet-vs-BTN-4bet',
    callWhy: 'Calling a 4-bet leaves a stack-to-pot ratio of about 1.5, so you are committed on most flops. Call with hands that do well all-in but would fold out worse hands if you 5-bet: QQ some of the time, JJ, TT, AQs.',
    short: 'BB vs BTN 4-bet',
    reach: BB_VS_BTN_3BET,
    reachLabel: 'your BB 3-bet range vs a BTN open',
    name: 'BB 3-bet, facing BTN 4-bet',
    group: 'vs4bet',
    format: 'cash',
    tableSize: 6,
    position: 'BB',
    vsPosition: 'BTN',
    stackBB: 100,
    priorAction: 'BTN opens 2.5bb, you 3-bet to 11bb, BTN 4-bets to 25bb.',
    sizing: '5-bet all-in (100bb).',
    assumptions: [...CASH_ASSUMPTIONS, 'At 100bb a 5-bet is effectively all-in. Stack-to-pot ratio after calling a 4-bet is about 1.5, so calling commits you on most flops.'],
    confidence: 'illustrative',
    raise: 'KK+,QQ:0.6,AKs,AKo:0.7,A5s:0.2',
    call: 'QQ:0.4,JJ,TT:0.6,AQs,AJs:0.4,KQs:0.5,AKo:0.3,A5s:0.3,A4s:0.2',
    raiseLabel: '5-bet jam',
    callLabel: 'Call',
  }),
];

// ---------------- Squeeze & iso ----------------

const otherCharts: Chart[] = [
  chart({
    id: 'cash6-BB-squeeze-vs-CO-BTN',
    callWhy: 'With an opener and a caller already in, the price is great and you close the action, so call hands that play well multiway (pairs, suited connectors, suited aces). Squeeze your strongest hands and some blockers, because the caller’s range is capped.',
    short: 'BB squeeze: CO opens, BTN calls',
    name: 'BB squeeze vs CO open + BTN call',
    group: 'squeeze',
    format: 'cash',
    tableSize: 6,
    position: 'BB',
    vsPosition: 'CO+BTN',
    stackBB: 100,
    priorAction: 'CO opens 2.5bb, BTN calls, SB folds.',
    sizing: 'Squeeze to about 13–14bb (larger because two players can continue and the pot is bigger).',
    assumptions: [
      ...CASH_ASSUMPTIONS,
      'The BTN’s flat call caps its range (it would often 3-bet its best hands), which makes squeezing attractive.',
      'Calling is possible with hands that play well multiway (suited connectors, small pairs) thanks to the price.',
    ],
    confidence: 'illustrative',
    raise: 'QQ+,AKs,AKo,JJ:0.6,AQs:0.6,AJs:0.3,KQs:0.4,A5s-A3s:0.6,K9s:0.2,QTs:0.2,65s:0.3,54s:0.3',
    call: '22+,A2s+,K6s+,Q8s+,J8s+,T7s+,96s+,85s+,75s+,64s+,53s+,AJo+,ATo:0.5,KJo+,QJo:0.5',
    raiseLabel: 'Squeeze',
    callLabel: 'Call',
  }),
  chart({
    id: 'cash6-BTN-iso-vs-limper',
    callWhy: 'Over-limp (call 1bb behind) with small pairs and suited connectors when the blinds are passive: they want a cheap multiway flop, not a raised pot.',
    short: 'BTN vs one limper',
    name: 'BTN isolation vs one limper',
    group: 'iso',
    format: 'cash',
    tableSize: 6,
    position: 'BTN',
    vsPosition: 'limper',
    stackBB: 100,
    priorAction: 'A recreational player limps from HJ; folded to you on the BTN.',
    sizing: 'Isolate to about 4–5bb (open size + 1bb per limper, more vs players who call too much).',
    assumptions: [
      'Cash game, 100bb, the limper is a loose-passive recreational player whose limping range is wide and weak.',
      'Isolating aims to play heads-up in position against a weak range with the initiative.',
      'Over-limping is reasonable with small pairs and suited connectors when the blinds are passive.',
      'Illustrative baseline.',
    ],
    confidence: 'illustrative',
    raise: '22+,A2s+,K7s+,Q8s+,J8s+,T8s+,98s,87s:0.5,A7o+,A5o:0.5,KTo+,QTo+,JTo',
    call: '76s:0.6,65s:0.6,54s:0.5,87s:0.5,97s:0.5,K6s:0.5,Q7s:0.4',
    raiseLabel: 'Iso-raise',
    callLabel: 'Over-limp',
  }),
];

// Totals for facing-a-raise and facing-a-3-bet spots were calibrated to published 100bb solver
// summaries (BeyondGTO defense table, Pokalab charts); which hands carry the mixes is illustrative.
const CALIBRATION_NOTE =
  'The overall 3-bet, call and fold frequencies are set to match published 100bb solver summaries for this spot; exactly which hands mix is a simplified illustration.';
const calibrated = (cs: Chart[]) => cs.map((c) => (c.group === 'squeeze' || c.group === 'vs4bet' ? c : { ...c, assumptions: [...c.assumptions, CALIBRATION_NOTE] }));

export const ALL_CHARTS: Chart[] = [...openCharts, ...calibrated([...defendCharts, ...moreDefendCharts, ...vs3betCharts]), ...otherCharts];

export function getChart(id: string): Chart | undefined {
  return ALL_CHARTS.find((c) => c.id === id) ?? pushFoldCharts().find((c) => c.id === id);
}

export function chartFreq(c: Chart, h: HandClass): { raise: number; call: number; fold: number } {
  const raise = c.raise[h] ?? 0;
  const call = c.call[h] ?? 0;
  return { raise, call, fold: Math.max(0, 1 - raise - call) };
}

/** How much of a class can be in the chart's spot (1 when any hand can be dealt into it). */
export function reachWeight(c: Chart, h: HandClass): number {
  return c.reach ? c.reach[h] ?? 0 : 1;
}

/**
 * The hands that actually continue in this spot (raise + call), weighted by how often each class
 * reaches it. For charts without a `reach` this is simply raise + call.
 */
export function chartPlayRange(c: Chart): Range {
  const r = emptyRange();
  for (const h of ALL_CLASSES) r[h] = reachWeight(c, h) * Math.min(1, (c.raise[h] ?? 0) + (c.call[h] ?? 0));
  return r;
}

export interface ChartTotals {
  /** weighted combos that can be in the spot */
  reach: number;
  raise: number;
  call: number;
  fold: number;
  /** all live combos (1326 with no dead cards) */
  all: number;
}

/** Weighted combo counts for the spot, with card removal applied. */
export function chartTotals(c: Chart, dead: Card[] = []): ChartTotals {
  const d = new Set(dead);
  const t: ChartTotals = { reach: 0, raise: 0, call: 0, fold: 0, all: availableCombos(dead) };
  for (const h of ALL_CLASSES) {
    const rw = reachWeight(c, h);
    if (!rw) continue;
    const n = d.size ? combosOf(h).filter(([a, b]) => !d.has(a) && !d.has(b)).length : comboCount(h);
    const f = chartFreq(c, h);
    t.reach += rw * n;
    t.raise += rw * n * f.raise;
    t.call += rw * n * f.call;
    t.fold += rw * n * f.fold;
  }
  return t;
}

export function openRangeFor(tableSize: number, position: string): Range | null {
  if (tableSize === 2) return position === 'BTN' ? parseRange(OPEN_HU_BTN) : null;
  const table = tableSize >= 9 ? OPEN_9MAX : OPEN_6MAX;
  const r = table[position];
  return r ? parseRange(r) : null;
}

// Push/fold charts are computed lazily (they need the preflop equity table).
import { computedPushFoldCharts } from './pushfold';
let pfCache: Chart[] | null = null;
export function pushFoldCharts(): Chart[] {
  if (!pfCache) pfCache = computedPushFoldCharts();
  return pfCache;
}
export function allChartsIncludingComputed(): Chart[] {
  return [...ALL_CHARTS, ...pushFoldCharts()];
}
