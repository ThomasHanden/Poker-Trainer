import { test, expect, Page } from '@playwright/test';

async function playToEnd(page: Page) {
  for (let i = 0; i < 20; i++) {
    if (await page.locator('[data-testid=review]').count()) return;
    const skip = page.getByTestId('skip-playback');
    if (await skip.count()) await skip.click().catch(() => {});
    const check = page.locator('.btn.act.check');
    const call = page.locator('.btn.act.call');
    const fold = page.locator('.btn.act.fold');
    if (await check.count()) await check.click();
    else if (await call.count()) await call.click();
    else if (await fold.count()) await fold.click();
    else await page.waitForTimeout(400);
  }
  await expect(page.locator('[data-testid=review]')).toBeVisible({ timeout: 60_000 });
}

test('core training flow: scenario → decisions → review → lesson → related practice → range save → reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // 1. start a scenario
  await page.goto('/practice');
  await page.getByTestId('new-scenario').click();
  await expect(page.locator('.action-bar, [data-testid=review]').first()).toBeVisible({ timeout: 30_000 });

  // 2-3. make legal decisions until the hand ends, then read the review
  await playToEnd(page);
  await page.getByTestId('open-replay').click();
  await expect(page.locator('.replay .felt')).toBeVisible();
  await page.getByRole('button', { name: 'Back to start' }).click();
  await expect(page.locator('.replay-caption')).toContainText('Blinds posted');
  await page.getByTestId('replay-next').click();
  await expect(page.locator('.replay-count')).toContainText(/^1\//);
  await page.locator('.dcard-toggle').first().click();
  await expect(page.getByText('1. What information was available?').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Opponent types' }).first().click();
  await expect(page.getByText('7. What opponent tendencies could change the recommendation?').first()).toBeVisible();
  await expect(page.locator('.score-box')).toContainText(/score out of 100|Insufficient confidence/);

  // 4. open a linked lesson
  await page.locator('.lesson-links a').first().click();
  await expect(page.locator('article.lesson h1')).toBeVisible();
  await expect(page.getByText('Knowledge check')).toBeVisible();

  // 5. practice the related concept
  await page.getByTestId('practice-related').click();
  await expect(page.locator('.pchip.target')).toContainText('Target:');
  await expect(page.locator('.action-bar, [data-testid=review]').first()).toBeVisible({ timeout: 30_000 });

  // 6. save and reopen a custom range
  await page.goto('/ranges?tab=editor');
  await page.locator('[data-hand="AA"]').click();
  await page.locator('[data-hand="AKs"]').click();
  await page.locator('[data-hand="KK"]').click();
  await expect(page.getByTestId('range-stats')).toContainText('16.0 combos');
  await page.getByTestId('range-name').fill('E2E premiums');
  await page.getByTestId('save-range').click();

  // 7-8. reload and verify persistence of range and hand history
  await page.reload();
  await page.goto('/ranges?tab=editor');
  await page.getByTestId('saved-ranges').getByRole('button', { name: 'E2E premiums', exact: true }).click();
  await expect(page.getByTestId('range-stats')).toContainText('16.0 combos');
  await page.goto('/review');
  await expect(page.locator('.review-list li').first()).toBeVisible();
  expect(await page.locator('.review-list li').count()).toBeGreaterThanOrEqual(1);
  await page.locator('.review-row').first().click();
  await expect(page.locator('[data-testid=review]')).toBeVisible({ timeout: 60_000 });
  await page.goto('/progress');
  await expect(page.locator('.tile').first()).toContainText(/\d/);
  expect(errors).toEqual([]);
});

test('illegal amounts are rejected in the sizing UI', async ({ page }) => {
  await page.goto('/practice?template=fl-defend-cbet');
  await expect(page.locator('.action-bar')).toBeVisible({ timeout: 30_000 });
  await page.locator('.btn.act.raise').click();
  await page.locator('#bet-amount').fill('0.5');
  await expect(page.locator('#sizing-help .error')).toBeVisible();
  await expect(page.locator('.sizing-confirm')).toBeDisabled();
  await page.locator('.size-preset.allin').click();
  await expect(page.locator('.sizing-confirm')).toBeEnabled();
});

test('unsupported settings are explained, not generated', async ({ page }) => {
  await page.goto('/practice');
  await page.locator('label:has-text("Game format") .select-btn').click();
  await page.getByRole('option', { name: 'Tournament', exact: true }).click();
  await page.locator('details.more > summary').click();
  await page.locator('label:has-text("Starting street") .select-btn').click();
  await page.getByRole('option', { name: 'River', exact: true }).click();
  await expect(page.locator('.match.bad')).toContainText('Unsupported combination');
  await page.getByTestId('new-scenario').click();
  await expect(page.locator('.error-box')).toContainText('not supported');
});

test('main pages have no horizontal overflow', async ({ page }) => {
  for (const path of ['/', '/practice', '/learn', '/learn/pot-odds', '/ranges', '/ranges?tab=editor', '/ranges?tab=compare', '/ranges?tab=drills', '/ranges?tab=equity', '/review', '/progress']) {
    await page.goto(path);
    await page.waitForTimeout(300);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw, path).toBeLessThanOrEqual(cw + 1);
  }
});

