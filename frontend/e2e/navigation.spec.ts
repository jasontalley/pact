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
    await page.waitForLoadState('networkidle');

    // Check header is present
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Check Pact logo/title
    await expect(header.getByRole('link', { name: /pact/i })).toBeVisible();

    if (isMobileViewport(viewport?.width)) {
      // On mobile, nav links should be hidden until hamburger menu is opened
      // Check that the hamburger menu button exists
      const menuButton = page.getByRole('button', { name: /open menu/i });
      await expect(menuButton).toBeVisible({ timeout: 10000 });

      // Open hamburger menu
      await menuButton.click();
      // Wait for menu animation
      await page.waitForTimeout(300);

      // Now navigation links should be visible in the drawer
      await expect(page.locator('nav').getByRole('link', { name: 'Dashboard' })).toBeVisible({ timeout: 5000 });
      await expect(page.locator('nav').getByRole('link', { name: 'Atoms' })).toBeVisible();
      await expect(page.locator('nav').getByRole('link', { name: 'Reconciliation' })).toBeVisible();
    } else {
      // On desktop, nav links should be visible directly in header
      await expect(header.getByRole('link', { name: 'Dashboard' })).toBeVisible();
      await expect(header.getByRole('link', { name: 'Atoms' })).toBeVisible();
      await expect(header.getByRole('link', { name: 'Reconciliation' })).toBeVisible();
    }
  });

  test('should navigate to Dashboard', async ({ page, viewport }) => {
    await page.goto('/atoms'); // Start from a different page

    if (isMobileViewport(viewport?.width)) {
      // Open hamburger menu first
      await page.getByRole('button', { name: /open menu/i }).click();
    }

    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('should navigate to Reconciliation', async ({ page, viewport }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    if (isMobileViewport(viewport?.width)) {
      // Open hamburger menu first
      await page.getByRole('button', { name: /open menu/i }).click();
      await page.waitForTimeout(200);
      // On mobile, use the nav drawer link
      await page.locator('nav').getByRole('link', { name: 'Reconciliation', exact: true }).click();
    } else {
      // On desktop, use the header link
      const header = page.locator('header');
      await header.getByRole('link', { name: 'Reconciliation', exact: true }).click();
    }

    await expect(page).toHaveURL('/reconciliation');
  });

  test('should navigate to Atoms list', async ({ page, viewport }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    if (isMobileViewport(viewport?.width)) {
      // Open hamburger menu first
      await page.getByRole('button', { name: /open menu/i }).click();
      await page.waitForTimeout(200);
      // On mobile, use the nav drawer link
      await page.locator('nav').getByRole('link', { name: 'Atoms', exact: true }).click();
    } else {
      // On desktop, use the header link
      const header = page.locator('header');
      await header.getByRole('link', { name: 'Atoms', exact: true }).click();
    }

    await expect(page).toHaveURL('/atoms');
    await expect(page.getByRole('heading', { name: /intent atoms/i })).toBeVisible();
  });

  test('should show "New Atom" button and open dialog when clicked', async ({ page, viewport }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    if (isMobileViewport(viewport?.width)) {
      // On mobile, the New Atom button is inside the hamburger menu
      // Open hamburger menu first
      const menuButton = page.getByRole('button', { name: /open menu/i });
      await expect(menuButton).toBeVisible({ timeout: 10000 });
      await menuButton.click();
      // Wait for menu animation
      await page.waitForTimeout(300);

      // New Atom button should be visible in the navigation drawer
      const newAtomButton = page.locator('nav button').filter({ hasText: 'New Atom' });
      await expect(newAtomButton).toBeVisible({ timeout: 10000 });

      // Click should open the create dialog
      await newAtomButton.click();
      await expect(page.getByRole('heading', { name: /create intent atom/i }).first()).toBeVisible({ timeout: 10000 });
    } else {
      // On desktop, New Atom button is visible in header
      const header = page.locator('header');
      const newAtomButton = header.getByRole('button', { name: 'New Atom', exact: true });
      await expect(newAtomButton).toBeVisible({ timeout: 10000 });

      // Click should open the create dialog
      await newAtomButton.click();
      await expect(page.getByRole('heading', { name: /create intent atom/i }).first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('should close mobile menu when clicking overlay', async ({ page, viewport }) => {
    // Only run this test on mobile
    test.skip(!isMobileViewport(viewport?.width), 'This test is for mobile viewports only');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open hamburger menu
    const menuButton = page.getByRole('button', { name: /open menu/i });
    await expect(menuButton).toBeVisible({ timeout: 10000 });
    await menuButton.click();
    // Wait for menu animation
    await page.waitForTimeout(300);

    // Verify menu is open
    await expect(page.locator('nav').getByRole('link', { name: 'Dashboard' })).toBeVisible({ timeout: 5000 });

    // Click the hamburger toggle button (which now shows "Close menu" when the menu is open)
    // Use aria-expanded attribute to distinguish from the overlay button
    const closeButton = page.locator('header button[aria-expanded="true"]');
    await expect(closeButton).toBeVisible({ timeout: 5000 });
    await closeButton.click();

    // Wait for menu close animation
    await page.waitForTimeout(300);

    // Menu should be closed - hamburger button should show "Open menu" again
    await expect(page.locator('header').getByRole('button', { name: /open menu/i })).toBeVisible({ timeout: 5000 });
  });

  test('should close mobile menu after navigation', async ({ page, viewport }) => {
    // Only run this test on mobile
    test.skip(!isMobileViewport(viewport?.width), 'This test is for mobile viewports only');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open hamburger menu
    await page.getByRole('button', { name: /open menu/i }).click();
    await page.waitForTimeout(200);

    // Reconciliation link should be visible in the nav drawer
    const reconciliationLink = page.locator('nav').getByRole('link', { name: 'Reconciliation', exact: true });
    await expect(reconciliationLink).toBeVisible();

    // Click a navigation link
    await reconciliationLink.click();

    // Should navigate and menu should be closed
    await expect(page).toHaveURL('/reconciliation');

    // Menu should be closed (hamburger icon visible, not X)
    await expect(page.getByRole('button', { name: /open menu/i })).toBeVisible();
  });
});
