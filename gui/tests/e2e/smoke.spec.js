// Basic smoke tests to ensure app boots and core UI renders
import { test, expect } from '@playwright/test';

test.describe('App smoke', () => {
  test('loads home page and mounts Vue app', async ({ page }) => {
    await page.goto('/');

    // Vue mount point exists and receives content
    await expect(page.locator('#app')).toBeVisible();

    // Title set by index.html
    await expect(page).toHaveTitle(/QuantumSavory Studio/i);
  });

  test('renders top-level panels and map shell', async ({ page }) => {
    await page.goto('/');

    // Check for elements that should reliably exist on initial render
    // Using stable selectors: ids, roles, or text that is unlikely to change
    await expect(page.locator('#app')).toBeVisible();

    // Verify map container renders (BaseMap is used in App.vue)
    const mapCanvas = page.locator('canvas');
    await expect(mapCanvas.first()).toBeVisible({ timeout: 15_000 });
  });
});

