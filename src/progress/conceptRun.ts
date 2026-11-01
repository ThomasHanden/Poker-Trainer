// Five hands on one concept, started from the home page's Continue card. Kept for this tab only
// (sessionStorage): a refresh or a visit to another page carries on where you were; closing the tab
// ends it. Only hands you finish count, each once, however you get back to the practice page.
import type { ConceptId } from '../content/concepts';

export const RUN_HANDS = 5;
const KEY = 'felt-school:concept-run';

export interface ConceptRun {
  /** from the link that started it, so following the same link again carries on with the same five */
  id: string;
  concept: ConceptId;
  total: number;
  /** finished hands: their saved-hand id (so none counts twice) and score */
  hands: { id: string; score: number | null }[];
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const session = (): Store | null => {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
};

export const runDone = (r: ConceptRun) => r.hands.length >= r.total;

export function loadRun(store = session()): ConceptRun | null {
  try {
    const r = JSON.parse(store?.getItem(KEY) ?? 'null');
    return r && typeof r.id === 'string' && typeof r.concept === 'string' && Array.isArray(r.hands) && r.total > 0 ? r : null;
  } catch {
    return null;
  }
}

export function saveRun(r: ConceptRun, store = session()) {
  try {
    store?.setItem(KEY, JSON.stringify(r));
  } catch {
    /* storage unavailable: the run lasts as long as the page */
  }
}

/** The run a link asks for: the one already under way with that id, or a new one (which replaces any other). */
export function runFor(id: string, concept: ConceptId, existing: ConceptRun | null): ConceptRun {
  return existing && existing.id === id && existing.concept === concept ? existing : { id, concept, total: RUN_HANDS, hands: [] };
}

/** Count a finished hand. The same hand never counts twice, and nothing counts after the fifth. */
export function recordHand(r: ConceptRun, handId: string, score: number | null): ConceptRun {
  if (runDone(r) || r.hands.some((h) => h.id === handId)) return r;
  return { ...r, hands: [...r.hands, { id: handId, score }] };
}

/** Average score of the run's hands that could be scored, or null if none could. */
export function runAverage(r: ConceptRun): number | null {
  const s = r.hands.filter((h) => h.score !== null);
  return s.length ? Math.round(s.reduce((a, h) => a + (h.score as number), 0) / s.length) : null;
}

export const newRunId = () => Math.random().toString(36).slice(2, 10);
