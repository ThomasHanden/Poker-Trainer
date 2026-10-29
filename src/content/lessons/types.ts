import type { ConceptId } from '../concepts';

export type SectionId = 'foundations' | 'preflop' | 'postflop' | 'sizing' | 'math' | 'ranges' | 'adaptation' | 'tournament' | 'discipline';

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number; // index into options
  explain: string;
}

export interface Lesson {
  id: string;
  section: SectionId;
  title: string;
  summary: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  /** format dependence: 'both' = applies to cash and tournaments */
  format: 'both' | 'cash' | 'tournament';
  plain: string[]; // plain-language explanation (paragraphs)
  why: string[]; // why it matters
  example: { title: string; steps: string[] };
  mistakes: string[];
  math?: { formulas?: string[]; notes: string[] };
  assumptions: string[]; // assumptions and exceptions
  quiz: QuizQuestion[];
  practice: { label: string; templates?: string[]; concepts?: ConceptId[] };
  related: string[];
  sources: string[]; // ids in SOURCES
}

export const SECTIONS: { id: SectionId; title: string; blurb: string }[] = [
  { id: 'foundations', title: 'Foundations', blurb: 'Rules, position, blinds, and thinking in ranges and expected value.' },
  { id: 'preflop', title: 'Preflop strategy', blurb: 'Which hands to play, how to open, defend, 3-bet and adjust for stacks and rake.' },
  { id: 'postflop', title: 'Postflop strategy', blurb: 'Board texture, range advantage, c-betting, check-raising and planning streets.' },
  { id: 'sizing', title: 'Bet sizing', blurb: 'What bets do, and how size changes which hands continue.' },
  { id: 'math', title: 'Poker mathematics', blurb: 'Pot odds, outs, EV, fold equity, combinatorics and their limits.' },
  { id: 'ranges', title: 'Ranges', blurb: 'Constructing, reading and narrowing ranges; blockers and mixed strategies.' },
  { id: 'adaptation', title: 'Opponent adaptation', blurb: 'Tendencies, exploits, GTO as a baseline and sample-size limits.' },
  { id: 'tournament', title: 'Tournament strategy', blurb: 'Antes, short stacks, push/fold, ICM, bubbles, final tables and bounties.' },
  { id: 'discipline', title: 'Study & decision discipline', blurb: 'Hand review, leaks, results-oriented thinking, tilt and bankroll.' },
];
