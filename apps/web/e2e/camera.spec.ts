import { expect, test } from '@playwright/test';
import { collectErrors } from './errors';

// Runs in the "camera" project, where Chrome's fake webcam shows a real hand
// (see e2e/assets). Loads the real MediaPipe model, so it needs the network.
test('tracks a hand from the camera in a worker', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('/');
  // Permission is already granted, so the camera starts without a click (hands only).
  await expect(page.getByRole('navigation', { name: 'Tools' })).toBeVisible({ timeout: 60_000 });

  await page.keyboard.press('h');
  const stats = page.getByRole('complementary', { name: 'Stats' });
  await expect(stats.getByText(/ hand$/).first()).toBeVisible({ timeout: 45_000 });
  const tracking = stats.locator('dt', { hasText: /^Tracking$/ }).locator('xpath=following-sibling::dd');
  await expect(tracking).toContainText('worker');
  expect(errors).toEqual([]);
});
