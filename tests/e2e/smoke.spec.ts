import { expect, test, type Page } from '@playwright/test';

/**
 * Main flow in the browser build (SQLite via sql.js, no Supabase): onboarding → first vacation →
 * add houses → stars, favourite, veto, comment → ranking → reload keeps everything.
 * SCREENSHOTS=<dir> also saves screenshots of the main screens.
 */
const shots = process.env.SCREENSHOTS;
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
}

/** The page that is currently shown (Ionic keeps the previous ones in the DOM, hidden). */
const visible = (page: Page) => page.locator('.ion-page:not(.ion-page-hidden)').last();

/** Back from the house page; waits until it's gone (the leaving page stays in the DOM during the transition). */
async function back(page: Page) {
  await visible(page).locator('ion-back-button').click();
  await expect(page.locator('.detail-head')).toHaveCount(0);
}

async function addHouse(page: Page, url: string, title: string, price: string) {
  const fab = visible(page).locator('ion-fab-button');
  if (await fab.count()) await fab.click();
  else await visible(page).getByRole('button', { name: 'Add house' }).click();
  const modal = page.locator('ion-modal.show-modal').last();
  await modal.locator('ion-input input[type="url"]').fill(url);
  await modal.locator('ion-input', { hasText: 'Title' }).locator('input').fill(title);
  await modal.locator('ion-input', { hasText: 'Total price' }).locator('input').fill(price);
  await shot(page, `add-${title.split(' ')[0].toLowerCase()}`);
  await modal.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.property-card', { hasText: title })).toBeVisible();
}

test('onboarding → vacation → houses → votes → ranking → persists', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && console.info('[browser]', m.text()));

  await page.goto('/');
  await shot(page, 'welcome');
  await page.getByRole('button', { name: /Plan a vacation/ }).click({ timeout: 30_000 });
  await expect(page.getByText('Collect links')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Your first vacation')).toBeVisible();
  await page.locator('ion-input', { hasText: 'Your name' }).locator('input').fill('Anna');
  await page.locator('ion-input', { hasText: 'Name' }).nth(1).locator('input').fill('Summer 2027');
  await page.locator('ion-input', { hasText: 'Destination' }).locator('input').fill('Denmark');
  await page.getByRole('button', { name: 'Create vacation' }).click();

  const card = page.locator('.vacation-card', { hasText: 'Summer 2027' });
  await expect(card).toContainText('Denmark');
  await shot(page, 'vacations');
  await card.click();

  await expect(page.getByText('No houses yet')).toBeVisible();
  await addHouse(page, 'https://www.airbnb.de/rooms/123?utm_source=x', 'Thatched cottage', '1800');
  await addHouse(page, 'novasol.de/ferienhaus/456', 'Beach villa', '2400');
  await expect(page.locator('.property-card')).toHaveCount(2);
  await expect(page.locator('.property-card', { hasText: 'Thatched cottage' })).toContainText('Airbnb');

  // Duplicate link is recognised (different tracking parameters, same house).
  await visible(page).locator('ion-fab-button').click();
  const modal = page.locator('ion-modal.show-modal').last();
  await modal.locator('ion-input input[type="url"]').fill('https://airbnb.de/rooms/123/');
  await expect(modal.getByText('This house is already in the list')).toBeVisible();
  await modal.getByRole('button', { name: 'Cancel' }).click();

  // Rate the villa 5, favourite; veto the cottage.
  await page.locator('.property-card', { hasText: 'Beach villa' }).click();
  await page.getByRole('radio', { name: '5 stars' }).click();
  await page.getByRole('button', { name: /^Favourite$/ }).click();
  await expect(page.getByRole('button', { name: 'My favourite' })).toBeVisible();
  await page.locator('ion-textarea textarea').last().fill('Pool and sea view!');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.comment-text', { hasText: 'Pool and sea view!' })).toBeVisible();
  await shot(page, 'house');
  await back(page);

  await page.locator('.property-card', { hasText: 'Thatched cottage' }).click();
  await page.getByRole('button', { name: /^Veto$/ }).click();
  await expect(page.getByRole('button', { name: 'My veto' })).toBeVisible();
  // The organiser books it.
  await page.getByRole('button', { name: 'Mark as booked' }).click();
  await expect(page.getByText('This house is booked')).toBeVisible();
  await back(page);

  // Booked first, then ranking.
  const cards = page.locator('.property-card');
  await expect(cards.nth(0)).toContainText('Thatched cottage');
  await expect(cards.nth(0)).toContainText('Booked');
  await expect(cards.nth(1)).toContainText('Beach villa');
  await expect(cards.nth(1)).toContainText('5');
  await shot(page, 'houses');

  // People tab: only on this phone so far; organiser settings.
  // force: Ionic's segment never reports "stable" to Playwright (it keeps re-measuring its indicator).
  await page.getByRole('tab', { name: 'People' }).click({ force: true });
  await expect(page.getByText('only on your phone')).toBeVisible();
  await expect(page.getByText('House details')).toBeVisible();
  await shot(page, 'people');

  // Reload: everything is still there.
  await page.goto('/vacations');
  await expect(page.locator('.vacation-card', { hasText: 'Summer 2027' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.vacation-card', { hasText: 'Summer 2027' })).toContainText('Booked: Thatched cottage');

  await page.locator('ion-tab-button[tab="settings"]').click();
  await expect(page.getByText('Delete my data')).toBeVisible();
  await shot(page, 'settings');

  expect(errors).toEqual([]);
});

test('house cards and details show only the total price for a shared vacation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Plan a vacation/ }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Anna');
  await page.locator('ion-input', { hasText: 'Name' }).nth(1).locator('input').fill('Summer 2027');
  await page.getByRole('button', { name: 'Create vacation', exact: true }).click();
  const card = page.locator('.vacation-card', { hasText: 'Summer 2027' });
  await card.click();
  await expect(page.getByText('No houses yet')).toBeVisible();
  await addHouse(page, 'https://example.com/villa', 'Beach villa', '2400');
  await page.goto('/vacations');
  await expect(card).toBeVisible();

  // Seed a second member without contacting Supabase, then reload the app's SQLite connection.
  await page.evaluate(async (modulePath) => {
    const { openWebDb }: typeof import('../../src/data/db/webDb') = await import(modulePath);
    const db = await openWebDb();
    try {
      await db.execute(
        `INSERT INTO vacation_members (id, vacation_id, user_id, role, display_name)
         SELECT 'test-member', id, 'test-user', 'member', 'Ben' FROM vacations WHERE name = ?`,
        ['Summer 2027'],
      );
    } finally {
      await db.close();
    }
  }, '/src/data/db/webDb.ts');
  await page.reload();
  await expect(card).toContainText('2 people');
  await card.click();
  const villa = page.locator('.property-card', { hasText: 'Beach villa' });
  await expect(villa.locator('.price')).toHaveText('€2,400');
  await villa.click();
  await expect(page.locator('ion-item').filter({ hasText: 'Total price' })).toHaveText(/Total price\s*€2,400/);
  await expect(page.getByText('Per person', { exact: false })).toHaveCount(0);
});
