import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display dashboard heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
    await expect(page.getByText(/overview of your intent atoms/i)).toBeVisible();
  });

  test('should display stats grid', async ({ page }) => {
    // Check for stats cards - they show totals (using exact match to avoid duplicate elements)
    await expect(page.getByText('Total Atoms')).toBeVisible();
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();
    await expect(page.getByText('Committed', { exact: true })).toBeVisible();
  });

  test('should display recent atoms section', async ({ page }) => {
    await expect(page.getByText(/recent atoms/i)).toBeVisible();
  });

  test('should display quick actions section', async ({ page }) => {
    await expect(page.getByText(/quick actions/i)).toBeVisible();
  });

  test('should have header without sidebar', async ({ page }) => {
    // Dashboard shows header but no sidebar
    await expect(page.getByRole('link', { name: /pact/i })).toBeVisible();

    // No sidebar should be visible
    const sidebar = page.locator('aside');
    await expect(sidebar).not.toBeVisible();
  });
});
