import { test, type Page } from '@playwright/test';
import { completeOnboarding, seedDemoVacation, shoot } from './screenshotFlow';

/**
 * App Store / Play screenshots with the demo data and real holiday home photos (assets/demo-photos/).
 *   STORE_SCREENSHOTS=1 npx playwright test store-screenshots --workers=2
 * → ios/fastlane/screenshots/<locale>/ (iPhone 6.9", light & dark) for `fastlane ios upload_screenshots`
 * → android/fastlane/metadata/android/<locale>/images/phoneScreenshots/ (1080 × 1920) for Google Play
 *
 * Writes directly into ios/fastlane/screenshots/<locale>/ using the committed naming convention
 * (<scheme>-<locale>-<scene>.png, 6 key scenes × 2 themes = 12 per locale), so they are committed for fastlane.
 */
test.skip(!process.env.STORE_SCREENSHOTS, 'only on demand: npm run screenshots:store');
test.setTimeout(120_000);

const DEVICE = {
  // iPhone 6.9" (1320 × 2868 @ 3x): 440 × 956 CSS px
  viewport: { width: 440, height: 956 },
  scale: 3,
};

async function goToHouses(page: Page) {
  await page.locator('.vacation-card').first().click();
  await page.waitForTimeout(2000);
}

async function goToMap(page: Page) {
  await page.locator('ion-segment-button').filter({ hasText: /Karte|Map/ }).click();
  await page.waitForTimeout(1200);
}

async function goToPeople(page: Page) {
  await page.locator('ion-segment-button').filter({ hasText: /Personen|People/ }).click();
  await page.waitForTimeout(800);
}

async function goToDetail(page: Page) {
  await page.locator('ion-segment-button').filter({ hasText: /Häuser|Houses/ }).click();
  await page.locator('.property-card').first().click();
  await page.waitForTimeout(800);
}

async function goToSettings(page: Page) {
  await page.locator('ion-back-button').last().click();
  await page.waitForTimeout(600);
  await page.goto('/settings');
  await page.waitForTimeout(600);
}

for (const scheme of ['light', 'dark'] as const) {
  for (const locale of ['de-DE', 'en-US'] as const) {
    test(`store ${scheme} ${locale}`, async ({ browser }) => {
      const ctx = await browser.newContext({
        colorScheme: scheme,
        locale,
        viewport: DEVICE.viewport,
        deviceScaleFactor: DEVICE.scale,
      });
      const page = await ctx.newPage();

      const dir = `ios/fastlane/screenshots/${locale}`;
      await page.goto('/');
      await completeOnboarding(page);
      await seedDemoVacation(page);
      await page.goto('/vacations');
      await page.waitForTimeout(800);

      // Vacations list
      await shoot(page, dir, scheme, locale, '0-vacations');
      // Houses: open first vacation
      await goToHouses(page);
      await shoot(page, dir, scheme, locale, '2-houses');
      // Map
      await goToMap(page);
      await shoot(page, dir, scheme, locale, '3-map');
      // People
      await goToPeople(page);
      await shoot(page, dir, scheme, locale, '4-people');
      // Detail: back to houses then open first property
      await goToDetail(page);
      await shoot(page, dir, scheme, locale, '5-detail');
      // Settings: back from detail then open settings
      await goToSettings(page);
      await shoot(page, dir, scheme, locale, '6-settings');

      await ctx.close();
    });
  }
}
