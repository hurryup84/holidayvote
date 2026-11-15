import { test } from '@playwright/test';
import { completeOnboarding, seedDemoVacation, shoot } from './screenshotFlow';

/** Visual check with demo data: SCREENSHOTS=1 npx playwright test screenshots */
test.skip(!process.env.SCREENSHOTS, 'only on demand');

for (const scheme of ['light', 'dark'] as const) {
  for (const locale of ['de-DE', 'en-US']) {
    test(`screens ${scheme} ${locale}`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme, locale, viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      const out = process.env.SCREENSHOTS!;

      await page.goto('/');
      await completeOnboarding(page);
      // Take screenshot of the vacation list (empty until we seed)
      await shoot(page, out, scheme, locale, '0-vacations');

      // Navigate to settings for debug screenshot
      await page.locator('ion-tab-button[tab="settings"]').click();
      await page.locator('ion-item', { hasText: 'Debug' }).click();
      await page.waitForTimeout(800);
      await shoot(page, out, scheme, locale, '0-debug');

      // Seed demo vacation (only on this Debug page), then navigate through key UI scenes
      await seedDemoVacation(page);
      await page.goto('/vacations');
      await page.waitForTimeout(800);
      await shoot(page, out, scheme, locale, '1-vacations');
      await page.locator('.vacation-card').first().click();
      await page.waitForTimeout(2000);
      await shoot(page, out, scheme, locale, '2-houses');
      // Map tab
      await page.locator('ion-segment-button').filter({ hasText: /Karte|Map/ }).click();
      await page.waitForTimeout(1200);
      await shoot(page, out, scheme, locale, '3-map');
      // People tab
      await page.locator('ion-segment-button').filter({ hasText: /Personen|People/ }).click();
      await page.waitForTimeout(800);
      await shoot(page, out, scheme, locale, '4-people');
      // Houses tab + detail
      await page.locator('ion-segment-button').filter({ hasText: /Häuser|Houses/ }).click();
      await page.locator('.property-card').first().click();
      await page.waitForTimeout(800);
      await shoot(page, out, scheme, locale, '5-detail');
      // Back from detail
      await page.locator('ion-back-button').last().click();
      await page.waitForTimeout(600);
      await page.goto('/settings');
      await page.waitForTimeout(600);
      await shoot(page, out, scheme, locale, '6-settings');
      await ctx.close();
    });
  }
}
