// apps/web/tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Public application shell', () => {
  test('loads the home page', async ({ page }) => {
    await page.goto('/');

    // Check that the page loads
    await expect(page).toHaveTitle(/DevDocs/i);
  });

});
