import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
  // Helper to check if we're in a mobile viewport
  const isMobileViewport = (viewportWidth: number | undefined) =>
    viewportWidth !== undefined && viewportWidth < 768;

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

  test('should display quick actions section with functional buttons', async ({ page }) => {
    await expect(page.getByText(/quick actions/i)).toBeVisible();

    // Quick actions should contain clickable elements
    // Check for "View All Atoms" link
    const viewAtomsLink = page.getByRole('link', { name: /view all atoms/i });
    if (await viewAtomsLink.isVisible()) {
      // Test that clicking navigates to atoms page
      await viewAtomsLink.click();
      await expect(page).toHaveURL('/atoms');
      // Go back for other tests
      await page.goto('/');
    }
  });

  test('should have functional New Atom button from dashboard', async ({ page, viewport }) => {
    // Wait for page to fully hydrate
    await page.waitForLoadState('networkidle');

    if (isMobileViewport(viewport?.width)) {
      // On mobile, open hamburger menu first
      const menuButton = page.getByRole('button', { name: /open menu/i });
      await expect(menuButton).toBeVisible({ timeout: 10000 });
      await menuButton.click();
      // Wait for menu animation
      await page.waitForTimeout(200);
      // Find the New Atom button in the mobile menu
      const newAtomButton = page.locator('nav button').filter({ hasText: 'New Atom' });
      await expect(newAtomButton).toBeVisible({ timeout: 10000 });
      await newAtomButton.click();
    } else {
      // On desktop, the New Atom button is directly visible in the header
      const header = page.locator('header');
      const newAtomButton = header.getByRole('button', { name: 'New Atom', exact: true });
      await expect(newAtomButton).toBeVisible({ timeout: 10000 });
      await newAtomButton.click();
    }

    // Verify dialog opens
    await expect(page.getByRole('heading', { name: /create intent atom/i }).first()).toBeVisible();
  });

  test('should have header without sidebar', async ({ page }) => {
    // Dashboard shows header but no sidebar
    await expect(page.getByRole('link', { name: /pact/i })).toBeVisible();

    // No sidebar should be visible
    const sidebar = page.locator('aside');
    await expect(sidebar).not.toBeVisible();
  });
});
