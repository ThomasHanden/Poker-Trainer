// Renders scripts/og/og-image.html to public/og-image.png with Playwright's Chromium.
// Uses PW_CHROMIUM (path to a Chrome/Chromium) when set, like the e2e tests.
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(new URL('./og-image.html', import.meta.url).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: fileURLToPath(new URL('../../public/og-image.png', import.meta.url)) });
await browser.close();
console.log('wrote public/og-image.png');
