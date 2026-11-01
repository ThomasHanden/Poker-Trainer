// Custom analytics events (Vercel Web Analytics). Every event goes through track() here, so:
// - never send email addresses, cards, hand details, tokens or anything else private;
// - keep to at most two properties per event, each a short label;
// - events that should count once use trackOnce()/trackFirst() with a stable key, so rerenders,
//   reconnects and retries do not count twice.
// Custom events only show up on Vercel plans that include them; on others they are dropped.
// What each event means and when it is sent: docs/ANALYTICS.md.
import { track as vercelTrack } from '@vercel/analytics';

export type AnalyticsEvent =
  | 'Live Table Opened'
  | 'Seat Requested'
  | 'Seat Assigned'
  | 'Bot Seat Replacement Completed'
  | 'First Live Hand Dealt'
  | 'First Live Hand Completed'
  | 'Daily Chips Claimed'
  | 'Sign In Started'
  | 'Sign In Completed'
  | 'Guest Progress Imported'
  | 'Guest Progress Import Failed'
  | 'Live Table Left Before First Hand'
  | 'Practice Hand Completed'
  | 'Lesson Completed'
  | 'Lesson Practice Started'
  | 'Puzzle Completed'
  | 'Review Opened'
  | 'Continue Card Used'
  | 'Returned';

type Props = Record<string, string | number | boolean | null>;

export function track(event: AnalyticsEvent, props?: Props) {
  try {
    vercelTrack(event, props);
  } catch {
    /* analytics must never break the app */
  }
}

const sent = new Set<string>();

/** Send at most once per page load for this key. */
export function trackOnce(key: string, event: AnalyticsEvent, props?: Props) {
  if (sent.has(key)) return;
  sent.add(key);
  track(event, props);
}

/** Send once per browser, for first-ever milestones (remembered in this browser only). */
export function trackFirst(event: AnalyticsEvent, props?: Props) {
  const key = `felt-school:tracked:${event}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch {
    if (sent.has(key)) return;
    sent.add(key);
  }
  track(event, props);
}

/** A wait as a coarse label, so waits can be counted without sending exact times. */
export function waitBucket(ms: number): string {
  const s = ms / 1000;
  return s < 10 ? 'under 10s' : s < 30 ? '10-30s' : s < 60 ? '30-60s' : s < 300 ? '1-5 min' : 'over 5 min';
}

// ---- coming back ----
// This browser remembers the local day of its first visit and the last day a return was counted.
// On a later day, one 'Returned' event is sent with only a rough number of days since the first
// visit. No id, date, name or anything else goes with it, so returns can be counted but not linked
// to a person, a browser or each other: it is not a retention rate (see docs/ANALYTICS.md).

const FIRST_VISIT_KEY = 'felt-school:first-visit';
const RETURNED_KEY = 'felt-school:returned-on';

/** A day in the visitor's own calendar, e.g. "2026-10-31". */
export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole calendar days from one local day to another. */
export function daysBetween(from: string, to: string): number {
  const at = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(to) - at(from)) / 864e5);
}

/** Days since the first visit, as the only detail sent with a return. */
export function returnBucket(days: number): string {
  return days <= 1 ? '1 day' : days <= 7 ? '2-7 days' : days <= 30 ? '8-30 days' : '31+ days';
}

type DayStore = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Count a visit: the first one is only remembered; on any later calendar day, the first visit that
 * day sends 'Returned'. Nothing is sent when this browser keeps no storage (private windows).
 */
export function noteVisit(today = localDay(), store: DayStore | null = typeof localStorage === 'undefined' ? null : localStorage, send = track) {
  try {
    if (!store) return;
    const first = store.getItem(FIRST_VISIT_KEY);
    if (!first || !/^\d{4}-\d{2}-\d{2}$/.test(first)) {
      store.setItem(FIRST_VISIT_KEY, today);
      return;
    }
    const days = daysBetween(first, today);
    if (days < 1 || store.getItem(RETURNED_KEY) === today) return;
    store.setItem(RETURNED_KEY, today);
    send('Returned', { days: returnBucket(days) });
  } catch {
    /* storage blocked: nothing to compare with, so nothing is sent */
  }
}
