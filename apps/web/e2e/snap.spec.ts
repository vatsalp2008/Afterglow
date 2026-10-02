import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

/** A rough circle with the mouse: few, long moves, which software WebGL on CI can keep up with. */
async function drawCircle(page: Page): Promise<void> {
  const at = (k: number) => {
    const a = (k / 24) * 2 * Math.PI * 1.06;
    const r = 150 + 6 * Math.sin(k * 1.7);
    return { x: 640 + r * Math.cos(a), y: 360 + r * Math.sin(a) };
  };
  await page.mouse.move(at(0).x, at(0).y);
  await page.mouse.down();
  for (let k = 1; k <= 24; k++) await page.mouse.move(at(k).x, at(k).y);
  await page.mouse.up();
}

test('snaps a rough circle, and undo keeps it as drawn', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Paint without the camera' }).click();
  await page.keyboard.press('h');
  const strokes = page
    .getByRole('complementary', { name: 'Stats' })
    .locator('dt', { hasText: 'Strokes' })
    .locator('xpath=following-sibling::dd');
  await expect(page.getByRole('button', { name: 'Snap shapes (G)' })).toHaveAttribute('aria-pressed', 'true');

  await drawCircle(page);
  await expect(page.getByText('Snapped to a circle. Undo keeps it as drawn.')).toBeVisible();
  await expect(strokes).toHaveText('1');
  // The first undo brings back the stroke as drawn, the second removes it.
  await page.keyboard.press('z');
  await expect(strokes).toHaveText('1');
  await page.keyboard.press('z');
  await expect(strokes).toHaveText('0');

  await page.keyboard.press('g');
  await expect(page.getByRole('button', { name: 'Snap shapes (G)' })).toHaveAttribute('aria-pressed', 'false');
  await drawCircle(page);
  await expect(strokes).toHaveText('1');
  await page.keyboard.press('z');
  await expect(strokes).toHaveText('0');
  expect(errors).toEqual([]);
});
