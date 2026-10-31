// Page titles, descriptions and indexing rules. Shared by the build (scripts/prerender.tsx writes
// them into each page's HTML for search engines and link previews) and the app (document.title).
// Descriptions reuse each page's own introduction, so they say only what the page shows.

import { LESSONS, LESSON_INDEX, SECTIONS, type Lesson } from './content/lessons';
import { tableLabel } from './multiplayer/table';

export const SITE_NAME = 'Felt School';
export const DEFAULT_DESCRIPTION =
  "Felt School: a No-Limit Hold'em decision trainer with practice scenarios, honest reviews, a theory library and a range explorer.";
/** The link-preview image, in public/ (1200 × 630). */
export const OG_IMAGE = { path: '/og-image.png', width: 1200, height: 630, alt: 'Felt School: No-Limit Hold’em decision trainer' };

export interface PageMeta {
  /** for the browser tab and search results */
  title: string;
  /** for link previews: the page's own name, without the site name */
  heading: string;
  description: string;
  /** keep out of search results: personal pages and table rooms */
  noindex?: boolean;
  lesson?: Lesson;
}

const page = (heading: string, description: string, noindex = false): PageMeta => ({ title: `${heading} · ${SITE_NAME}`, heading, description, noindex });

const STATIC: Record<string, PageMeta> = {
  '/': { title: `${SITE_NAME} · Poker Decision Trainer`, heading: `${SITE_NAME}: make the right play, and know why`, description: DEFAULT_DESCRIPTION },
  '/practice': page(
    'Practice poker decisions',
    'Sit down at a table and play. The action plays out until it reaches you, you make the call, and then you see the best play and why.',
  ),
  '/learn': page(
    'Learn poker theory',
    `Short lessons on one idea each, with worked examples, practice problems and a quiz: ${LESSONS.length} lessons in ${SECTIONS.length} sections. Start with a study track or pick any topic.`,
  ),
  '/ranges': page('Poker ranges', 'Preflop charts for each seat and situation, plus tools to build your own ranges, compare them, drill them and check equities.'),
  '/play': page('Play live', 'Free play-money No-Limit Hold’em against real people, with bots filling empty seats at public tables.'),
  '/review': page('Review', 'Every hand you finish is saved here. Open one to replay it and read the review again.', true),
  '/progress': page('Progress', 'How your decisions are scoring, where you are strong, and what to work on next.', true),
};

/** Pages listed in the sitemap: the main sections and every published lesson. */
export function indexablePaths(): string[] {
  return [...Object.keys(STATIC).filter((p) => !STATIC[p].noindex), ...LESSONS.map((l) => `/learn/${l.id}`)];
}

/** Metadata for a path, or null when there is no such page. */
export function pageMeta(path: string): PageMeta | null {
  const p = path.replace(/\/+$/, '') || '/';
  const lesson = p.match(/^\/learn\/([^/]+)$/);
  if (lesson) {
    const l = LESSON_INDEX[decodeURIComponent(lesson[1])];
    return l ? { title: `${l.title} · ${SITE_NAME}`, heading: l.title, description: l.summary, lesson: l } : null;
  }
  // tables are live games, not pages to find in search
  const room = p.match(/^\/play\/([^/]+)$/);
  if (room) return page(tableLabel(decodeURIComponent(room[1])), STATIC['/play'].description, true);
  if (/^\/review\/[^/]+$/.test(p)) return page('Hand review', STATIC['/review'].description, true);
  return STATIC[p] ?? null;
}

export const NOT_FOUND: PageMeta = page('Page not found', 'There is no page at this address.', true);
