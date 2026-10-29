import { Lesson, SECTIONS, SectionId } from './types';
import { FOUNDATIONS } from './foundations';
import { PREFLOP } from './preflop';
import { POSTFLOP } from './postflop';
import { SIZING } from './sizing';
import { MATH } from './math';
import { RANGES } from './ranges';
import { ADAPTATION } from './adaptation';
import { TOURNAMENT } from './tournament';
import { DISCIPLINE } from './discipline';
import { EXTRAS } from './extra';
import { DRILLS } from './extra2';

const BASE: Lesson[] = [...FOUNDATIONS, ...PREFLOP, ...POSTFLOP, ...SIZING, ...MATH, ...RANGES, ...ADAPTATION, ...TOURNAMENT, ...DISCIPLINE];
export const LESSONS: Lesson[] = BASE.map((l) => {
  const x = EXTRAS[l.id];
  const d = DRILLS[l.id];
  const withExtra = x ? { ...l, deeper: x.deeper, apply: x.apply, examples: x.examples, terms: x.terms, quiz: [...l.quiz, ...(x.quiz ?? [])] } : l;
  return d ? { ...withExtra, takeaways: d.takeaways, problems: d.problems } : withExtra;
});
export const LESSON_INDEX: Record<string, Lesson> = Object.fromEntries(LESSONS.map((l) => [l.id, l]));
export const lessonsInSection = (s: SectionId) => LESSONS.filter((l) => l.section === s);
export { SECTIONS };
export type { Lesson };

/** Optional study sequences. Every lesson stays accessible; these are only suggestions. */
export const SEQUENCES: { id: string; title: string; blurb: string; lessons: string[] }[] = [
  {
    id: 'first-steps',
    title: 'First steps',
    blurb: 'New to hold’em strategy: rules to the first preflop and postflop decisions.',
    lessons: ['rules-rankings', 'position', 'blinds-antes-stacks', 'starting-hands-position', 'opening-ranges', 'pot-odds', 'aggression-initiative', 'value-bluff-semibluff', 'thinking-in-ranges', 'results-oriented'],
  },
  {
    id: 'cash-core',
    title: 'Cash-game core',
    blurb: 'The decisions that come up most at 100bb.',
    lessons: ['blind-defense', 'calling-vs-raising', 'three-four-betting', 'board-texture', 'range-advantage', 'cbetting', 'equity-denial-realization', 'turn-river-planning', 'thin-value', 'bluff-catching', 'mdf'],
  },
  {
    id: 'math-track',
    title: 'Math track',
    blurb: 'From pot odds to bluff-to-value ratios, with their limitations.',
    lessons: ['pot-odds', 'break-even-equity', 'outs', 'implied-odds', 'expected-value', 'fold-equity', 'equity-vs-range', 'combinatorics', 'bluff-value-ratios', 'mdf', 'equity-not-action'],
  },
  {
    id: 'tournament-track',
    title: 'Tournament track',
    blurb: 'Antes, short stacks, push/fold and ICM.',
    lessons: ['antes-stack-depth', 'short-stack', 'push-fold', 'fold-equity', 'chip-ev-vs-icm', 'icm', 'covering-stacks', 'payouts', 'final-table', 'bounties'],
  },
  {
    id: 'advanced-ranges',
    title: 'Advanced ranges & sizing',
    blurb: 'Range construction, blockers, polarization and overbets.',
    lessons: ['constructing-ranges', 'weighted-combos', 'narrowing-ranges', 'capped-uncapped', 'blockers', 'value-bluff-composition', 'mixed-strategies', 'polarized-merged', 'geometric-sizing', 'overbets-underbets', 'gto-baseline', 'exploitative-adjustments'],
  },
];
