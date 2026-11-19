import { expect, test } from '@playwright/test';

for (const outcome of ['match', 'no match', 'timeout']) {
  test(`house address survives reopening after lookup: ${outcome}`, async ({ page }) => {
    const queries: string[] = [];
    const resolvedAddress = 'Munich, Germany';
    let lookupMatches = outcome === 'match';
    await page.route('https://nominatim.openstreetmap.org/search?*', async (route) => {
      queries.push(new URL(route.request().url()).searchParams.get('q') ?? '');
      if (outcome === 'timeout' && queries.length === 1) return;
      await route.fulfill({ json: lookupMatches ? [{ lat: '48.137', lon: '11.575', display_name: resolvedAddress }] : [] });
    });
    await page.route('**/functions/v1/link-preview', (route) => route.fulfill({ json: {} }));
    await page.goto('/');
    await page.getByRole('button', { name: /^Plan a vacation/ }).click();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Your name', { exact: true }).fill('Anna');
    await page.locator('ion-input', { hasText: 'Name' }).nth(1).locator('input').fill('Bavaria trip');
    await page.getByRole('button', { name: 'Create vacation', exact: true }).click();
    await page.locator('.vacation-card', { hasText: 'Bavaria trip' }).click();
    await page.locator('ion-content').getByRole('button', { name: 'Add house', exact: true }).click();
    const modal = page.locator('ion-modal.show-modal');
    const save = modal.getByRole('button', { name: 'Save', exact: true });
    const edit = page.locator('ion-toolbar').getByRole('button', { name: 'Edit house', exact: true });
    const addressField = modal.getByLabel('Address', { exact: true });
    await modal.getByLabel('Link to the holiday home', { exact: true }).fill('https://example.com/munich');
    await modal.getByLabel('Title', { exact: true }).fill('Bavaria house');
    if (outcome === 'timeout') {
      await save.click();
      await expect(modal).toHaveCount(0);
      await page.locator('.property-card', { hasText: 'Bavaria house' }).click();
      await edit.click();
    }
    await addressField.fill('Munich');
    await expect(modal.getByRole('button', { name: 'Check address' })).toBeEnabled();
    if (outcome === 'timeout') {
      await modal.getByRole('button', { name: 'Check address' }).click();
      await expect(modal.getByText('Looking up the address…')).toBeVisible();
    }
    await save.click();
    await expect(modal).toHaveCount(0, { timeout: 8000 });
    expect(queries).toEqual(['Munich']);
    if (!lookupMatches) await expect(page.getByText('Address saved, but no map pin could be added.', { exact: false })).toBeVisible();

    await page.reload();
    if (outcome !== 'timeout') await page.locator('.property-card', { hasText: 'Bavaria house' }).click();
    const savedAddress = lookupMatches ? resolvedAddress : 'Munich';
    await expect(page.getByText(savedAddress, { exact: true })).toBeVisible();
    await edit.click();
    await expect(addressField).toHaveValue(savedAddress);
    if (lookupMatches) await expect(modal.getByText('Found on the map ✓')).toBeVisible();
    expect(queries).toEqual(['Munich']);
    if (!lookupMatches) {
      await expect(modal.getByRole('button', { name: 'Check address' })).toBeEnabled();
      lookupMatches = true;
      await modal.getByRole('button', { name: 'Check address' }).click();
      await expect(addressField).toHaveValue(resolvedAddress);
      await expect(modal.getByText(resolvedAddress, { exact: true })).toHaveCount(0);
      await save.click();
      await expect(modal).toHaveCount(0);
      await expect(page.getByText(resolvedAddress, { exact: true })).toBeVisible();
      await edit.click();
      await expect(addressField).toHaveValue(resolvedAddress);
      await expect(modal.getByText('Found on the map ✓')).toBeVisible();
      await page.reload();
      await edit.click();
      await expect(addressField).toHaveValue(resolvedAddress);
      expect(queries).toEqual(['Munich', 'Munich']);
    }
  });
}
