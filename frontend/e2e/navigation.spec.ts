import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should display header with navigation links', async ({ page }) => {
    await page.goto('/');

    // Check header is present
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Check Pact logo/title
    await expect(header.getByRole('link', { name: /pact/i })).toBeVisible();

    // Check navigation links within header (using exact to avoid matching page content)
    await expect(header.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Canvas' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Atoms' })).toBeVisible();
  });

  test('should navigate to Dashboard', async ({ page }) => {
    await page.goto('/');

    const header = page.locator('header');
    await header.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('should navigate to Canvas', async ({ page }) => {
    await page.goto('/');

    const header = page.locator('header');
    await header.getByRole('link', { name: 'Canvas' }).click();
    await expect(page).toHaveURL('/canvas');
  });

  test('should navigate to Atoms list', async ({ page }) => {
    await page.goto('/');

    const header = page.locator('header');
    await header.getByRole('link', { name: 'Atoms' }).click();
    await expect(page).toHaveURL('/atoms');
    await expect(page.getByRole('heading', { name: /intent atoms/i })).toBeVisible();
  });

  test('should show "New Atom" button in header', async ({ page }) => {
    await page.goto('/');

    const header = page.locator('header');
    const newAtomButton = header.getByRole('button', { name: /new atom/i });
    await expect(newAtomButton).toBeVisible();
  });
});
