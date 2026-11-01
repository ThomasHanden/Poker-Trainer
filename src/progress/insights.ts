// What a player's history says: averages by concept (or street, position…), what is strong, what to
// work on, and the one next step the home page suggests. The Progress page and the home page's
// Continue card both use these, so they never disagree.
import type { DecisionSummary, HandRecord, LessonProgress } from '../persistence/storage';
import type { ConceptId } from '../content/concepts';
import { SEQUENCES } from '../content/lessons';

export interface Agg {
  key: string;
  n: number;
  avg: number;
  mistakes: number;
}

/** A category needs this many scored decisions before it is called a strength or a weakness. */
export const MIN_N = 5;
/** Averages below this are something to work on; at or above, a strength. */
export const WEAK_BELOW = 80;

export function aggregate(rows: { key: string; d: DecisionSummary }[]): Agg[] {
  const m = new Map<string, { n: number; sum: number; mistakes: number }>();
  for (const { key, d } of rows) {
    if (d.points === null) continue;
    const a = m.get(key) ?? { n: 0, sum: 0, mistakes: 0 };
    a.n++;
    a.sum += d.points;
    if (d.grade === 'mistake' || d.grade === 'blunder' || d.grade === 'inaccuracy') a.mistakes++;
    m.set(key, a);
  }
  return [...m.entries()].map(([key, a]) => ({ key, n: a.n, avg: a.sum / a.n, mistakes: a.mistakes }));
}

/** Decisions made with help (assisted) or without; the two are never mixed. */
export const decisionsOf = (history: HandRecord[], assisted: boolean) =>
  history.flatMap((h) => h.decisions.filter((d) => !!d.assisted === assisted).map((d) => ({ h, d })));

export const conceptStats = (history: HandRecord[], assisted = false): Agg[] =>
  aggregate(decisionsOf(history, assisted).flatMap(({ d }) => d.concepts.map((c) => ({ key: c, d }))));

/** Concepts with enough decisions to judge that average below WEAK_BELOW, weakest first. */
export const weakConcepts = (stats: Agg[]): Agg[] => stats.filter((a) => a.n >= MIN_N && a.avg < WEAK_BELOW).sort((a, b) => a.avg - b.avg);

/** Concepts with enough decisions to judge that average WEAK_BELOW or more, strongest first. */
export const strongConcepts = (stats: Agg[]): Agg[] => stats.filter((a) => a.n >= MIN_N && a.avg >= WEAK_BELOW).sort((a, b) => b.avg - a.avg);

export interface TrackStep {
  track: string;
  title: string;
  lesson: string;
  done: number;
  total: number;
}

/**
 * The next lesson to read in a study track you have started (finished a lesson in, or tried its
 * quiz): the first one in the track's order not yet completed. With several tracks on the go, the
 * one you worked on last. Finished tracks are left out.
 */
export function nextTrackLesson(lessons: Record<string, LessonProgress>, tracks = SEQUENCES): TrackStep | null {
  let best: (TrackStep & { last: number }) | null = null;
  for (const t of tracks) {
    const touched = t.lessons.filter((id) => lessons[id]?.completed || lessons[id]?.quizBest);
    const next = t.lessons.find((id) => !lessons[id]?.completed);
    if (!touched.length || !next) continue;
    const last = Math.max(0, ...touched.map((id) => lessons[id]?.visitedAt ?? lessons[id]?.quizBest?.at ?? 0));
    const done = t.lessons.filter((id) => lessons[id]?.completed).length;
    if (!best || last > best.last) best = { track: t.id, title: t.title, lesson: next, done, total: t.lessons.length, last };
  }
  if (!best) return null;
  const { last: _last, ...step } = best;
  return step;
}

/** Today's Daily five: not started, part answered, or finished (with its points). */
export type DailyState = { state: 'new' } | { state: 'started'; answered: number; total: number } | { state: 'done'; points: number };

export type Suggestion =
  /** five hands on a concept you are finding hard (or carrying on with the five you started) */
  | { kind: 'concept'; concept: ConceptId; avg: number; n: number; resume?: { done: number; total: number } }
  /** a concept you are finding hard that practice cannot deal with your settings: its lesson instead */
  | { kind: 'concept-lesson'; concept: ConceptId; avg: number; n: number }
  | ({ kind: 'lesson' } & TrackStep)
  | ({ kind: 'daily' } & DailyState)
  /** not enough decisions yet to say what to work on */
  | { kind: 'practice'; decisions: number };

export interface PlanInput {
  history: HandRecord[];
  lessons: Record<string, LessonProgress>;
  daily: DailyState;
  /** whether practice can deal hands on this concept with the player's settings */
  canPractise: (c: ConceptId) => boolean;
  /** five hands on a concept started in this tab and not finished yet */
  run?: { concept: ConceptId; done: number; total: number } | null;
}

/**
 * What the home page suggests, best first: the first is the main suggestion, the rest are smaller
 * links. Only concepts with enough decisions to judge (MIN_N, unassisted) are called something to
 * work on; with too few, the suggestion is simply to keep practising.
 */
export function continuePlan({ history, lessons, daily, canPractise, run }: PlanInput): Suggestion[] {
  const out: Suggestion[] = [];
  const stats = conceptStats(history);
  const weak = weakConcepts(stats);
  const running = !!run && run.done < run.total;
  // 1. five hands on a concept: carry on with the ones started, or the weakest one practice can deal
  if (run && running) {
    const s = stats.find((a) => a.key === run.concept);
    out.push({ kind: 'concept', concept: run.concept, avg: s?.avg ?? 0, n: s?.n ?? 0, resume: { done: run.done, total: run.total } });
  } else {
    const practisable = weak.find((a) => canPractise(a.key as ConceptId));
    if (practisable) out.push({ kind: 'concept', concept: practisable.key as ConceptId, avg: practisable.avg, n: practisable.n });
    else if (weak.length) out.push({ kind: 'concept-lesson', concept: weak[0].key as ConceptId, avg: weak[0].avg, n: weak[0].n });
  }
  // 2. the next lesson in a study track you have started
  const step = nextTrackLesson(lessons);
  if (step) out.push({ kind: 'lesson', ...step });
  // 3. nothing to work on (yet): more practice, which is also what finds the weak spots
  if (!weak.length && !running) out.push({ kind: 'practice', decisions: decisionsOf(history, false).filter(({ d }) => d.points !== null).length });
  // 4. today's Daily five (once finished, the card just says so)
  out.push({ kind: 'daily', ...daily });
  return out;
}
