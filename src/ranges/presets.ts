// Preset preflop charts.
//
// HONESTY NOTE: Unless marked `computed`, these charts are ILLUSTRATIVE baselines written for this
// app from widely taught principles (position, playability, blockers, domination). They are not
// solver outputs and are not copied from any commercial chart pack. Real equilibrium strategies
// depend on rake, sizing, stack depth and the exact population, and they mix many hands.
// `computed` charts (heads-up push/fold) are produced by this app's own equilibrium calculation
// (see src/ranges/pushfold.ts) under the simplified model stated in their assumptions.

import { Range, parseRange, emptyRange, ALL_CLASSES, HandClass } from './hands';

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
  notes?: string;
}

const CASH_ASSUMPTIONS = [
  'No-limit hold’em cash game, 100bb effective stacks.',
  'Typical online-style rake (roughly 5% capped) — rake punishes flatting and limping.',
  'Opens are 2.5bb (3bb from the SB). No antes.',
  'Opponents are unknown, reasonably competent regulars.',
  'Illustrative baseline, not a solver output. Equilibrium strategies mix more hands.',
];

function chart(c: Omit<Chart, 'raise' | 'call'> & { raise: string; call?: string }): Chart {
  const raise = parseRange(c.raise);
  const call = c.call ? parseRange(c.call) : emptyRange();
  // make raise + call <= 1, prioritizing the raise frequency
  for (const h of ALL_CLASSES) call[h] = Math.max(0, Math.min(call[h], 1 - raise[h]));
  return { ...c, raise, call };
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
export const OPEN_HU_BTN =
  '22+,A2s+,K2s+,Q2s+,J2s+,T3s+,95s+,85s+,74s+,63s+,53s+,42s+,32s,A2o+,K2o+,Q5o+,J7o+,T7o+,97o+,86o+,76o,65o:0.5,Q2o-Q4o:0.5';

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
      sizing: 'Raise to 2.5–3bb.',
      assumptions: [
        ...CASH_ASSUMPTIONS.map((a) => a.replace('100bb effective stacks.', '100bb, 9-handed.')),
        ['UTG', 'UTG1', 'MP'].includes(pos)
          ? 'With 6–8 players behind, the chance someone wakes up with a strong hand is much higher than in 6-max, so early ranges are tighter.'
          : 'From this seat the number of players behind is the same as from the equivalent 6-max seat, so the same baseline range is used.',
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
      'Illustrative baseline. Heads-up equilibrium strategies also limp some hands.',
    ],
    confidence: 'illustrative',
    raise: OPEN_HU_BTN,
    raiseLabel: 'Open-raise',
  }),
];

// ---------------- Defending vs opens ----------------

