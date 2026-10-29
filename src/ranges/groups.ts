// Families of starting hands, used to summarise how much of each family a range plays.

import { ALL_CLASSES, HandClass, MATRIX_RANKS, Range, comboCount, isPair, isSuited } from './hands';

export interface HandGroup {
  id: string;
  name: string;
  hint: string;
  test: (h: HandClass) => boolean;
}

const rank = (c: string) => MATRIX_RANKS.indexOf(c); // 0 = A … 12 = 2
const broadway = (c: string) => rank(c) <= 4; // A K Q J T

export const HAND_GROUPS: HandGroup[] = [
  { id: 'pairs', name: 'Pocket pairs', hint: '22–AA', test: (h) => isPair(h) },
  { id: 'suited-aces', name: 'Suited aces', hint: 'A2s–AKs', test: (h) => !isPair(h) && h[0] === 'A' && isSuited(h) },
  { id: 'offsuit-aces', name: 'Offsuit aces', hint: 'A2o–AKo', test: (h) => !isPair(h) && h[0] === 'A' && !isSuited(h) },
  { id: 'suited-broadway', name: 'Suited broadways', hint: 'KQs, KJs, QJs, JTs…', test: (h) => !isPair(h) && h[0] !== 'A' && broadway(h[1]) && isSuited(h) },
  { id: 'offsuit-broadway', name: 'Offsuit broadways', hint: 'KQo, KJo, QJo, JTo…', test: (h) => !isPair(h) && h[0] !== 'A' && broadway(h[1]) && !isSuited(h) },
  {
    id: 'suited-connectors',
    name: 'Suited connectors & gappers',
    hint: 'T9s, 87s, 97s, 54s…',
    test: (h) => !isPair(h) && isSuited(h) && h[0] !== 'A' && !broadway(h[1]) && rank(h[1]) - rank(h[0]) <= 2,
  },
  { id: 'other-suited', name: 'Other suited', hint: 'K7s, Q5s, 94s…', test: (h) => !isPair(h) && isSuited(h) && h[0] !== 'A' && !broadway(h[1]) && rank(h[1]) - rank(h[0]) > 2 },
  { id: 'other-offsuit', name: 'Other offsuit', hint: 'K9o, T8o, 72o…', test: (h) => !isPair(h) && !isSuited(h) && h[0] !== 'A' && !broadway(h[1]) },
];

export function groupClasses(id: string): HandClass[] {
  const g = HAND_GROUPS.find((x) => x.id === id);
  return g ? ALL_CLASSES.filter(g.test) : [];
}

export interface GroupShare {
  group: HandGroup;
  played: number; // weighted combos in the range
  total: number; // combos in the family
}

export function groupBreakdown(r: Range): GroupShare[] {
  return HAND_GROUPS.map((group) => {
    let played = 0;
    let total = 0;
    for (const h of ALL_CLASSES) {
      if (!group.test(h)) continue;
      const n = comboCount(h);
      total += n;
      played += n * Math.min(1, r[h] ?? 0);
    }
    return { group, played, total };
  });
}
