import { expect, test } from '@playwright/test';
import { collectErrors } from './errors';

test('paints a stroke with the mouse', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Afterglow' })).toBeVisible();

  await page.getByRole('button', { name: 'Paint with a mouse instead' }).click();
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
  await expect(page.getByRole('button', { name: 'Paint with a mouse instead' })).toBeEnabled();
});

test('erases through a stroke with the mouse, and undoes the erase', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Paint with a mouse instead' }).click();

  // A horizontal line, then the eraser dragged down through its middle.
  await page.mouse.move(300, 400);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) await page.mouse.move(300 + i * 15, 400);
  await page.mouse.up();
  await page.getByRole('button', { name: /^Eraser/ }).click();
  await expect(page.getByText('Eraser: drag over lines to erase them')).toBeVisible();
  await page.mouse.move(525, 330);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) await page.mouse.move(525, 330 + i * 10);
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
