import { test, expect } from '@playwright/test';

/**
 * Canvas page E2E tests
 *
 * Desktop: Navigation links are visible in the header
 * Mobile: Navigation links are in a hamburger menu drawer
 */
test.describe('Canvas Page', () => {
  // Helper to check if we're in a mobile viewport
  const isMobileViewport = (viewportWidth: number | undefined) =>
    viewportWidth !== undefined && viewportWidth < 768;

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

  test('should have header with navigation', async ({ page, viewport }) => {
    // Pact logo should always be visible
    await expect(page.getByRole('link', { name: /pact/i })).toBeVisible();

    if (isMobileViewport(viewport?.width)) {
      // On mobile, need to open hamburger menu to see navigation
      await page.getByRole('button', { name: /open menu/i }).click();
      await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible();
    } else {
      // On desktop, navigation is visible directly
      await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible();
    }
  });

  test('should display atom count panel', async ({ page }) => {
    // Use more specific selector to target the atom count display in the canvas
    // rather than matching the navigation link
    const atomCountPanel = page.getByTestId('rf__wrapper').getByText(/\d+\s*atoms?/i);
    await expect(atomCountPanel).toBeVisible();
  });

  test('should allow canvas interaction', async ({ page }) => {
    // Canvas should be interactive - test zoom controls
    const zoomInButton = page.locator('.react-flow__controls-zoomin');
    const zoomOutButton = page.locator('.react-flow__controls-zoomout');

    await expect(zoomInButton).toBeVisible();
    await expect(zoomOutButton).toBeVisible();

    // Click zoom buttons (they should be clickable)
    await zoomInButton.click();
    await zoomOutButton.click();
  });
});
