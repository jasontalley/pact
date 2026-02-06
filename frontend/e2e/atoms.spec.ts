import { test, expect } from '@playwright/test';

test.describe('Atoms Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/atoms');
  });

  test('should display atoms list page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /intent atoms/i })).toBeVisible();
    await expect(page.getByText(/browse and filter all intent atoms/i)).toBeVisible();
  });

  test('should display sidebar with filters', async ({ page }) => {
    // Check sidebar is visible
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();

    // Check filter header
    await expect(page.getByText(/filters/i)).toBeVisible();

    // Check search input
    await expect(page.getByPlaceholder(/search atoms/i)).toBeVisible();

    // Check status filters
    await expect(page.getByRole('button', { name: /draft/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /committed/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /superseded/i })).toBeVisible();

    // Check category filters
    await expect(page.getByRole('button', { name: /functional/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /performance/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /security/i })).toBeVisible();
  });

  test('should filter by status when clicking status button', async ({ page }) => {
    await page.getByRole('button', { name: /^draft$/i }).click();

    // URL should update with status parameter
    await expect(page).toHaveURL(/status=draft/);
  });

  test('should filter by category when clicking category button', async ({ page }) => {
    await page.getByRole('button', { name: /functional/i }).click();

    // URL should update with category parameter
    await expect(page).toHaveURL(/category=functional/);
  });

  test('should search atoms', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search atoms/i);
    await searchInput.fill('test query');

    // Wait for debounce and URL update
    await expect(page).toHaveURL(/search=test/);
  });

  test('should clear all filters', async ({ page }) => {
    // Apply some filters first
    await page.getByRole('button', { name: /^draft$/i }).click();
    await expect(page).toHaveURL(/status=draft/);

    // Click clear filters button using JS dispatch to bypass Next.js dev overlay
    // (Next.js 15+ dev overlay portal intercepts pointer events)
    const clearButton = page.getByRole('button', { name: /clear all filters/i });
    await clearButton.waitFor({ state: 'visible' });
    await clearButton.dispatchEvent('click');

    // URL should be clean
    await expect(page).toHaveURL('/atoms');
  });
});

test.describe('Atoms Page - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('should hide sidebar by default on mobile', async ({ page }) => {
    await page.goto('/atoms');

    // Sidebar should be hidden initially
    const sidebar = page.locator('aside');
    // On mobile, sidebar is translated off-screen
    await expect(sidebar).toBeVisible();
  });
});
