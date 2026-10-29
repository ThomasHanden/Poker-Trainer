import { describe, it, expect } from 'vitest';
import { puzzleSet, streak, todayKey } from '../src/puzzles/daily';
import { compareHands } from '../src/engine/evaluator';

describe('daily puzzles', () => {
  it('are deterministic per day and well formed', () => {
    expect(puzzleSet('2026-10-29')).toEqual(puzzleSet('2026-10-29'));
    for (let d = 1; d <= 120; d++) {
      const key = `2026-${String(1 + (d % 12)).padStart(2, '0')}-${String(1 + (d % 28)).padStart(2, '0')}-${d}`;
      const set = puzzleSet(key);
      expect(set.length).toBe(5);
      for (const p of set) {
        expect(new Set(p.options).size, `${p.kind} ${p.options}`).toBe(p.options.length);
        expect(p.options.length).toBeGreaterThanOrEqual(2);
        expect(p.answer).toBeGreaterThanOrEqual(0);
        expect(p.answer).toBeLessThan(p.options.length);
        if (p.kind === 'showdown') {
          const cmp = compareHands(p.hero!, p.villain!, p.board!);
          expect(p.answer).toBe(cmp > 0 ? 0 : cmp < 0 ? 1 : 2);
        }
        if (p.kind === 'potodds' || p.kind === 'bluff' || p.kind === 'combos') expect(p.options.length).toBe(4);
      }
    }
  });
  it('counts streaks of consecutive days', () => {
    const today = new Date(2026, 9, 29);
    const run = (d: Date) => ({ date: todayKey(d), score: 3, total: 5, ms: 1, at: 0 });
    const days = [0, 1, 2, 4].map((k) => run(new Date(2026, 9, 29 - k)));
    expect(streak(days, today)).toBe(3);
    expect(streak(days.slice(1), today)).toBe(2);
  });
});