const defendCharts: Chart[] = [
  chart({
    id: 'cash6-BB-vs-BTN',
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
    raise: 'QQ+,AKs,AKo,JJ:0.5,TT:0.3,AQs:0.5,AJs:0.3,KQs:0.5,A5s-A2s:0.6,K9s:0.3,Q9s:0.3,J9s:0.3,T8s:0.3,86s:0.3,75s:0.3,65s:0.4,54s:0.4,A9o:0.2,KJo:0.3',
    call: '22+,A2s+,K2s+,Q2s+,J4s+,T6s+,96s+,85s+,74s+,63s+,53s+,43s,A2o+,K7o+,Q8o+,J8o+,T8o+,98o,87o,76o:0.5',
    raiseLabel: '3-bet',
    callLabel: 'Call',
  }),
  chart({
    id: 'cash6-BB-vs-CO',
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
    raise: 'QQ+,AKs,AKo,JJ:0.4,AQs:0.4,KQs:0.3,A5s-A4s:0.5,A3s:0.3,K9s:0.2,76s:0.3,65s:0.3,54s:0.3',
    call: '22+,A2s+,K5s+,Q7s+,J7s+,T7s+,96s+,85s+,75s+,64s+,53s+,A8o+,A5o:0.5,KTo+,QTo+,JTo,T9o,98o:0.4',
    raiseLabel: '3-bet',
    callLabel: 'Call',
  }),
  chart({
    id: 'cash6-BB-vs-UTG',
    name: 'BB vs UTG 2.5bb open',
    group: 'defend',
    format: 'cash',
    tableSize: 6,
    position: 'BB',
    vsPosition: 'UTG',
    stackBB: 100,
    priorAction: 'UTG opens to 2.5bb, everyone else folds.',
    sizing: '3-bet to about 12bb.',
    assumptions: [...CASH_ASSUMPTIONS, 'UTG’s range is strong, so dominated offsuit hands (KTo, QTo, A9o) lose a lot when they make top pair. Prefer suited and connected hands that make strong hands or draws.'],
    confidence: 'illustrative',
    raise: 'QQ+,AKs,AKo:0.7,A5s:0.5,A4s:0.3,KQs:0.2',
    call: '22+,A2s+,K8s+,Q9s+,J9s+,T8s+,97s+,86s+,75s+,65s,54s,AJo+,KQo,KJo:0.4,JJ:1,TT:1,AQs:1,AKo:0.3',
    raiseLabel: '3-bet',
    callLabel: 'Call',
  }),
  chart({
    id: 'cash6-SB-vs-BTN',
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
      'SB will be out of position and the BB is still behind and can squeeze, so the baseline is mostly 3-bet-or-fold. Some flatting with strong hands is used in practice, especially at lower rake.',
    ],
    confidence: 'illustrative',
    raise: '88+,77:0.5,A9s+,A5s-A2s,KTs+,QTs+,JTs,T9s:0.6,98s:0.5,87s:0.4,76s:0.4,AJo+,ATo:0.5,KQo,KJo:0.5,K9s:0.4,Q9s:0.3',
    call: '66:0.3,55:0.3,A8s:0.3,A7s:0.3',
    raiseLabel: '3-bet',
    callLabel: 'Call',
  }),
  chart({
    id: 'cash6-BTN-vs-CO',
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
    raise: 'JJ+,AKs,AKo,TT:0.4,AQs:0.6,AJs:0.3,KQs:0.4,A5s-A3s:0.6,K9s:0.3,Q9s:0.3,J9s:0.3,T8s:0.3,65s:0.3,AQo:0.4,KJo:0.2',
    call: '22+,A2s+,K9s+,Q9s+,J9s+,T8s+,97s+,86s+,76s,65s,54s:0.5,AJo+,ATo:0.5,KQo,KJo:0.5,QJo:0.4',
    raiseLabel: '3-bet',
    callLabel: 'Call',
  }),
  chart({
    id: 'cash6-CO-vs-UTG',
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
    raise: 'QQ+,AKs,AKo,JJ:0.5,AQs:0.5,A5s:0.5,A4s:0.4,KQs:0.3,KJs:0.2,76s:0.2',
    call: 'TT-77,JJ:0.5,AQs:0.5,AJs,ATs,KQs:0.7,KJs:0.5,QJs:0.6,JTs:0.6,T9s:0.4,66:0.5,AQo:0.5',
    raiseLabel: '3-bet',
    callLabel: 'Call',
  }),
];

// ---------------- Facing 3-bets and 4-bets ----------------

const vs3betCharts: Chart[] = [
  chart({
    id: 'cash6-BTN-open-vs-BB-3bet',
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
    raise: 'QQ+,AKs,AKo,JJ:0.3,A5s:0.5,A4s:0.4,K9s:0.2,AJo:0.2',
    call: 'JJ:0.7,TT-55,AQs,AJs,ATs,A9s:0.6,A8s:0.4,KTs+,QTs+,JTs,T9s,98s,87s,76s:0.6,65s:0.5,AQo,AJo:0.6,KQo:0.7,44:0.4',
    raiseLabel: '4-bet',
    callLabel: 'Call',
  }),
  chart({
    id: 'cash6-UTG-open-vs-BTN-3bet',
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
    raise: 'KK+,AKs,QQ:0.5,AKo:0.6,A5s:0.4,A4s:0.2',
    call: 'QQ:0.5,JJ-77,AQs,AJs,ATs:0.5,KQs,KJs,QJs,JTs,T9s:0.5,AKo:0.4,AQo:0.5,66:0.3',
    raiseLabel: '4-bet',
    callLabel: 'Call',
  }),
  chart({
    id: 'cash6-BB-3bet-vs-BTN-4bet',
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

export const ALL_CHARTS: Chart[] = [...openCharts, ...defendCharts, ...vs3betCharts, ...otherCharts];

export function getChart(id: string): Chart | undefined {
  return ALL_CHARTS.find((c) => c.id === id) ?? pushFoldCharts().find((c) => c.id === id);
}

export function chartFreq(c: Chart, h: HandClass): { raise: number; call: number; fold: number } {
  const raise = c.raise[h] ?? 0;
  const call = c.call[h] ?? 0;
  return { raise, call, fold: Math.max(0, 1 - raise - call) };
}

/** Combined "plays" range = raise + call. */
export function chartPlayRange(c: Chart): Range {
  const r = emptyRange();
  for (const h of ALL_CLASSES) r[h] = Math.min(1, (c.raise[h] ?? 0) + (c.call[h] ?? 0));
  return r;
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
