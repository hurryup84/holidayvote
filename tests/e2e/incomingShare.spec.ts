import { expect, test } from '@playwright/test';

interface TestShare { id: string; text: string; title?: string }
declare global {
  interface Window {
    shareInbox: TestShare[];
    shareRemoved: string[];
    shareReceived?: () => void;
    previewTitle: string | null;
    resolvePreviewTitle?: (title: string | null) => void;
    delayPreviewTitle: boolean;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.shareInbox = [];
    window.shareRemoved = [];
    window.previewTitle = 'Seevilla Rømø';
    window.delayPreviewTitle = false;
  });
  await page.route('**/src/native/incomingShare.ts', async (route) => {
    await route.fulfill({ contentType: 'application/javascript', body: `
      export { sharedHolidayHomeUrl } from '/src/native/incomingShare.ts?parser';
      export async function pendingShares() { return [...window.shareInbox]; }
      export async function removeShare(id) {
        window.shareInbox = window.shareInbox.filter((s) => s.id !== id);
        window.shareRemoved.push(id);
      }
      export async function onIncomingShare(listener) {
        window.shareReceived = listener;
        return { remove: async () => { window.shareReceived = undefined; } };
      }
    ` });
  });
  await page.route('**/src/native/linkPreview.ts', async (route) => {
    await route.fulfill({ contentType: 'application/javascript', body: `
      export async function fetchLinkPreview() {
        if (window.delayPreviewTitle) return new Promise((resolve) => { window.resolvePreviewTitle = resolve; });
        return { title: window.previewTitle, description: null, image: null, siteName: null };
      }
    ` });
  });
});

async function finishOnboarding(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Plan a vacation|Urlaub planen/ }).click({ timeout: 30_000 });
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /Continue|Weiter/ }).click();
  await page.getByLabel(/Dein Name|Your name/).fill('Anna');
  await page.getByRole('button', { name: /Create it later|Später anlegen/ }).click();
  await page.waitForTimeout(800);
}

async function seedVacation(page: import('@playwright/test').Page, name = 'Sommerurlaub') {
  await page.getByRole('button', { name: /New vacation|Neuer Urlaub/ }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: /Save|Speichern/ }).click();
  await page.waitForTimeout(800);
}

test('a queued share waits for a vacation pick, prefills the house form, and persists it', async ({ page }) => {
  await page.goto('/');
  await finishOnboarding(page);
  await seedVacation(page);

  // Share arrives after a vacation exists; the picker lets the user choose it.
  await page.evaluate(() => {
    window.shareInbox.push({ id: 'cold', text: 'Schau dir das an!\nhttps://example.com/haus/rovnjag?n=2#bestaetigung' });
    window.shareReceived?.();
  });

  const picker = page.locator('ion-modal');
  await expect(picker.getByText(/Add to a vacation|Zu einem Urlaub hinzufügen/)).toBeVisible();
  await picker.getByRole('button', { name: 'Sommerurlaub' }).click();

  const houseModal = page.locator('ion-modal').last();
  await expect(houseModal.getByText(/I am not allowed to automatically add photos/)).toBeVisible();
  await expect(houseModal.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Seevilla Rømø');
  await expect(houseModal.getByRole('textbox', { name: 'Link to the holiday home', exact: true })).toHaveValue(
    'https://example.com/haus/rovnjag?n=2#bestaetigung'
  );
  await houseModal.getByRole('button', { name: 'Save', exact: true }).click();

  // House persisted in the vacation.
  await expect(page.locator('.property-card').first()).toContainText('Seevilla Rømø');
  await expect.poll(() => page.evaluate(() => window.shareRemoved)).toEqual(['cold']);

  // Reload: the house survives.
  await page.reload();
  await expect(page.locator('.property-card').first()).toContainText('Seevilla Rømø', { timeout: 30_000 });
});

test('warm shares queue without overwriting edits; cancelling discards them', async ({ page }) => {
  await page.goto('/');
  await finishOnboarding(page);
  await seedVacation(page);

  await page.evaluate(() => {
    window.delayPreviewTitle = true;
    window.shareInbox.push({ id: 'first', text: 'https://example.com/first' });
    window.shareReceived?.();
  });
  const picker = page.locator('ion-modal');
  await expect(picker.getByText(/Add to a vacation/)).toBeVisible();
  await picker.getByRole('button', { name: 'Sommerurlaub' }).click();

  const houseModal = page.locator('ion-modal').last();
  await expect(houseModal.getByText('Looking up the holiday-home name…|Den Ferienhausnamen ermitteln …')).toBeVisible();
  await houseModal.getByRole('textbox', { name: 'Title', exact: true }).fill('My own house name');
  await page.evaluate(() => {
    window.shareInbox.push({ id: 'second', text: 'https://example.com/second' });
    window.shareReceived?.();
    window.resolvePreviewTitle?.('Website name must not overwrite edits');
    window.delayPreviewTitle = false;
    window.previewTitle = null;
  });
  await expect(houseModal.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('My own house name');

  // Cancel → share dismissed; picker shows the second link.
  await houseModal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(picker.getByText("Couldn't read the name|Der Name konnte nicht gelesen werden")).toBeVisible();
  await picker.getByRole('button', { name: 'Sommerurlaub' }).click();
  await houseModal.getByRole('textbox', { name: 'Title', exact: true }).fill('Offline house');
  await houseModal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.property-card').first()).toContainText('Offline house');
  await expect.poll(() => page.evaluate(() => window.shareRemoved)).toEqual(['first', 'second']);
});

test('a late title lookup does not name a different house after its link was edited', async ({ page }) => {
  await page.goto('/');
  await finishOnboarding(page);
  await seedVacation(page);

  await page.evaluate(() => {
    window.delayPreviewTitle = true;
    window.shareInbox.push({ id: 'edited', text: 'https://example.com/original' });
    window.shareReceived?.();
  });
  const picker = page.locator('ion-modal');
  await picker.getByRole('button', { name: 'Sommerurlaub' }).click();
  const houseModal = page.locator('ion-modal').last();
  await expect(houseModal.getByText('Looking up the holiday-home name…|Den Ferienhausnamen ermitteln …')).toBeVisible();
  await houseModal.getByRole('textbox', { name: 'Link to the holiday home', exact: true }).fill('https://example.com/changed');
  await page.evaluate(() => window.resolvePreviewTitle?.('The original house name'));
  await expect(houseModal.getByText('Looking up the holiday-home name…|Den Ferienhausnamen ermitteln …')).toHaveCount(0);
  await expect(houseModal.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('');
});