test('full hands mode deals a complete hand from preflop', async ({ page }) => {
  await page.goto('/practice');
  await page.getByTestId('mode-full').click();
  await expect(page.getByTestId('mode-full')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('new-scenario').click();
  // the action plays out on the table before the first decision
  await expect(page.getByTestId('playback')).toBeVisible();
  await expect(page.locator('.action-bar')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.ph-title')).toContainText('Full hand');
  await expect(page.getByTestId('mode-full')).toHaveAttribute('aria-checked', 'true');
  // the board is empty at the first decision
  expect(await page.locator('.board .pcard:not(.empty)').count()).toBe(0);
});

test('daily puzzles can be completed and show in your stats', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('pz-start').click();
  for (let k = 0; k < 5; k++) {
    await page.getByTestId('pz-option').first().click();
    await page.getByTestId('pz-next').click();
  }
  await expect(page.getByTestId('pz-result')).toBeVisible();
  await expect(page.locator('.sb-table tbody tr')).toHaveCount(1);
  // a reload keeps the finished result instead of starting over
  await page.reload();
  await expect(page.getByTestId('pz-result')).toBeVisible();
  // survival ends after three mistakes and is ranked too
  await page.getByTestId('mode-survival').click();
  await page.getByTestId('pz-start').click();
  for (let k = 0; k < 40 && !(await page.getByTestId('pz-result').isVisible()); k++) {
    const opts = page.getByTestId('pz-option');
    const n = await opts.count();
    // pick the last option: often wrong, so the run ends quickly
    await opts.nth(n - 1).click();
    await page.getByTestId('pz-next').click();
  }
  await expect(page.getByTestId('pz-result')).toBeVisible();
  await expect(page.locator('.sb-table tbody tr')).toHaveCount(2);
  await page.locator('.home-actions').getByRole('link', { name: 'Practice', exact: true }).click();
  await expect(page).toHaveURL(/\/practice$/);
});

test('old #/ links open the same page at its real address', async ({ page }) => {
  await page.goto('/#/learn/pot-odds');
  await expect(page).toHaveURL(/\/learn\/pot-odds$/);
  await expect(page.locator('h1')).toHaveText('Pot odds');
  await page.goto('/#/practice?template=fl-defend-cbet');
  await expect(page).toHaveURL(/\/practice\?template=fl-defend-cbet$/);
});

test('direct visits and reloads work on nested pages, and titles follow navigation', async ({ page }) => {
  await page.goto('/learn/pot-odds');
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Pot odds');
  await expect(page).toHaveTitle('Pot odds · Felt School');
  await page.getByRole('link', { name: '← Library' }).click();
  await expect(page).toHaveTitle('Learn poker theory · Felt School');
  await page.goto('/learn/no-such-lesson');
  await expect(page.locator('h1')).toHaveText('Lesson not found');
});

test('public pages are complete in the first HTML response, with link-preview metadata', async ({ request }) => {
  const html = await (await request.get('/learn/pot-odds')).text();
  expect(html).toContain('<title>Pot odds · Felt School</title>');
  expect(html).toContain('<meta name="description" content="The price of a call');
  expect(html).toMatch(/<link rel="canonical" href="https?:\/\/[^"]+\/learn\/pot-odds"/);
  expect(html).toMatch(/<meta property="og:image" content="https?:\/\/[^"]+\/og-image\.png"/);
  expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
  expect(html).toContain('<h1>Pot odds</h1>'); // the lesson itself, not an empty app shell
  expect(html).toContain('"@type":"LearningResource"');
  const library = await (await request.get('/learn')).text();
  expect(library).toContain('href="/learn/pot-odds"'); // crawlable links to every lesson
  const img = await request.get('/og-image.png');
  expect(img.status()).toBe(200);
  expect(img.headers()['content-type']).toBe('image/png');
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/learn/pot-odds</loc>');
  expect(sitemap).not.toContain('/review');
});

/** Skip the replay of the action so far (if any) and wait for your decision. */
async function toDecision(page: Page) {
  for (let i = 0; i < 60; i++) {
    if (await page.locator('.action-bar').count()) break;
    const skip = page.getByTestId('skip-playback');
    if (await skip.count()) await skip.click().catch(() => {});
    else await page.waitForTimeout(250);
  }
  await expect(page.locator('.action-bar')).toBeVisible({ timeout: 30_000 });
}

test('first visit: choose where to start, or skip it for good', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('start-choice')).toBeVisible();
  await page.getByTestId('start-skip').click();
  await expect(page.getByTestId('start-choice')).toHaveCount(0);
  await expect(page.getByTestId('home-play-live')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('home-play-live')).toBeVisible();
  await expect(page.getByTestId('start-choice')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Start with the first lesson' })).toHaveAttribute('href', '/learn/rules-rankings');
  // Mini games jumps down to the puzzles
  await page.getByTestId('home-mini-games').click();
  await expect(page.getByTestId('pz-start')).toBeInViewport();
});

