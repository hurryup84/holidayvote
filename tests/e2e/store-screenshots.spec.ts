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
 * Android screenshots are written to android/fastlane/metadata/android/<locale>/images/phoneScreenshots/
 * at 1080 × 1920 (Google Play phone screenshot size).
 */
test.skip(!process.env.STORE_SCREENSHOTS, 'only on demand: npm run screenshots:store');
test.setTimeout(120_000);

const DEVICE = {
  // iPhone 6.9" (1320 × 2868 @ 3x): 440 × 956 CSS px
  viewport: { width: 440, height: 956 },
  scale: 3,
};

// Google Play phone screenshot size: 1080 × 1920 (9:16)
const ANDROID_DEVICE = {
  viewport: { width: 360, height: 640 },
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
      const iosCtx = await browser.newContext({
        colorScheme: scheme,
        locale,
        viewport: DEVICE.viewport,
        deviceScaleFactor: DEVICE.scale,
      });
      const androidCtx = await browser.newContext({
        colorScheme: scheme,
        locale,
        viewport: ANDROID_DEVICE.viewport,
        deviceScaleFactor: ANDROID_DEVICE.scale,
      });
      const iosPage = await iosCtx.newPage();
      const androidPage = await androidCtx.newPage();

      const iosDir = `ios/fastlane/screenshots/${locale}`;
      const androidDir = `android/fastlane/metadata/android/${locale}/images/phoneScreenshots`;

      // iOS screenshots (440 × 956 CSS px @ 3x → 1320 × 2868)
      await shootStore(iosPage, iosDir, scheme, locale);
      await iosCtx.close();

      // Android screenshots (360 × 640 CSS px @ 3x → 1080 × 1920)
      await shootStore(androidPage, androidDir, scheme, locale);
      await androidCtx.close();
    });
  }
}

async function shootStore(page: Page, out: string, scheme: string, locale: string) {
  await page.goto('/');
  await completeOnboarding(page);
  await seedDemoVacation(page);
  await page.goto('/vacations');
  await page.waitForTimeout(800);

  // Vacations list
  await shoot(page, out, scheme, locale, '0-vacations');
  // Houses: open first vacation
  await goToHouses(page);
  await shoot(page, out, scheme, locale, '2-houses');
  // Map
  await goToMap(page);
  await shoot(page, out, scheme, locale, '3-map');
  // People
  await goToPeople(page);
  await shoot(page, out, scheme, locale, '4-people');
  // Detail: back to houses then open first property
  await goToDetail(page);
  await shoot(page, out, scheme, locale, '5-detail');
  // Settings: back from detail then open settings
  await goToSettings(page);
  await shoot(page, out, scheme, locale, '6-settings');
}
