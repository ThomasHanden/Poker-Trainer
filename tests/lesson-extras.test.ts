import { describe, it, expect } from 'vitest';
import { LESSONS } from '../src/content/lessons';
import { EXTRAS } from '../src/content/lessons/extra';

describe('deeper lesson material', () => {
  it('every lesson has deeper sections, a checklist, key terms and at least two quiz questions', () => {
    for (const l of LESSONS) {
      expect(l.deeper?.length, l.id).toBeGreaterThanOrEqual(2);
      expect(l.apply?.length, l.id).toBeGreaterThanOrEqual(3);
      expect(l.terms?.length, l.id).toBeGreaterThanOrEqual(3);
      expect(l.quiz.length, l.id).toBeGreaterThanOrEqual(2);
      expect(l.takeaways?.length, l.id).toBeGreaterThanOrEqual(3);
      expect(l.problems?.length, l.id).toBeGreaterThanOrEqual(2);
    }
  });
  it('extras only refer to real lessons, and extra quiz answers are valid', () => {
    const ids = new Set(LESSONS.map((l) => l.id));
    for (const [id, x] of Object.entries(EXTRAS)) {
      expect(ids.has(id), id).toBe(true);
      for (const q of x.quiz ?? []) expect(q.answer, `${id}: ${q.q}`).toBeLessThan(q.options.length);
    }
  });
});
