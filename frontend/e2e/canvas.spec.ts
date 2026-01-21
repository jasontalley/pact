import { test, expect } from '@playwright/test';

test.describe('Canvas Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/canvas');
  });

  test('should display canvas with ReactFlow', async ({ page }) => {
    // ReactFlow container should be present
    const reactFlowContainer = page.locator('.react-flow');
    await expect(reactFlowContainer).toBeVisible();
  });

  test('should have canvas controls', async ({ page }) => {
    // Check for zoom controls
    const controls = page.locator('.react-flow__controls');
    await expect(controls).toBeVisible();
  });

  test('should have minimap', async ({ page }) => {
    const minimap = page.locator('.react-flow__minimap');
    await expect(minimap).toBeVisible();
  });

  test('should have header with navigation', async ({ page }) => {
    await expect(page.getByRole('link', { name: /pact/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible();
  });

  test('should display atom count panel', async ({ page }) => {
    // Panel showing atom count
    await expect(page.getByText(/atoms/i)).toBeVisible();
  });
});
