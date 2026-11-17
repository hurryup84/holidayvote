import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    tapNotification?: (route: string) => void;
    delayNotificationHouse: boolean;
    releaseNotificationHouse?: () => void;
  }
}

test.beforeEach(async ({ page }) => {
  await page.route(/\/src\/native\/pushNotifications\.ts(?:\?.*)?$/, async (route) => {
    await route.fulfill({ contentType: 'application/javascript', body: `
      let currentHandle;
      export async function start() {}
      export async function onPushTap(listener) {
        window.tapNotification = listener;
        const pending = localStorage.getItem('test-notification-route');
        localStorage.removeItem('test-notification-route');
        if (pending) listener(pending);
        const handle = { remove: async () => {
          if (currentHandle === handle) window.tapNotification = undefined;
        } };
        currentHandle = handle;
        return handle;
      }
    ` });
  });
  await page.route(/\/src\/data\/repositories\/index\.ts(?:\?t=\d+)?$/, async (route) => {
    await route.fulfill({ contentType: 'application/javascript', body: `
      import { createRepos as actual } from '/src/data/repositories/index.ts?actual';
      export function createRepos(ctx) {
        const repos = actual(ctx);
        const get = repos.properties.getWithStats;
        repos.properties.getWithStats = async (id) => {
          if (window.delayNotificationHouse) {
            await new Promise((resolve) => { window.releaseNotificationHouse = resolve; });
          }
          return get(id);
        };
        return repos;
      }
    ` });
  });
  await page.route(/\/src\/native\/linkPreview\.ts(?:\?.*)?$/, async (route) => {
    await route.fulfill({ contentType: 'application/javascript', body: `
      export async function fetchLinkPreview() { return null; }
      export async function downloadImage() { return null; }
    ` });
  });
});

async function seedHouse(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: /^Plan a vacation/ }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Anna');
  await page.locator('ion-input', { hasText: 'Name' }).nth(1).locator('input').fill('Notification vacation');
  await page.getByRole('button', { name: 'Create vacation', exact: true }).click();
  await page.locator('.vacation-card', { hasText: 'Notification vacation' }).click();
  const active = page.locator('.ion-page:not(.ion-page-hidden)').last();
  await active.getByRole('button', { name: 'Add house', exact: true }).click();
  const modal = page.locator('ion-modal.show-modal').last();
  await modal.getByLabel('Link to the holiday home', { exact: true }).fill('https://example.com/push-house');
  await modal.getByLabel('Title', { exact: true }).fill('Notification house');
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('.property-card', { hasText: 'Notification house' }).click();
  await expect(page.locator('.detail-head h1')).toHaveText('Notification house');
  return new URL(page.url()).pathname;
}

test('a cold-start tap survives boot and the initial redirect, then opens the house', async ({ page }) => {
  const houseRoute = await seedHouse(page);
  await page.evaluate((route) => localStorage.setItem('test-notification-route', route), houseRoute);
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`${houseRoute}$`));
  await expect(page.locator('.detail-head h1')).toHaveText('Notification house');
  await expect(page.getByRole('button', { name: 'Edit house', exact: true })).toBeVisible();
});

test('a warm tap from Settings opens the house and shows loading while local data is read', async ({ page }) => {
  const houseRoute = await seedHouse(page);
  await page.goto('/settings');
  await expect(page.locator('ion-title').getByText('Settings', { exact: true })).toBeVisible();
  await page.evaluate((route) => {
    window.delayNotificationHouse = true;
    window.tapNotification?.(route);
  }, houseRoute);
  await expect(page).toHaveURL(new RegExp(`${houseRoute}$`));
  await expect(page.getByText('Loading holiday home…', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.delayNotificationHouse = false;
    window.releaseNotificationHouse?.();
  });
  await expect(page.locator('.detail-head h1')).toHaveText('Notification house');
});

test('an unavailable notification house offers retry and an escape instead of a blank screen', async ({ page }) => {
  const houseRoute = await seedHouse(page);
  const missingRoute = houseRoute.replace(/\/houses\/[^/]+$/, '/houses/00000000-0000-7000-8000-000000000000');
  await page.goto('/settings');
  await expect(page.locator('ion-title').getByText('Settings', { exact: true })).toBeVisible();
  await page.evaluate((route) => window.tapNotification?.(route), missingRoute);
  await expect(page.getByText(/This holiday home is not available on this device/)).toBeVisible();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText(/This holiday home is not available on this device/)).toBeVisible();
  await page.locator('[role="status"]').getByRole('link', { name: 'Vacations', exact: true }).click();
  await expect(page).toHaveURL(/\/vacations$/);
  await expect(page.locator('.vacation-card', { hasText: 'Notification vacation' })).toBeVisible();
});
