import { describe, it, expect } from 'vitest';
import { LESSONS, LESSON_INDEX, SEQUENCES, SECTIONS } from '../src/content/lessons';
import { TEMPLATES } from '../src/scenarios/templates';
import { CONCEPTS } from '../src/content/concepts';
import { SOURCES } from '../src/content/sources';
import { ALL_CHARTS, allChartsIncludingComputed } from '../src/ranges/presets';
import { rangeCombos } from '../src/ranges/hands';

describe('lesson library', () => {
  it('covers every section with substantive lessons', () => {
    for (const s of SECTIONS) expect(LESSONS.filter((l) => l.section === s.id).length).toBeGreaterThanOrEqual(5);
    expect(LESSONS.length).toBeGreaterThanOrEqual(75);
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
  });
  it('every lesson has all required parts', () => {
    for (const l of LESSONS) {
      const words = [...l.plain, ...l.why, ...l.example.steps, ...l.mistakes].join(' ').split(/\s+/).length;
      expect(words, l.id).toBeGreaterThan(90);
      expect(l.plain.length, l.id).toBeGreaterThan(0);
      expect(l.why.length, l.id).toBeGreaterThan(0);
      expect(l.example.steps.length, l.id).toBeGreaterThan(0);
      expect(l.mistakes.length, l.id).toBeGreaterThan(0);
      expect(l.assumptions.length, l.id).toBeGreaterThan(0);
      expect(l.quiz.length, l.id).toBeGreaterThan(0);
      for (const q of l.quiz) {
        expect(q.answer, l.id).toBeGreaterThanOrEqual(0);
        expect(q.answer, l.id).toBeLessThan(q.options.length);
        expect(q.explain.length).toBeGreaterThan(5);
      }
      for (const t of l.practice.templates ?? []) expect(TEMPLATES.some((x) => x.id === t), `${l.id} -> ${t}`).toBe(true);
      for (const c of l.practice.concepts ?? []) expect(CONCEPTS[c], `${l.id} concept ${c}`).toBeDefined();
      for (const r of l.related) expect(LESSON_INDEX[r], `${l.id} related ${r}`).toBeDefined();
      for (const s of l.sources) expect(SOURCES[s], `${l.id} source ${s}`).toBeDefined();
    }
  });
  it('every lesson referenced by templates, concepts and sequences exists', () => {
    for (const t of TEMPLATES) for (const id of t.lessons) expect(LESSON_INDEX[id], `${t.id} -> ${id}`).toBeDefined();
    for (const [k, c] of Object.entries(CONCEPTS)) expect(LESSON_INDEX[c.lesson], `${k} -> ${c.lesson}`).toBeDefined();
    for (const s of SEQUENCES) for (const id of s.lessons) expect(LESSON_INDEX[id], `${s.id} -> ${id}`).toBeDefined();
  });
});

describe('preset charts', () => {
  it('state assumptions and confidence, and have sane sizes', () => {
    for (const c of allChartsIncludingComputed()) {
      expect(c.assumptions.length, c.id).toBeGreaterThan(0);
      expect(['illustrative', 'computed']).toContain(c.confidence);
      for (const h of Object.keys(c.raise)) expect((c.raise[h] ?? 0) + (c.call[h] ?? 0)).toBeLessThanOrEqual(1.0000001);
    }
    const pct = (id: string) => (100 * rangeCombos(ALL_CHARTS.find((c) => c.id === id)!.raise)) / 1326;
    expect(pct('cash6-open-UTG')).toBeLessThan(pct('cash6-open-HJ'));
    expect(pct('cash6-open-HJ')).toBeLessThan(pct('cash6-open-CO'));
    expect(pct('cash6-open-CO')).toBeLessThan(pct('cash6-open-BTN'));
    expect(pct('cash9-open-UTG')).toBeLessThan(pct('cash6-open-UTG'));
  });
});
