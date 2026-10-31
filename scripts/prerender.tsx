// Runs after `vite build`: writes an HTML file for every public page, with its own title,
// description, canonical address, link-preview tags and the page's content in the HTML, so search
// engines and link previews (iMessage, Discord, Reddit…) see it without running JavaScript.
// Also writes app.html (the shell for table rooms and saved hands), 404.html, sitemap.xml and robots.txt.
//
// Production address: SITE_URL, or on Vercel the project's production domain. Builds that are not
// production (Vercel previews, local builds) are marked noindex everywhere, so they never compete
// with the real site in search results.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DIST = 'dist';

// Pages render as a first-time visitor sees them: no saved progress.
const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, String(v)),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
    key: (i: number) => [...memory.keys()][i] ?? null,
    get length() {
      return memory.size;
    },
  },
});

const { renderToString } = await import('react-dom/server');
// MemoryRouter, not react-router-dom/server: that entry loads a second copy of the router here
const { MemoryRouter } = await import('react-router-dom');
const { StoreProvider } = await import('../src/ui/store');
const { Shell } = await import('../src/ui/App');
const { SITE_NAME, OG_IMAGE, NOT_FOUND, indexablePaths, pageMeta } = await import('../src/seo');
const { SECTIONS } = await import('../src/content/lessons');
type PageMeta = NonNullable<ReturnType<typeof pageMeta>>;

const production = process.env.VERCEL_ENV ? process.env.VERCEL_ENV === 'production' : process.env.SITE_ENV === 'production';
const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const site = (process.env.SITE_URL || (vercelDomain ? `https://${vercelDomain}` : '')).replace(/\/+$/, '');
if (!site && (production || process.env.VERCEL)) throw new Error('Set SITE_URL to the production address (e.g. https://example.com) for canonical links.');
const SITE = site || 'http://localhost:4173';
if (!/^https?:\/\/[^/]+$/.test(SITE)) throw new Error(`SITE_URL should be just the address, like https://example.com (got ${SITE})`);
if (production && !/^https:\/\//.test(SITE)) throw new Error(`Refusing to build production pages pointing at ${SITE}`);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const abs = (path: string) => `${SITE}${path === '/' ? '/' : path}`;
const jsonLd = (data: object) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

/** Structured data, only where it describes what is on the page: a lesson and its breadcrumb trail. */
function structured(meta: PageMeta, path: string): string {
  const l = meta.lesson;
  if (!l) return '';
  const section = SECTIONS.find((s) => s.id === l.section)!;
  return [
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'LearningResource',
      name: l.title,
      description: l.summary,
      url: abs(path),
      learningResourceType: 'Lesson',
      educationalLevel: l.level,
      inLanguage: 'en',
      isAccessibleForFree: true,
      about: section.title,
      publisher: { '@type': 'Organization', name: SITE_NAME, url: abs('/') },
    }),
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Library', item: abs('/learn') },
        { '@type': 'ListItem', position: 2, name: l.title, item: abs(path) },
      ],
    }),
  ].join('\n    ');
}

function head(meta: PageMeta, path: string | null): string {
  const noindex = meta.noindex || !production;
  const image = abs(OG_IMAGE.path);
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    noindex ? '<meta name="robots" content="noindex" />' : '',
    path && !meta.noindex ? `<link rel="canonical" href="${esc(abs(path))}" />` : '',
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:type" content="${meta.lesson ? 'article' : 'website'}" />`,
    `<meta property="og:title" content="${esc(meta.heading)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    path ? `<meta property="og:url" content="${esc(abs(path))}" />` : '',
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="${OG_IMAGE.width}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE.height}" />`,
    `<meta property="og:image:alt" content="${esc(OG_IMAGE.alt)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(meta.heading)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    path ? structured(meta, path) : '',
  ];
  return tags.filter(Boolean).join('\n    ');
}

const template = readFileSync(join(DIST, 'index.html'), 'utf8');
if (!template.includes('<div id="root"></div>') || !/<title>.*<\/title>/.test(template)) throw new Error('dist/index.html is not a fresh Vite build: run vite build first (npm run build does both)');

function page(meta: PageMeta, path: string | null, body: string): string {
  return template
    .replace(/<title>.*<\/title>/, '')
    .replace(/\s*<meta name="description"[^>]*>/, '')
    .replace('</head>', `    ${head(meta, path)}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}

function render(path: string): string {
  return renderToString(
    <MemoryRouter initialEntries={[path]}>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </MemoryRouter>,
  );
}

function write(file: string, html: string) {
  const out = join(DIST, file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
}

// The shell for addresses that are not built ahead (table rooms, saved hands): no content, never indexed.
write('app.html', page({ ...NOT_FOUND, title: SITE_NAME, heading: SITE_NAME, description: pageMeta('/')!.description, noindex: true }, null, ''));

const paths = [...indexablePaths(), '/review', '/progress'];
for (const path of paths) {
  const meta = pageMeta(path)!;
  write(path === '/' ? 'index.html' : `${path.slice(1)}.html`, page(meta, path, render(path)));
}
write('404.html', page(NOT_FOUND, null, render('/404')));

const listed = indexablePaths();
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${listed.map((p) => `  <url><loc>${esc(abs(p))}</loc></url>`).join('\n')}\n</urlset>\n`,
);
write(
  'robots.txt',
  production
    ? `User-agent: *\n# table rooms are live games: nothing to index, and crawlers would join the table\nDisallow: /play/\n\nSitemap: ${abs('/sitemap.xml')}\n`
    : 'User-agent: *\nDisallow: /\n',
);

console.log(`prerendered ${paths.length} pages for ${SITE}${production ? '' : ' (not production: noindex)'}; sitemap lists ${listed.length}`);
