import { test, expect } from '@playwright/test';

/**
 * Navigation tests for Pact frontend
 *
 * Desktop: Navigation links are visible in the header
 * Mobile: Navigation links are in a hamburger menu drawer
 */
test.describe('Navigation', () => {
  // Helper to check if we're in a mobile viewport
  const isMobileViewport = (viewportWidth: number | undefined) =>
    viewportWidth !== undefined && viewportWidth < 768;

  test('should display header with navigation links', async ({ page, viewport }) => {
    await page.goto('/');

    // Check header is present
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Check Pact logo/title
    await expect(header.getByRole('link', { name: /pact/i })).toBeVisible();

    if (isMobileViewport(viewport?.width)) {
      // On mobile, nav links should be hidden until hamburger menu is opened
      await expect(header.getByRole('link', { name: 'Dashboard' })).not.toBeVisible();

      // Open hamburger menu
      const menuButton = header.getByRole('button', { name: /open menu/i });
      await expect(menuButton).toBeVisible();
      await menuButton.click();

      // Now navigation links should be visible in the drawer
      await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Canvas' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Atoms' })).toBeVisible();
    } else {
      // On desktop, nav links should be visible directly in header
      await expect(header.getByRole('link', { name: 'Dashboard' })).toBeVisible();
      await expect(header.getByRole('link', { name: 'Canvas' })).toBeVisible();
      await expect(header.getByRole('link', { name: 'Atoms' })).toBeVisible();
    }
  });

  test('should navigate to Dashboard', async ({ page, viewport }) => {
    await page.goto('/canvas'); // Start from a different page

    if (isMobileViewport(viewport?.width)) {
      // Open hamburger menu first
      await page.getByRole('button', { name: /open menu/i }).click();
    }

    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('should navigate to Canvas', async ({ page, viewport }) => {
    await page.goto('/');

    if (isMobileViewport(viewport?.width)) {
      // Open hamburger menu first
      await page.getByRole('button', { name: /open menu/i }).click();
    }

    await page.getByRole('link', { name: 'Canvas' }).click();
    await expect(page).toHaveURL('/canvas');
  });

  test('should navigate to Atoms list', async ({ page, viewport }) => {
    await page.goto('/');

    if (isMobileViewport(viewport?.width)) {
      // Open hamburger menu first
      await page.getByRole('button', { name: /open menu/i }).click();
    }

    await page.getByRole('link', { name: 'Atoms' }).click();
    await expect(page).toHaveURL('/atoms');
    await expect(page.getByRole('heading', { name: /intent atoms/i })).toBeVisible();
  });

  test('should show "New Atom" button', async ({ page, viewport }) => {
    await page.goto('/');

    if (isMobileViewport(viewport?.width)) {
      // On mobile, New Atom button is in the hamburger menu
      const header = page.locator('header');
      await expect(header.getByRole('button', { name: /new atom/i })).not.toBeVisible();

      // Open hamburger menu
      await page.getByRole('button', { name: /open menu/i }).click();

      // New Atom button should be visible in the drawer
      await expect(page.getByRole('button', { name: /new atom/i })).toBeVisible();
    } else {
      // On desktop, New Atom button is visible in header
      const header = page.locator('header');
      const newAtomButton = header.getByRole('button', { name: /new atom/i });
      await expect(newAtomButton).toBeVisible();
    }
  });

  test('should close mobile menu when clicking overlay', async ({ page, viewport }) => {
    // Only run this test on mobile
    test.skip(!isMobileViewport(viewport?.width), 'This test is for mobile viewports only');

    await page.goto('/');

    // Open hamburger menu
    await page.getByRole('button', { name: /open menu/i }).click();
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();

    // Click overlay to close menu
    await page.getByRole('button', { name: /close menu/i }).click();

    // Menu should be closed
    await expect(page.getByRole('link', { name: 'Dashboard' })).not.toBeVisible();
  });

  test('should close mobile menu after navigation', async ({ page, viewport }) => {
    // Only run this test on mobile
    test.skip(!isMobileViewport(viewport?.width), 'This test is for mobile viewports only');

    await page.goto('/');

    // Open hamburger menu
    await page.getByRole('button', { name: /open menu/i }).click();
    await expect(page.getByRole('link', { name: 'Canvas' })).toBeVisible();

    // Click a navigation link
    await page.getByRole('link', { name: 'Canvas' }).click();

    // Should navigate and menu should be closed
    await expect(page).toHaveURL('/canvas');

    // Menu should be closed (hamburger icon visible, not X)
    await expect(page.getByRole('button', { name: /open menu/i })).toBeVisible();
  });
});
