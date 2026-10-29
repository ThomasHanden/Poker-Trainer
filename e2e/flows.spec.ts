import { test, expect, Page } from '@playwright/test';

async function playToEnd(page: Page) {
  for (let i = 0; i < 20; i++) {
    if (await page.locator('[data-testid=review]').count()) return;
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
  await page.goto('/#/practice');
  await page.getByTestId('new-scenario').click();
  await expect(page.locator('.action-bar, [data-testid=review]').first()).toBeVisible({ timeout: 30_000 });

  // 2-3. make legal decisions until the hand ends, then read the review
  await playToEnd(page);
  await page.locator('.dcard-toggle').first().click();
  await expect(page.getByText('1. What information was available?').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Opponent types' }).first().click();
  await expect(page.getByText('7. What opponent tendencies could change the recommendation?').first()).toBeVisible();
  await expect(page.locator('.score-box')).toContainText(/instructional score|Insufficient confidence/);

  // 4. open a linked lesson
  await page.locator('.lesson-links a').first().click();
  await expect(page.locator('article.lesson h1')).toBeVisible();
  await expect(page.getByText('Knowledge check')).toBeVisible();

  // 5. practise the related concept
  await page.getByTestId('practice-related').click();
  await expect(page.locator('.pchip.target')).toContainText('Target:');
  await expect(page.locator('.action-bar, [data-testid=review]').first()).toBeVisible({ timeout: 30_000 });

  // 6. save and reopen a custom range
  await page.goto('/#/ranges?tab=editor');
  await page.locator('[data-hand="AA"]').click();
  await page.locator('[data-hand="AKs"]').click();
  await page.locator('[data-hand="KK"]').click();
  await expect(page.getByTestId('range-stats')).toContainText('16.0 combos');
  await page.getByTestId('range-name').fill('E2E premiums');
  await page.getByTestId('save-range').click();

  // 7-8. reload and verify persistence of range and hand history
  await page.reload();
  await page.goto('/#/ranges?tab=editor');
  await page.getByTestId('saved-ranges').getByRole('button', { name: 'E2E premiums', exact: true }).click();
  await expect(page.getByTestId('range-stats')).toContainText('16.0 combos');
  await page.goto('/#/review');
  await expect(page.locator('.review-list li').first()).toBeVisible();
  expect(await page.locator('.review-list li').count()).toBeGreaterThanOrEqual(1);
  await page.locator('.review-row').first().click();
  await expect(page.locator('[data-testid=review]')).toBeVisible({ timeout: 60_000 });
  await page.goto('/#/progress');
  await expect(page.locator('.tile').first()).toContainText(/\d/);
  expect(errors).toEqual([]);
});

test('illegal amounts are rejected in the sizing UI', async ({ page }) => {
  await page.goto('/#/practice?template=fl-defend-cbet');
  await expect(page.locator('.action-bar')).toBeVisible({ timeout: 30_000 });
  await page.locator('.btn.act.raise').click();
  await page.locator('#bet-amount').fill('0.5');
  await expect(page.locator('#sizing-help .error')).toBeVisible();
  await expect(page.locator('.amount-row .btn.primary')).toBeDisabled();
  await page.locator('.chip.allin').click();
  await expect(page.locator('.amount-row .btn.primary')).toBeEnabled();
});

test('unsupported settings are explained, not generated', async ({ page }) => {
  await page.goto('/#/practice');
  await page.locator('label:has-text("Game format") select').selectOption('tournament');
  await page.locator('details.more > summary').click();
  await page.locator('label:has-text("Starting street") select').selectOption('river');
  await expect(page.locator('.match.bad')).toContainText('Unsupported combination');
  await page.getByTestId('new-scenario').click();
  await expect(page.locator('.error-box')).toContainText('not supported');
});

test('main pages have no horizontal overflow', async ({ page }) => {
  for (const path of ['/#/', '/#/practice', '/#/learn', '/#/learn/pot-odds', '/#/ranges', '/#/review', '/#/progress', '/#/coverage', '/#/method']) {
    await page.goto(path);
    await page.waitForTimeout(300);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw, path).toBeLessThanOrEqual(cw + 1);
  }
});
