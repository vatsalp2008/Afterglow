import { expect, test } from '@playwright/test';
import { collectErrors } from './errors';

// Deterministic hand input: replays a recorded session through the full
// pipeline (filter, pinch state machine, strokes, renderer). No camera needed.
test('replays a recorded session into strokes', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.goto('/?fixture=04-pinch-on-off');
  await expect(page.getByRole('navigation', { name: 'Tools' })).toBeVisible();
  await expect(page.getByText('Fixture 04-pinch-on-off finished')).toBeVisible({ timeout: 30_000 });

  await page.keyboard.press('h');
  const strokes = page.getByRole('complementary', { name: 'Stats' }).locator('dt', { hasText: 'Strokes' });
  // The recording holds 7 pinch-and-release cycles (see fixtures/sessions/README.md).
  await expect(strokes.locator('xpath=following-sibling::dd')).toHaveText('7');
  expect(errors).toEqual([]);
});
