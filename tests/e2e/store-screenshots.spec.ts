import { expect, test, type Page } from '@playwright/test';

/**
 * App Store / Play screenshots with the demo data and real holiday home photos (assets/demo-photos/).
 *   npm run screenshots:store
 * → ios/fastlane/screenshots/<locale>/ (iPhone 6.9", iPhone Duo, iPad 13") for `fastlane ios upload_screenshots`
 * → android/fastlane/metadata/android/<locale>/images/phoneScreenshots/ (1080 × 1920) for Google Play
 */
test.skip(!process.env.STORE_SCREENSHOTS, 'only on demand: npm run screenshots:store');
test.setTimeout(120_000);

const TEXT = {
  'de-DE': { debug: 'Debug', detail: 'Reetdachhaus' },
  'en-US': { debug: 'Debug', detail: 'Thatched cottage' },
} as const;

// Only iPhone devices - reduced from 4 to 2 for faster execution
const DEVICES = [
  // iPhone 6.9" (1320 × 2868)
  { dir: (l: string) => `ios/fastlane/screenshots/${l}`, prefix: 'iphone69', viewport: { width: 440, height: 956 }, scale: 3 },
  // iPhone Duo unfolded (2007 × 2853) – wide layout: houses | map side by side
  { dir: (l: string) => `ios/fastlane/screenshots/${l}`, prefix: 'iphoneduo', viewport: { width: 669, height: 951 }, scale: 3 },
];

async function settle(page: Page, ms = 700) {
  await expect(page.locator('ion-action-sheet:not(.overlay-hidden), ion-toast')).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(ms);
}

for (const locale of ['de-DE', 'en-US'] as const) {
  for (const device of DEVICES) {
    test(`store ${device.prefix} ${locale}`, async ({ browser }) => {
      const tx = TEXT[locale];
      const ctx = await browser.newContext({ colorScheme: 'light', locale, viewport: device.viewport, deviceScaleFactor: device.scale });
      const page = await ctx.newPage();
      let n = 0;
      const shot = async (name: string) => {
        await settle(page);
        await page.screenshot({ path: `${device.dir(locale)}/${device.prefix}-${++n}-${name}.png` });
      };

      // Onboarding: 3 intro pages (collect, vote, decide)
      await page.goto('/');
      await page.getByRole('button', { name: /Plan a vacation|Urlaub planen/ }).click({ timeout: 30_000 });
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /Continue|Weiter/ }).click();
      // Fill name and click "Later" to skip immediate creation
      await page.getByLabel(/Dein Name|Your name/).fill('Anna');
      await page.getByRole('button', { name: /Create it later|Später anlegen/ }).click();
      await page.waitForTimeout(1200);

      // If no vacation card exists, create one via FAB
      const cardCount = await page.locator('.vacation-card').count();
      if (cardCount === 0) {
        await page.locator('ion-fab-button').click();
        await page.waitForTimeout(500);
        const modal = page.locator('ion-modal.show-modal').last();
        await modal.locator('ion-input input[type="url"]').fill('https://www.airbnb.de/rooms/123?utm_source=x');
        await modal.locator('ion-input', { hasText: 'Title' }).locator('input').fill('Thatched cottage');
        await modal.locator('ion-input', { hasText: 'Total price' }).locator('input').fill('2400');
        await modal.getByRole('button', { name: 'Save' }).click();
        await expect(page.locator('.property-card', { hasText: 'Thatched cottage' })).toBeVisible({ timeout: 30_000 });
      }

      // Key screenshots only: vacations, houses, map
      await shot('vacations');
      await page.locator('.vacation-card').first().click();
      await expect(page.locator('.property-card').first()).toBeVisible();
      await shot('houses');

      // Map tab
      await page.locator('ion-segment-button').filter({ hasText: /Karte|Map/ }).click();
      await page.waitForTimeout(1200);
      await shot('map');

      await ctx.close();
    });
  }
}