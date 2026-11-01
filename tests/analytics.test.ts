// Analytics that must not count twice, and the anonymous "coming back" signal.
import { describe, it, expect } from 'vitest';
import { daysBetween, localDay, noteVisit, returnBucket } from '../src/ui/analytics';

const store = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const recorder = () => {
  const sent: [string, Record<string, unknown> | undefined][] = [];
  return { sent, send: ((e: string, p?: Record<string, unknown>) => void sent.push([e, p])) as never };
};

describe('coming back', () => {
  it('the first visit is only remembered; later days send one event each, with only a rough number of days', () => {
    const s = store();
    const r = recorder();
    noteVisit('2026-10-31', s, r.send);
    noteVisit('2026-10-31', s, r.send); // same day: nothing
    expect(r.sent).toEqual([]);
    noteVisit('2026-11-01', s, r.send);
    noteVisit('2026-11-01', s, r.send); // reloads and React's double effects the same day: nothing more
    noteVisit('2026-11-05', s, r.send);
    noteVisit('2026-11-20', s, r.send);
    noteVisit('2027-01-15', s, r.send);
    expect(r.sent).toEqual([
      ['Returned', { days: '1 day' }],
      ['Returned', { days: '2-7 days' }],
      ['Returned', { days: '8-30 days' }],
      ['Returned', { days: '31+ days' }],
    ]);
    // the dates themselves stay in the browser
    expect(JSON.stringify(r.sent)).not.toMatch(/2026|2027/);
  });

  it('sends nothing without storage, or if storage is blocked or holds something odd', () => {
    const r = recorder();
    noteVisit('2026-11-01', null, r.send);
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => noteVisit('2026-11-01', blocked, r.send)).not.toThrow();
    const odd = store();
    odd.setItem('felt-school:first-visit', 'yesterday');
    noteVisit('2026-11-01', odd, r.send);
    expect(r.sent).toEqual([]);
    expect(odd.m.get('felt-school:first-visit')).toBe('2026-11-01'); // starts afresh
  });

  it('a clock that goes back does not count as a return', () => {
    const s = store();
    const r = recorder();
    noteVisit('2026-11-10', s, r.send);
    noteVisit('2026-11-09', s, r.send);
    expect(r.sent).toEqual([]);
  });

  it('days are calendar days in the visitor’s own time, across months and clock changes', () => {
    expect(localDay(new Date(2026, 9, 31, 23, 59))).toBe('2026-10-31');
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // a spring clock change in between
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect([1, 2, 7, 8, 30, 31].map(returnBucket)).toEqual(['1 day', '2-7 days', '2-7 days', '8-30 days', '8-30 days', '31+ days']);
  });
});