test('I know the rules: a hand with help, one decision, its review, and the next hand from the bottom', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /I know the rules/ }).click();
  await expect(page).toHaveURL(/\/practice\?start=1&mode=guided$/);
  await toDecision(page);
  await expect(page.getByRole('button', { name: 'Hint' })).toBeVisible();
  await page.waitForTimeout(500); // a decision that has just come up ignores taps for a moment
  await page.locator('.btn.act').first().click();
  await expect(page.locator('[data-testid=review]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.rdecisions .dcard')).toHaveCount(1); // a single spot reviews one decision
  await page.getByTestId('next-hand-bottom').click();
  await toDecision(page);
});

test('phones: at a decision your cards and the action buttons fit on the screen', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phones only');
  for (const size of [
    { width: 360, height: 640 },
    { width: 393, height: 727 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/practice?start=1');
    await toDecision(page);
    await page.waitForTimeout(1200); // the cards finish being dealt
    const cards = (await page.locator('.seat.hero .seat-cards').boundingBox())!;
    const dock = (await page.locator('.practice-controls').boundingBox())!;
    const buttons = (await page.locator('.action-buttons').boundingBox())!;
    expect(cards.y).toBeGreaterThanOrEqual(0);
    expect(cards.y + cards.height).toBeLessThanOrEqual(dock.y + 1); // nothing covers your cards
    expect(buttons.y + buttons.height).toBeLessThanOrEqual(size.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('progress says where it is kept', async ({ page }) => {
  await page.goto('/progress');
  await expect(page.locator('.data-tools')).toContainText('stored in this browser only');
  await expect(page.locator('.data-tools')).not.toContainText('no account');
});

// Test rows only: the database is never reached, every leaderboard request is answered here.
const FIXTURE_NAMES = ['Ann', 'Bob', 'Cat', 'Dan', 'Eve', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jo'];
function fixtureRows(fn: string, off: number, lim: number, entries: number) {
  // points fall by 50 a place, with places 2 and 3 tied
  return Array.from({ length: Math.max(0, Math.min(lim, entries - off)) }, (_, k) => {
    const i = off + k;
    const score = 3000 - 50 * (i >= 2 ? i - 1 : i);
    const rank = i === 2 ? 2 : i + 1;
    const name = `${FIXTURE_NAMES[i % 10]}${i >= 10 ? ` ${i}` : ''}`;
    const base = { rank, name, is_me: false, entries };
    if (fn === 'lb_chips') return { ...base, chips: score * 2, bank: score, at_tables: score };
    if (fn === 'lb_daily') return { ...base, points: Math.min(1500, score / 2), correct: 4, answered: 5 };
    return { ...base, points: score, correct: 20, answered: 23, completed_at: '2026-10-30T10:00:00Z' };
  });
}

test('leaderboards: beside the mini games and on the Play live page, with shared ranks, load more and a failed request', async ({ page }) => {
  let failDaily = true;
  await page.route('**/rest/v1/rpc/lb_*', async (route) => {
    const fn = route.request().url().split('/rpc/')[1].split('?')[0];
    const args = JSON.parse(route.request().postData() ?? '{}');
    if (fn === 'lb_daily' && failDaily) return route.fulfill({ status: 500, body: '{}' });
    if (fn === 'lb_daily_days') return route.fulfill({ json: [{ day: '2026-10-31', entries: 3 }] });
    if (fn === 'lb_standing') return route.fulfill({ json: null });
    return route.fulfill({ json: fixtureRows(fn, args.off ?? 0, args.lim ?? 25, fn === 'lb_chips' ? 30 : 8) });
  });
  // home: the board beside the mini games follows the game picked
  await page.goto('/');
  const side = page.locator('#leaderboard');
  await expect(side.getByRole('heading', { name: 'Daily five leaderboard' })).toBeVisible();
  await expect(side.getByRole('alert')).toContainText('could not be loaded');
  failDaily = false;
  await side.getByRole('button', { name: 'Try again' }).click();
  const sideRows = side.locator('.lb-list .lb-row');
  await expect(sideRows).toHaveCount(8);
  await expect(sideRows.nth(1).locator('.lb-rank')).toHaveText('2');
  await expect(sideRows.nth(2).locator('.lb-rank')).toHaveText('2');
  await expect(sideRows.nth(3).locator('.lb-rank')).toHaveText('4');
  await expect(side.getByText('4 of 5 right').first()).toBeVisible();
  await expect(side.getByText('Sign in to get on the leaderboards.')).toBeVisible();
  await page.getByTestId('mode-survival').click();
  await expect(side.getByRole('heading', { name: 'Survival leaderboard' })).toBeVisible();
  await expect(side.getByRole('button', { name: 'All time' })).toHaveAttribute('aria-pressed', 'true');
  await side.getByRole('button', { name: 'This week' }).click();
  await expect(sideRows).toHaveCount(8);
  let [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw + 1);
  await side.screenshot({ path: `test-results/leaderboard-home-${test.info().project.name}.png` });
  // Play live: the chip board, a page at a time
  await page.goto('/play');
  const chips = page.locator('#chip-leaderboard');
  const rows = chips.locator('.lb-list .lb-row');
  await expect(rows).toHaveCount(25);
  await expect(chips.locator('.lb-row.top1')).toHaveCount(1);
  await chips.getByRole('button', { name: 'Load 5 more' }).click();
  await expect(rows).toHaveCount(30);
  [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw + 1);
  await chips.screenshot({ path: `test-results/leaderboard-play-${test.info().project.name}.png` });
  // there is no separate leaderboards page or menu item
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Leaderboards' })).toHaveCount(0);
});
