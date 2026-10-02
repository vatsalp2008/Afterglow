import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

test.use({ hasTouch: true });

const strokeCount = (page: Page) =>
  page
    .getByRole('complementary', { name: 'Stats' })
    .locator('dt', { hasText: 'Strokes' })
    .locator('xpath=following-sibling::dd');

test('paints a stroke per finger, and a dot for a tap', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Paint without the camera' }).tap();
  await page.keyboard.press('h');
  await expect(strokeCount(page)).toHaveText('0');

  // Playwright's touchscreen taps with one finger; several at once go through CDP.
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<[number, number]>) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });

  // Two fingers moving apart, as a pinch-to-zoom would: two strokes, and the page stays put.
  await touch('touchStart', [
    [500, 300],
    [500, 500],
  ]);
  for (let i = 1; i <= 6; i++) {
    await touch('touchMove', [
      [500 + i * 40, 300 - i * 15],
      [500 + i * 40, 500 + i * 15],
    ]);
  }
  await touch('touchEnd', []);
  await expect(strokeCount(page)).toHaveText('2');
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);

  await page.touchscreen.tap(300, 200);
  await expect(strokeCount(page)).toHaveText('3');
  await page.getByRole('button', { name: 'Undo (Z)' }).tap();
  await expect(strokeCount(page)).toHaveText('2');
  expect(errors).toEqual([]);
});
