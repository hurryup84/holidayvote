import { test } from '@playwright/test';

/** Visual check with demo data: SCREENSHOTS=1 npx playwright test screenshots */
test.skip(!process.env.SCREENSHOTS, 'only on demand');

for (const scheme of ['light', 'dark'] as const) {
  for (const locale of ['de-DE', 'en-US']) {
    test(`screens ${scheme} ${locale}`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme, locale, viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      const out = process.env.SCREENSHOTS!;
      const shot = (name: string) => page.screenshot({ path: `${out}/${scheme}-${locale}-${name}.png` });
      await page.goto('/');
      // Onboarding: "Plan a vacation" / "Urlaub planen"
      await page.getByRole('button', { name: /Plan a vacation|Urlaub planen/ }).click({ timeout: 30_000 });
      // Three intro pages: collect, vote, decide
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /Continue|Weiter/ }).click();
      // Take screenshot of the vacation list
      await shot('0-vacations');
      // Navigate to settings for debug screenshot
      await page.locator('ion-tab-button[tab="settings"]').click();
      await page.locator('ion-item', { hasText: 'Debug' }).click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${out}/${scheme}-${locale}-0-debug.png` });
      // Go back, seed demo vacation, and navigate through key UI scenes
      await page.locator('ion-back-button').last().click();
      await page.waitForTimeout(600);
      await page.goto('/vacations');
      await page.locator('ion-item', { hasText: 'Seed demo vacation' }).click();
      await page.waitForTimeout(1500);
      await shot('1-vacations');
      await page.locator('.vacation-card').first().click();
      await page.waitForTimeout(2000);
      await shot('2-houses');
      // Map tab
      await page.locator('ion-segment-button').filter({ hasText: /Karte|Map/ }).click();
      await page.waitForTimeout(1200);
      await shot('3-map');
      // People tab
      await page.locator('ion-segment-button').filter({ hasText: /Personen|People/ }).click();
      await page.waitForTimeout(800);
      await shot('4-people');
      // Houses tab + detail
      await page.locator('ion-segment-button').filter({ hasText: /Häuser|Houses/ }).click();
      await page.locator('.property-card').first().click();
      await page.waitForTimeout(800);
      await shot('5-detail');
      // Back from detail
      await page.locator('ion-back-button').last().click();
      await page.waitForTimeout(600);
      await page.goto('/settings');
      await page.waitForTimeout(600);
      await shot('6-settings');
      await ctx.close();
    });
  }
}