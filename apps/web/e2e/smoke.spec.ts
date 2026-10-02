import { expect, test } from '@playwright/test';
import { collectErrors } from './errors';

test('paints a stroke with the mouse', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Afterglow' })).toBeVisible();

  await page.getByRole('button', { name: 'Paint without the camera' }).click();
  const undo = page.getByRole('button', { name: 'Undo (Z)' });
  await expect(undo).toBeDisabled();

  await page.mouse.move(400, 400);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(400 + i * 15, 400 + Math.sin(i / 3) * 60);
  await page.mouse.up();

  await expect(undo).toBeEnabled();
  await page.keyboard.press('h');
  const strokes = page.getByRole('complementary', { name: 'Stats' }).locator('dt', { hasText: 'Strokes' });
  await expect(strokes.locator('xpath=following-sibling::dd')).toHaveText('1');
  expect(errors).toEqual([]);
});

test('explains a camera failure and offers a way forward', async ({ page }) => {
  await page.goto('/');
  // No camera permission is granted in this context, so the request fails.
  await page.getByRole('button', { name: 'Start painting' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Paint without the camera' })).toBeEnabled();
});

test('erases through a stroke with the mouse, and undoes the erase', async ({ page }) => {
  // Every mouse move renders a frame, which is slow on CI's software WebGL: few, long moves.
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Paint without the camera' }).click();

  // A horizontal line, then the eraser dragged down through its middle.
  await page.mouse.move(300, 400);
  await page.mouse.down();
  for (let i = 1; i <= 9; i++) await page.mouse.move(300 + i * 50, 400);
  await page.mouse.up();
  await page.getByRole('button', { name: /^Eraser/ }).click();
  await expect(page.getByText('Eraser: drag over lines to erase them')).toBeVisible();
  await page.mouse.move(525, 330);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) await page.mouse.move(525, 330 + i * 35);
  await page.mouse.up();

  await page.keyboard.press('h');
  const strokes = page
    .getByRole('complementary', { name: 'Stats' })
    .locator('dt', { hasText: 'Strokes' })
    .locator('xpath=following-sibling::dd');
  // Erased through the middle: two pieces.
  await expect(strokes).toHaveText('2');
  await page.getByRole('button', { name: 'Undo (Z)' }).click();
  await expect(strokes).toHaveText('1');
  await page.getByRole('button', { name: 'Redo (Shift Z)' }).click();
  await expect(strokes).toHaveText('2');
  expect(errors).toEqual([]);
});

// GPU resources are released: after drawing (including a ribbon), erasing, undoing, and
// clearing, the geometries held on the GPU are back where they started.
test('frees GPU geometry when strokes go away', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Paint without the camera' }).click();
  await page.keyboard.press('h');
  const stats = page.getByRole('complementary', { name: 'Stats' });
  const value = (label: string) => stats.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd');
  const geometries = value('GPU geometries');
  const clear = async () => {
    await page.getByRole('button', { name: 'Clear, press twice (Delete)' }).click();
    await page.getByRole('button', { name: 'Clear, press twice (Delete)' }).click();
    await expect(value('Strokes')).toHaveText('0');
  };
  const line = async (y: number) => {
    await page.mouse.move(300, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(300 + i * 50, y + (i % 2) * 20);
    await page.mouse.up();
  };
  /** The panel's value once it has held still for a second (it updates 4 times a second, later on a slow machine). */
  const settled = async () => {
    let last = await geometries.textContent();
    for (let tries = 0; tries < 20; tries++) {
      await page.waitForTimeout(1000);
      const now = await geometries.textContent();
      if (now === last) return now;
      last = now;
    }
    return last;
  };
  // The baseline is a steady state: one stroke drawn and cleared (the intro's leftovers are gone).
  await line(300);
  await clear();
  const baseline = await settled();

  await line(300);
  await page.getByRole('button', { name: 'Ribbon (B)' }).click();
  await line(400);
  await expect(value('Strokes')).toHaveText('2');
  await page.getByRole('button', { name: /^Eraser/ }).click();
  await page.mouse.move(500, 250);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) await page.mouse.move(500, 250 + i * 50);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Undo (Z)' }).click();
  await page.getByRole('button', { name: 'Redo (Shift Z)' }).click();
  await clear();
  // A leak would never come back down to the baseline.
  await expect.poll(() => geometries.textContent(), { timeout: 20_000 }).toBe(baseline);
  expect(errors).toEqual([]);
});
