import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { collectErrors } from './errors';

// The studio without a pointing device for its controls: everything but the drawing
// itself is reachable from the keyboard.
test('runs the studio from the keyboard', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.goto('/');
  const noCamera = page.getByRole('button', { name: 'Paint without the camera' });
  for (let i = 0; i < 5 && !(await noCamera.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(noCamera).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('navigation', { name: 'Tools' })).toBeVisible();

  // Help lists the keys first without a camera.
  await page.keyboard.press('?');
  const help = page.getByRole('region', { name: 'Help' });
  await expect(help).toBeVisible();
  await expect(help.getByRole('heading', { level: 3 }).first()).toHaveText('Keys');
  await expect(help.getByText('Save vector image')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();

  await page.keyboard.press('2');
  await expect(page.getByRole('button', { name: 'Tungsten' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('b');
  await expect(page.getByRole('button', { name: 'Sparks (B)' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('e');
  await expect(page.getByRole('button', { name: 'Draw (E)' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('e');
  await page.keyboard.press(']');
  await expect(page.getByRole('button', { name: 'Thick ([ and ])' })).toHaveAttribute('aria-pressed', 'true');

  // Saving with nothing drawn says so instead of doing nothing.
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByText('Nothing to save yet. Draw something first.')).toBeVisible();

  await page.mouse.move(300, 300);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(300 + i * 60, 300 + (i % 2) * 30);
  await page.mouse.up();
  // The dock catches up with the new stroke on the next frame (slow on software WebGL).
  await expect(page.getByRole('button', { name: 'Undo (Z)' })).toBeEnabled();

  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('ControlOrMeta+s')]);
  expect(download.suggestedFilename()).toMatch(/^afterglow-[\d-]+\.json$/);
  expect(JSON.parse(await readFile(await download.path(), 'utf8'))).toMatchObject({ strokes: [{ brush: 'sparks' }] });

  // The dock's save list: opened, walked with the arrows, and closed with Esc.
  const saveButton = page.getByRole('button', { name: 'Save and open' });
  await saveButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Save image/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: /^Save vector image/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Save vector image/ })).toBeHidden();
  await expect(saveButton).toBeFocused();

  await page.keyboard.press('z');
  await page.keyboard.press('h');
  const strokes = page
    .getByRole('complementary', { name: 'Stats' })
    .locator('dt', { hasText: 'Strokes' })
    .locator('xpath=following-sibling::dd');
  await expect(strokes).toHaveText('0');
  await page.keyboard.press('Shift+Z');
  await expect(strokes).toHaveText('1');
  expect(errors).toEqual([]);
});
