import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

async function draw(page: Page, points: Array<[number, number]>): Promise<void> {
  await page.mouse.move(...points[0]!);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(...p, { steps: 2 });
  await page.mouse.up();
}

// The doodle model runs on device (onnxruntime-web, loaded on first use): a house drawn
// with the mouse is guessed, accepting names the drawing, and saved files carry the name.
test('guesses a doodle, and accepting it names the drawing', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Paint without the camera' }).click();
  // Keep the walls as drawn, so the strokes are a doodle, not a snapped rectangle.
  await page.keyboard.press('g');
  await draw(page, [
    [500, 350],
    [500, 550],
    [750, 550],
    [750, 350],
    [500, 350],
  ]);
  await draw(page, [
    [480, 360],
    [625, 230],
    [770, 360],
  ]);
  await draw(page, [
    [600, 550],
    [600, 460],
    [650, 460],
    [650, 550],
  ]);

  const guess = page.getByRole('button', { name: 'Name it house (Y)' });
  // Settling takes 1.5 s; the model's first load takes a few more on CI.
  await expect(guess).toBeVisible({ timeout: 30_000 });
  await expect(guess).toHaveText('Looks like a house?');
  await guess.click();
  await expect(page.getByText('Named it “house”')).toBeVisible();
  await expect(guess).toBeHidden();

  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('ControlOrMeta+s')]);
  expect(download.suggestedFilename()).toMatch(/^afterglow-house-[\d-]+\.json$/);
  expect(JSON.parse(await readFile(await download.path(), 'utf8'))).toMatchObject({ title: 'house' });
  expect(errors).toEqual([]);
});
