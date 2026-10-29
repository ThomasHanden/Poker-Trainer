import { describe, it, expect } from 'vitest';
import { puzzleSet, randomPuzzle, streak, todayKey, pointsFor, PuzzleRun } from '../src/puzzles/daily';
import { compareHands, evaluate, categoryOf, HandCategory } from '../src/engine/evaluator';
import { fullDeck } from '../src/engine/cards';

function check(p: ReturnType<typeof randomPuzzle>) {
  expect(new Set(p.options).size, `${p.kind} ${p.options}`).toBe(p.options.length);
  expect(p.answer).toBeGreaterThanOrEqual(0);
  expect(p.answer).toBeLessThan(p.options.length);
  if (p.kind === 'showdown') {
    const cmp = compareHands(p.hero!, p.villain!, p.board!);
    expect(p.answer).toBe(cmp > 0 ? 0 : cmp < 0 ? 1 : 2);
  }
  if (p.kind === 'outs') {
    const seen = new Set([...p.hero!, ...p.board!]);
    const outs = fullDeck().filter((c) => !seen.has(c) && categoryOf(evaluate([...p.hero!, ...p.board!, c])) >= HandCategory.Straight).length;
    expect(Number(p.options[p.answer])).toBe(outs);
  }
  if (p.kind === 'nuts') {
    const seen = new Set(p.board!);
    const rest = fullDeck().filter((c) => !seen.has(c));
    let best = -1;
    for (let a = 0; a < rest.length; a++) for (let b = a + 1; b < rest.length; b++) best = Math.max(best, evaluate([...p.board!, rest[a], rest[b]]));
    const names = ['', '', '', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
    expect(p.options[p.answer]).toBe(names[categoryOf(best)]);
  }
}

describe('puzzles', () => {
  it('daily sets are deterministic, well formed and correct', () => {
    expect(puzzleSet('2026-10-29')).toEqual(puzzleSet('2026-10-29'));
    for (let d = 1; d <= 60; d++) {
      const set = puzzleSet(`day-${d}`);
      expect(set.length).toBe(5);
      set.forEach(check);
    }
  });
  it('survival puzzles of every kind are correct', () => {
    const kinds = new Set<string>();
    for (let k = 0; k < 160; k++) {
      const p = randomPuzzle('test', k);
      kinds.add(p.kind);
      check(p);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(7);
  });
  it('scores answers with speed and combo', () => {
    expect(pointsFor(false, 1000, 3)).toBe(0);
    expect(pointsFor(true, 1000, 1)).toBe(150);
    expect(pointsFor(true, 30000, 1)).toBe(100);
    expect(pointsFor(true, 1000, 5)).toBe(300);
  });
  it('counts streaks of consecutive daily runs', () => {
    const today = new Date(2026, 9, 29);
    const run = (d: Date): PuzzleRun => ({ id: `daily:${todayKey(d)}`, mode: 'daily', date: todayKey(d), points: 300, correct: 3, total: 5, ms: 1, at: 0, marks: 'ooxxo' });
    const days = [0, 1, 2, 4].map((k) => run(new Date(2026, 9, 29 - k)));
    expect(streak(days, today)).toBe(3);
    expect(streak(days.slice(1), today)).toBe(2);
  });
});
