// The home page's Continue card: what it suggests from a player's history (the same rules as the
// Progress page), and the five hands on one concept it can start.
import { describe, it, expect } from 'vitest';
import { MIN_N, WEAK_BELOW, conceptStats, continuePlan, nextTrackLesson, strongConcepts, weakConcepts } from '../src/progress/insights';
import { RUN_HANDS, loadRun, recordHand, runAverage, runDone, runFor, saveRun } from '../src/progress/conceptRun';
import { canPractise, conceptSettings } from '../src/scenarios/generator';
import { DEFAULT_SETTINGS } from '../src/scenarios/types';
import { SEQUENCES } from '../src/content/lessons';
import type { HandRecord } from '../src/persistence/storage';
import type { ConceptId } from '../src/content/concepts';

let n = 0;
const hand = (concept: string, points: number | null, assisted = false): HandRecord =>
  ({
    id: `h${++n}`,
    scenarioId: `t@1#${n}`,
    templateId: 't',
    templateVersion: 1,
    scoringVersion: 'x',
    title: 't',
    settings: DEFAULT_SETTINGS,
    difficulty: 'beginner',
    mode: 'guided',
    format: 'cash',
    heroPosition: 'BTN',
    keyStreet: 'river',
    createdAt: n,
    heroActions: [],
    assists: [],
    score: points,
    confidence: 'high',
    assisted,
    decisions: [{ street: 'river', actionLabel: 'Call', grade: 'good', points, confidence: 'high', concepts: [concept as ConceptId], mistakeCategories: [], isKey: true, assisted }],
    netBB: 0,
    bookmarked: false,
  }) as HandRecord;
const times = (k: number, f: () => HandRecord) => Array.from({ length: k }, f);
const always = () => true;

describe('what counts as a weakness', () => {
  it('needs enough scored, unassisted decisions, and an average below the line', () => {
    const history = [...times(MIN_N - 1, () => hand('bluff-catch', 20)), ...times(MIN_N, () => hand('value-bet', WEAK_BELOW - 1)), ...times(MIN_N, () => hand('cbet', WEAK_BELOW))];
    const weak = weakConcepts(conceptStats(history)).map((a) => a.key);
    expect(weak).toEqual(['value-bet']); // bluff-catch has too few; cbet is at the line, a strength
    expect(strongConcepts(conceptStats(history)).map((a) => a.key)).toEqual(['cbet']);
  });

  it('assisted decisions and unscored ones do not count towards it', () => {
    const history = [...times(MIN_N, () => hand('value-bet', 10, true)), ...times(MIN_N, () => hand('bluff', null))];
    expect(weakConcepts(conceptStats(history))).toEqual([]);
    expect(weakConcepts(conceptStats(history, true)).map((a) => a.key)).toEqual(['value-bet']);
  });
});

describe('the next lesson in a study track', () => {
  const first = SEQUENCES[0];
  it('is the first one not completed in a track you have started, in the track’s order', () => {
    expect(nextTrackLesson({})).toBeNull(); // nothing started
    const step = nextTrackLesson({ [first.lessons[0]]: { completed: true, visitedAt: 5 }, [first.lessons[2]]: { completed: true, visitedAt: 6 } });
    expect(step).toMatchObject({ track: first.id, lesson: first.lessons[1], done: 2, total: first.lessons.length });
    // a quiz tried but not passed also starts a track
    expect(nextTrackLesson({ [first.lessons[0]]: { completed: false, quizBest: { correct: 1, total: 3, at: 1 } } })?.lesson).toBe(first.lessons[0]);
  });

  it('skips finished tracks and prefers the one worked on last', () => {
    const second = SEQUENCES[1];
    const done = Object.fromEntries(first.lessons.map((id) => [id, { completed: true, visitedAt: 100 }]));
    expect(nextTrackLesson(done)?.track).not.toBe(first.id);
    const both = { [first.lessons[0]]: { completed: true, visitedAt: 1 }, [second.lessons[0]]: { completed: true, visitedAt: 9 } };
    expect(nextTrackLesson(both)?.track).toBe(second.id);
  });
});

