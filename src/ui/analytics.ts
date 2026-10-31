// Custom analytics events (Vercel Web Analytics). Every event goes through track() here, so:
// - never send email addresses, cards, hand details, tokens or anything else private;
// - keep to at most two properties per event, each a short label;
// - events that should count once use trackOnce()/trackFirst() with a stable key, so rerenders,
//   reconnects and retries do not count twice.
// Custom events only show up on Vercel plans that include them; on others they are dropped.
import { track as vercelTrack } from '@vercel/analytics';

export type AnalyticsEvent =
  | 'Live Table Opened'
  | 'Seat Requested'
  | 'Seat Assigned'
  | 'Bot Seat Replacement Completed'
  | 'First Live Hand Dealt'
  | 'First Live Hand Completed';

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
