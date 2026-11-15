import { type Page } from '@playwright/test';

/** Completes onboarding (welcome → 3 intro pages → skip name/first vacation) so the app shell with the tab bar appears. */
export async function completeOnboarding(page: Page) {
  await page.getByRole('button', { name: /Plan a vacation|Urlaub planen/ }).click({ timeout: 30_000 });
  // Three intro pages: collect, vote, decide
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /Continue|Weiter/ }).click();
  // Skip the name/first-vacation step so we land on the app shell with the tab bar
  await page.getByLabel(/Dein Name|Your name/).fill('Anna');
  await page.getByRole('button', { name: /Create it later|Später anlegen/ }).click();
  await page.waitForTimeout(800);
}

/** Opens the Debug page and seeds the demo vacation (houses + votes + comment). */
export async function seedDemoVacation(page: Page) {
  await page.locator('ion-tab-button[tab="settings"]').click();
  await page.locator('ion-item', { hasText: 'Debug' }).click();
  await page.waitForTimeout(800);
  await page.locator('ion-item', { hasText: 'Seed demo vacation' }).click();
  await page.waitForTimeout(1500);
}

/** Shoot a scene into `${out}/${scheme}-${locale}-${name}.png`. */
export async function shoot(page: Page, out: string, scheme: string, locale: string, name: string) {
  await page.screenshot({ path: `${out}/${scheme}-${locale}-${name}.png` });
}
