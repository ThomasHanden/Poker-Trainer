import { describe, it, expect } from 'vitest';
import { LESSONS } from '../src/content/lessons';
import { NOT_FOUND, indexablePaths, pageMeta } from '../src/seo';

describe('page metadata', () => {
  it('every published lesson has its own address, title and description, and is in the sitemap', () => {
    const listed = new Set(indexablePaths());
    for (const l of LESSONS) {
      const m = pageMeta(`/learn/${l.id}`)!;
      expect(m, l.id).not.toBeNull();
      expect(m.title).toBe(`${l.title} · Felt School`);
      expect(m.description).toBe(l.summary);
      expect(m.noindex).toBeFalsy();
      expect(listed.has(`/learn/${l.id}`)).toBe(true);
      expect(l.id).toMatch(/^[a-z0-9-]+$/); // safe as a path and a file name
    }
  });

  it('personal pages and table rooms are kept out of search', () => {
    for (const p of ['/review', '/progress', '/review/abc123', '/play/public-1', '/play/k7m2qp']) {
      expect(pageMeta(p)!.noindex, p).toBe(true);
      expect(indexablePaths()).not.toContain(p);
    }
    expect(NOT_FOUND.noindex).toBe(true);
  });

  it('unknown pages and lessons are not found', () => {
    expect(pageMeta('/learn/no-such-lesson')).toBeNull();
    expect(pageMeta('/nowhere')).toBeNull();
    expect(pageMeta('/learn/')).not.toBeNull(); // trailing slash is the library
  });

  it('the sitemap has no duplicates and only real pages', () => {
    const paths = indexablePaths();
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of paths) expect(pageMeta(p), p).not.toBeNull();
  });
});
