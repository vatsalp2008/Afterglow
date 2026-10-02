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

// The camera ending mid-session (unplugged, or taken by another app) is simulated with the
// track's own "ended" event.
test('keeps the drawing when the camera stops, and reconnects or carries on', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Tools' })).toBeVisible({ timeout: 60_000 });
  const endCamera = () =>
    page.evaluate(() => {
      const stream = document.querySelector('video')?.srcObject as MediaStream | null;
      stream?.getVideoTracks()[0]?.dispatchEvent(new Event('ended'));
    });

  await endCamera();
  const card = page.getByRole('alertdialog', { name: 'The camera stopped' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'Reconnect camera' })).toBeFocused();
  await card.getByRole('button', { name: 'Reconnect camera' }).click();
  await expect(page.getByText('Camera reconnected')).toBeVisible({ timeout: 30_000 });
  await expect(card).toBeHidden();
  await page.keyboard.press('h');
  const stats = page.getByRole('complementary', { name: 'Stats' });
  await expect(stats.getByText(/ hand$/).first()).toBeVisible({ timeout: 45_000 });

  await endCamera();
  await card.getByRole('button', { name: 'Keep painting without the camera' }).click();
  await expect(card).toBeHidden();
  await page.mouse.move(400, 300);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(400 + i * 60, 300);
  await page.mouse.up();
  const strokes = stats.locator('dt', { hasText: 'Strokes' }).locator('xpath=following-sibling::dd');
  await expect(strokes).toHaveText('1');
  expect(errors).toEqual([]);
});

// The watchdog: no tracker frames for a few seconds while the camera is on. A paused
// video stops the frames.
test('notices when hand tracking stops, and restarts it', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Tools' })).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.querySelector('video')?.pause());

  const card = page.getByRole('alertdialog', { name: 'Hand tracking stopped' });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole('button', { name: 'Restart hand tracking' }).click();
  await expect(page.getByText('Hand tracking restarted')).toBeVisible({ timeout: 60_000 });
  await expect(card).toBeHidden();
  await page.keyboard.press('h');
  const stats = page.getByRole('complementary', { name: 'Stats' });
  await expect(stats.getByText(/ hand$/).first()).toBeVisible({ timeout: 45_000 });
  expect(errors).toEqual([]);
});
