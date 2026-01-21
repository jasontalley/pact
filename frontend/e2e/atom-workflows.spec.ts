import { test, expect } from '@playwright/test';

/**
 * Atom Workflow E2E Tests
 *
 * These tests verify actual button FUNCTIONALITY, not just presence.
 * They test the complete user flows for creating, editing, and managing atoms.
 */
test.describe('Atom Workflows', () => {
  // Helper to check if we're in a mobile viewport
  const isMobileViewport = (viewportWidth: number | undefined) =>
    viewportWidth !== undefined && viewportWidth < 768;

  // Helper to find and click the New Atom button (handles mobile/desktop)
  async function clickNewAtomButton(
    page: import('@playwright/test').Page,
    viewport: { width: number; height: number } | null | undefined
  ) {
    if (isMobileViewport(viewport?.width)) {
      // On mobile, open hamburger menu first
      await page.getByRole('button', { name: /open menu/i }).click();
      // Wait for menu animation
      await page.waitForTimeout(200);
      // On mobile, use the button in the navigation drawer (not Quick Actions)
      const newAtomButton = page.locator('nav button').filter({ hasText: 'New Atom' });
      await expect(newAtomButton).toBeVisible({ timeout: 10000 });
      await newAtomButton.click();
    } else {
      // On desktop, use the header button with exact text match
      const header = page.locator('header');
      const newAtomButton = header.getByRole('button', { name: 'New Atom', exact: true });
      await expect(newAtomButton).toBeVisible({ timeout: 10000 });
      await newAtomButton.click();
    }
  }

  test.describe('New Atom Button', () => {
    test('clicking New Atom button opens the create dialog', async ({ page, viewport }) => {
      await page.goto('/');
      // Wait for page to fully hydrate
      await page.waitForLoadState('networkidle');

      await clickNewAtomButton(page, viewport);

      // Verify the dialog opens - look for the dialog title
      await expect(page.getByRole('heading', { name: /create intent atom/i }).first()).toBeVisible();

      // Verify Step 1 is shown (raw intent input)
      // Use .first() because dialog may be rendered in both mobile and desktop versions
      await expect(page.getByText(/step 1 of 3/i).first()).toBeVisible();
      await expect(page.getByPlaceholder(/example:/i).first()).toBeVisible();
    });

    test('cancel button closes the create dialog', async ({ page, viewport }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Open the dialog
      await clickNewAtomButton(page, viewport);
      await expect(page.getByRole('heading', { name: /create intent atom/i }).first()).toBeVisible();

      // Click cancel - find the button in the visible dialog (not hidden mobile version)
      // The dialog uses role="dialog", so we can scope to it
      const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /create intent atom/i }) });
      await dialog.getByRole('button', { name: /cancel/i }).click();

      // Verify dialog is closed
      await expect(page.getByRole('heading', { name: /create intent atom/i }).first()).not.toBeVisible();
    });

    test('analyze button is disabled when input is too short', async ({ page, viewport }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Open the dialog
      await clickNewAtomButton(page, viewport);

      // Get the analyze button - should be disabled initially
      const analyzeButton = page.getByRole('button', { name: /analyze intent/i }).first();
      await expect(analyzeButton).toBeDisabled();

      // Enter text that's too short (less than 10 characters)
      await page.getByPlaceholder(/example:/i).first().fill('short');

      // Button should still be disabled
      await expect(analyzeButton).toBeDisabled();
    });

    test('analyze button is enabled when input is sufficient', async ({ page, viewport }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Open the dialog
      await clickNewAtomButton(page, viewport);

      // Enter valid intent (10+ characters)
      await page.getByPlaceholder(/example:/i).first().fill('User can log in with email and password');

      // Analyze button should now be enabled
      const analyzeButton = page.getByRole('button', { name: /analyze intent/i }).first();
      await expect(analyzeButton).toBeEnabled();
    });

    test('clicking analyze with valid input shows analyzing state', async ({ page, viewport }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Open the dialog
      await clickNewAtomButton(page, viewport);

      // Enter valid intent
      await page.getByPlaceholder(/example:/i).first().fill('User can log in with email and password and view dashboard');

      // Click analyze - the button text should change to "Analyzing..."
      const analyzeButton = page.getByRole('button', { name: /analyze intent/i }).first();
      await analyzeButton.click();

      // Should show loading state (either "Analyzing..." text or button becomes disabled)
      // Note: The actual API call may succeed or fail depending on backend state
      // We're testing that the click triggers the expected UI state change
      await expect(
        page.getByRole('button', { name: /analyzing/i }).first().or(page.getByText(/step 2 of 3/i).first())
      ).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Edit Button on Atom Detail', () => {
    test.beforeEach(async ({ page }) => {
      // Create a draft atom via API for testing
      // First navigate to atoms list to ensure we have atoms
      await page.goto('/atoms');
    });

    test('edit button opens edit dialog for draft atoms', async ({ page }) => {
      // Navigate to atoms list
      await page.goto('/atoms');

      // Find and click on a draft atom card (if exists)
      // First check if any atoms exist
      const atomCards = page.locator('[class*="rounded-lg border"]').filter({
        has: page.getByText(/^IA-/),
      });

      const atomCount = await atomCards.count();
      if (atomCount === 0) {
        // Skip if no atoms exist - this is expected in fresh environments
        test.skip();
        return;
      }

      // Click on the first atom card to go to detail page
      await atomCards.first().click();

      // Wait for detail page to load
      await expect(page.getByRole('link', { name: /back to atoms/i })).toBeVisible();

      // Check if Edit button exists (only for draft atoms)
      const editButton = page.getByRole('button', { name: /^edit$/i });
      const editButtonVisible = await editButton.isVisible().catch(() => false);

      if (!editButtonVisible) {
        // This atom might be committed, skip the test
        test.skip();
        return;
      }

      // Click Edit button
      await editButton.click();

      // Verify edit dialog opens
      await expect(page.getByRole('heading', { name: /edit atom/i })).toBeVisible();
      await expect(page.getByLabel(/description/i)).toBeVisible();
      await expect(page.getByLabel(/category/i)).toBeVisible();
    });

    test('edit dialog cancel button closes without saving', async ({ page }) => {
      await page.goto('/atoms');

      const atomCards = page.locator('[class*="rounded-lg border"]').filter({
        has: page.getByText(/^IA-/),
      });

      const atomCount = await atomCards.count();
      if (atomCount === 0) {
        test.skip();
        return;
      }

      await atomCards.first().click();
      await expect(page.getByRole('link', { name: /back to atoms/i })).toBeVisible();

      const editButton = page.getByRole('button', { name: /^edit$/i });
      const editButtonVisible = await editButton.isVisible().catch(() => false);

      if (!editButtonVisible) {
        test.skip();
        return;
      }

      // Open edit dialog
      await editButton.click();
      await expect(page.getByRole('heading', { name: /edit atom/i })).toBeVisible();

      // Modify the description
      const descriptionField = page.getByLabel(/description/i);
      const originalText = await descriptionField.inputValue();
      await descriptionField.fill('Modified text that should not be saved');

      // Click cancel
      await page.getByRole('button', { name: /cancel/i }).first().click();

      // Dialog should close
      await expect(page.getByRole('heading', { name: /edit atom/i })).not.toBeVisible();

      // Re-open to verify original text is preserved
      await editButton.click();
      await expect(page.getByLabel(/description/i)).toHaveValue(originalText);
    });
  });

  test.describe('Commit Button', () => {
    test('commit button shows confirmation dialog', async ({ page }) => {
      await page.goto('/atoms');

      // Find an atom card
      const atomCards = page.locator('[class*="rounded-lg border"]').filter({
        has: page.getByText(/^IA-/),
      });

      const atomCount = await atomCards.count();
      if (atomCount === 0) {
        test.skip();
        return;
      }

      await atomCards.first().click();
      await expect(page.getByRole('link', { name: /back to atoms/i })).toBeVisible();

      // Look for Commit button (only visible for draft atoms with quality >= 80)
      const commitButton = page.getByRole('button', { name: /^commit$/i });
      const commitButtonVisible = await commitButton.isVisible().catch(() => false);

      if (!commitButtonVisible) {
        // Atom may not be eligible for commit (not draft or quality < 80)
        test.skip();
        return;
      }

      // Click Commit
      await commitButton.click();

      // Should show confirmation dialog with warning
      await expect(page.getByRole('heading', { name: /commit intent atom/i })).toBeVisible();
      await expect(page.getByText(/permanent/i)).toBeVisible();
      await expect(page.getByText(/cannot be edited or deleted/i)).toBeVisible();

      // Checkbox for acknowledgment should be present
      await expect(page.getByRole('checkbox')).toBeVisible();
    });

    test('commit confirmation requires checkbox acknowledgment', async ({ page }) => {
      await page.goto('/atoms');

      const atomCards = page.locator('[class*="rounded-lg border"]').filter({
        has: page.getByText(/^IA-/),
      });

      const atomCount = await atomCards.count();
      if (atomCount === 0) {
        test.skip();
        return;
      }

      await atomCards.first().click();

      const commitButton = page.getByRole('button', { name: /^commit$/i });
      const commitButtonVisible = await commitButton.isVisible().catch(() => false);

      if (!commitButtonVisible) {
        test.skip();
        return;
      }

      await commitButton.click();
      await expect(page.getByRole('heading', { name: /commit intent atom/i })).toBeVisible();

      // The "Commit Atom" button in dialog should be disabled without checkbox
      const confirmButton = page.getByRole('button', { name: /^commit atom$/i });
      await expect(confirmButton).toBeDisabled();

      // Check the acknowledgment checkbox
      await page.getByRole('checkbox').check();

      // Now the button should be enabled
      await expect(confirmButton).toBeEnabled();
    });
  });

  test.describe('Delete Button', () => {
    test('delete button shows confirmation dialog', async ({ page }) => {
      await page.goto('/atoms');

      const atomCards = page.locator('[class*="rounded-lg border"]').filter({
        has: page.getByText(/^IA-/),
      });

      const atomCount = await atomCards.count();
      if (atomCount === 0) {
        test.skip();
        return;
      }

      await atomCards.first().click();
      await expect(page.getByRole('link', { name: /back to atoms/i })).toBeVisible();

      // Look for Delete button (only visible for draft atoms)
      const deleteButton = page.getByRole('button', { name: /^delete$/i });
      const deleteButtonVisible = await deleteButton.isVisible().catch(() => false);

      if (!deleteButtonVisible) {
        test.skip();
        return;
      }

      // Click Delete
      await deleteButton.click();

      // Should show confirmation dialog
      await expect(page.getByRole('heading', { name: /delete atom/i })).toBeVisible();
      await expect(page.getByText(/cannot be undone/i)).toBeVisible();
    });

    test('delete confirmation cancel closes dialog without deleting', async ({ page }) => {
      await page.goto('/atoms');

      const atomCards = page.locator('[class*="rounded-lg border"]').filter({
        has: page.getByText(/^IA-/),
      });

      const atomCount = await atomCards.count();
      if (atomCount === 0) {
        test.skip();
        return;
      }

      await atomCards.first().click();

      const deleteButton = page.getByRole('button', { name: /^delete$/i });
      const deleteButtonVisible = await deleteButton.isVisible().catch(() => false);

      if (!deleteButtonVisible) {
        test.skip();
        return;
      }

      await deleteButton.click();
      await expect(page.getByRole('heading', { name: /delete atom/i })).toBeVisible();

      // Click Cancel
      await page.getByRole('button', { name: /cancel/i }).first().click();

      // Dialog should close, atom detail page should still be visible
      await expect(page.getByRole('heading', { name: /delete atom/i })).not.toBeVisible();
      await expect(page.getByRole('link', { name: /back to atoms/i })).toBeVisible();
    });
  });

  test.describe('Quick Actions on Dashboard', () => {
    test('quick action buttons are clickable and navigate correctly', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Find the Quick Actions section
      await expect(page.getByText(/quick actions/i)).toBeVisible();

      // Look for action buttons/links in the quick actions area
      const viewAllAtomsLink = page.getByRole('link', { name: /view all atoms/i });
      if (await viewAllAtomsLink.isVisible()) {
        await viewAllAtomsLink.click();
        await expect(page).toHaveURL('/atoms');
      }
    });

    test('new atom quick action opens create dialog', async ({ page, viewport }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Use the helper to click New Atom button (handles mobile/desktop)
      await clickNewAtomButton(page, viewport);
      await expect(page.getByRole('heading', { name: /create intent atom/i }).first()).toBeVisible();
    });
  });

  test.describe('Atoms List Page Actions', () => {
    test('clicking on atom card navigates to detail page', async ({ page }) => {
      await page.goto('/atoms');

      // Wait for atoms to load
      await page.waitForTimeout(1000);

      // Find atom cards with IA- prefix (actual atom identifiers)
      const atomIdLink = page.locator('a').filter({ hasText: /^IA-\d+/ }).first();

      if (await atomIdLink.isVisible()) {
        const atomId = await atomIdLink.textContent();
        await atomIdLink.click();

        // Should navigate to detail page
        await expect(page.getByRole('heading', { name: atomId || '' })).toBeVisible();
        await expect(page.getByRole('link', { name: /back to atoms/i })).toBeVisible();
      }
    });
  });
});
