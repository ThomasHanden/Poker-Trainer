# Page addresses, search and link previews

## How pages are served

- The app uses real paths (`/learn/pot-odds`), not hash routes. Old links such as
  `/#/learn/pot-odds` or `/#/play/k7m2qp` are moved to the real path when the page loads
  (`src/main.tsx`), so bookmarks and invite links keep working.
- `npm run build` runs `vite build`, then `scripts/prerender.tsx`, which renders every public page
  with React into its own HTML file: `index.html`, `learn.html`, `learn/<lesson>.html`,
  `practice.html` and so on. Each has its own title, description, canonical address, Open Graph and
  Twitter card tags, and the page's content, so search engines and link previews see the real
  page without running JavaScript. In the browser, React then takes over as usual.
- `vercel.json` maps each address to its file. Table rooms (`/play/<code>`) and saved hands
  (`/review/<id>`) use `app.html`, an empty shell marked noindex. Any other address gets
  `404.html` with a real 404 status.
- `src/seo.ts` holds every page's title and description (lessons use their own title and summary),
  and the list of pages for `sitemap.xml`. The app uses it for the tab title too.

## Search engines

- `sitemap.xml` lists the main sections and every published lesson, from `LESSONS`.
- `robots.txt` allows everything except table rooms, which are live games that crawlers would join.
- Review, Progress, saved hands and table rooms carry `noindex`: they hold nothing but your own
  browser-saved data, or a live game.
- Lessons carry `LearningResource` and breadcrumb structured data, which describe what is on the page.
- **Previews and local builds are never indexed:** unless the build is Vercel production
  (`VERCEL_ENV=production`, or `SITE_ENV=production` elsewhere), every page gets `noindex` and
  `robots.txt` disallows everything. Canonical links always point at the production address.

### The production address

Canonical links, the sitemap and preview images need the site's public address. The build uses
`SITE_URL` if set, otherwise Vercel's `VERCEL_PROJECT_PRODUCTION_URL`, which is the project's
production domain. A build on Vercel without either, or a production build with a non-https
address, fails rather than publishing wrong links.

## Link previews

`public/og-image.png` (1200 × 630) is the preview image for every page; titles and descriptions
are per page. Its source is `scripts/og/og-image.html`; after editing it run `npm run gen:og`
(set `PW_CHROMIUM` to a Chrome path if Playwright's own browser is not installed).

## Checking a deployment

Replace the address with your preview or production URL:

```bash
SITE=https://pokertrainer-milton-c96e.vercel.app
curl -s $SITE/learn/pot-odds | grep -E '<title>|og:image|canonical|<h1>'   # real page, not an empty shell
curl -sI $SITE/og-image.png | head -3                                   # 200, image/png
curl -s -o /dev/null -w '%{http_code}\n' $SITE/learn/no-such-lesson     # 404
curl -s $SITE/robots.txt                                                # production: allows; previews: Disallow: /
```

Preview tools: paste a lesson link into https://www.opengraph.xyz, or into iMessage/Discord.
Discord and others cache previews, so a link shared before a change may keep its old preview for a while.