describe('the Continue card', () => {
  it('suggests five hands on the weakest concept practice can deal, with the numbers behind it', () => {
    const history = [...times(6, () => hand('value-bet', 55)), ...times(5, () => hand('bluff', 40))];
    const [main] = continuePlan({ history, lessons: {}, canPractise: (c) => c !== 'bluff' });
    expect(main).toMatchObject({ kind: 'concept', concept: 'value-bet', n: 6 });
    expect(Math.round((main as { avg: number }).avg)).toBe(55);
  });

  it('when practice cannot deal any of them, it points to the lesson instead of unrelated hands', () => {
    const history = times(5, () => hand('check-raise', 40));
    const [main] = continuePlan({ history, lessons: {}, canPractise: () => false });
    expect(main).toMatchObject({ kind: 'concept-lesson', concept: 'check-raise' });
  });

  it('with too little to go on, it says keep practising and calls nothing a weakness', () => {
    const plan = continuePlan({ history: times(2, () => hand('bluff', 10)), lessons: {}, canPractise: always });
    expect(plan[0]).toMatchObject({ kind: 'practice', decisions: 2 });
    expect(plan.some((s) => s.kind === 'concept' || s.kind === 'concept-lesson')).toBe(false);
  });

  it('carries on with five hands already under way before anything else', () => {
    const history = times(6, () => hand('value-bet', 55));
    const [main] = continuePlan({ history, lessons: {}, canPractise: always, run: { concept: 'bluff', done: 2, total: 5 } });
    expect(main).toMatchObject({ kind: 'concept', concept: 'bluff', resume: { done: 2, total: 5 } });
  });

  it('leaves out the Daily five, which is right below it on the home page', () => {
    expect(continuePlan({ history: [], lessons: {}, canPractise: always }).some((s) => (s.kind as string) === 'daily')).toBe(false);
  });
});

describe('practising one concept', () => {
  it('is always single spots on that concept, and says when practice cannot deal it', () => {
    const s = conceptSettings({ ...DEFAULT_SETTINGS, street: 'full' }, 'value-bet');
    expect(s.street).toBe('any');
    expect(s.concepts).toEqual(['value-bet']);
    expect(canPractise(DEFAULT_SETTINGS, 'value-bet')).toBe(true);
    expect(canPractise(DEFAULT_SETTINGS, 'icm')).toBe(false); // not dealt at Beginner
    expect(canPractise({ ...DEFAULT_SETTINGS, difficulty: 'advanced' }, 'icm')).toBe(true);
  });
});

describe('five hands on a concept', () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it('counts each finished hand once, stops at five and averages what could be scored', () => {
    let r = runFor('abc', 'value-bet', null);
    expect(r).toMatchObject({ id: 'abc', concept: 'value-bet', total: RUN_HANDS, hands: [] });
    r = recordHand(r, 'h1', 60);
    expect(recordHand(r, 'h1', 60)).toBe(r); // the same hand again (a rerender, a retry) is not counted
    for (const [id, score] of [['h2', 80], ['h3', null], ['h4', 70], ['h5', 90]] as const) r = recordHand(r, id, score);
    expect(runDone(r)).toBe(true);
    expect(recordHand(r, 'h6', 10)).toBe(r); // nothing after the fifth
    expect(runAverage(r)).toBe(75); // (60 + 80 + 70 + 90) / 4: the unscored hand is left out
  });

  it('carries on after a refresh or another page, and a new link starts a new five', () => {
    const s = store();
    const r = recordHand(recordHand(runFor('abc', 'value-bet', loadRun(s)), 'h1', 50), 'h2', 60);
    saveRun(r, s);
    expect(runFor('abc', 'value-bet', loadRun(s)).hands).toHaveLength(2); // same link: same run
    expect(runFor('xyz', 'value-bet', loadRun(s)).hands).toHaveLength(0); // "5 more": a new one
    expect(runFor('abc', 'bluff', loadRun(s)).hands).toHaveLength(0); // another concept
  });

  it('copes with storage that is missing, blocked or holds something else', () => {
    expect(loadRun(null)).toBeNull();
    const s = store();
    s.setItem('felt-school:concept-run', '{"id":1}');
    expect(loadRun(s)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadRun(broken)).toBeNull();
    expect(() => saveRun(runFor('a', 'bluff', null), broken)).not.toThrow();
  });
});
