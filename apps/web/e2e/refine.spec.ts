import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// Refine against a stand-in /api/refine (the real one calls Gemini, ADR 0016): what the
// studio sends, how the answer replaces the drawing in one undo step, and what it says
// when Refine can't finish.

const ART = {
  title: 'a house',
  paths: [{ d: 'M200 800 L200 450 L500 200 L800 450 L800 800 Z' }, { d: 'M420 800 V620 H580 V800' }],
  modelMs: 1800,
  attempts: 1,
};

async function sketch(page: Page): Promise<void> {
  for (const line of [
    [
      [480, 420],
      [480, 600],
      [760, 600],
      [760, 420],
      [480, 420],
    ],
    [
      [470, 430],
      [620, 300],
      [770, 430],
    ],
  ]) {
    await page.mouse.move(line[0]![0]!, line[0]![1]!);
    await page.mouse.down();
    for (const [x, y] of line.slice(1)) await page.mouse.move(x!, y!, { steps: 2 });
    await page.mouse.up();
  }
}

const strokeCount = (page: Page) =>
  page
    .getByRole('complementary', { name: 'Stats' })
    .locator('dt', { hasText: 'Strokes' })
    .locator('xpath=following-sibling::dd');

test('refines the drawing into clean art, in one undo step', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  let sent: { type: string | undefined; png: boolean } | null = null;
  await page.route('**/api/refine', async (route) => {
    const body = route.request().postDataBuffer();
    sent = {
      type: route.request().headers()['content-type'],
      png: body?.subarray(0, 4).toString('latin1') === '\x89PNG',
    };
    await route.fulfill({ json: ART });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Paint without the camera' }).click();
  await page.keyboard.press('g');
  await sketch(page);
  await page.keyboard.press('h');
  await expect(strokeCount(page)).toHaveText('2');

  await page.keyboard.press('r');
  await expect(page.getByText('Refined: a house. Undo brings back your sketch.')).toBeVisible();
  expect(sent).toEqual({ type: 'image/png', png: true });
  // Two paths, the first a closed subpath and the second open: two strokes.
  await expect(strokeCount(page)).toHaveText('2');
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('ControlOrMeta+s')]);
  expect(download.suggestedFilename()).toMatch(/^afterglow-a-house-/);
  await page.keyboard.press('z');
  await expect(page.getByRole('button', { name: 'Redo (Shift Z)' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('says calmly when Refine can’t finish, and keeps the drawing', async ({ page }) => {
  test.setTimeout(60_000);
  const answers = [
    { status: 429, json: { error: 'rateLimited', message: 'slow down' } },
    { status: 503, json: { error: 'notConfigured', message: 'no key' } },
    { status: 502, json: { error: 'invalidOutput', message: 'nonsense' } },
  ];
  await page.route('**/api/refine', async (route) => {
    const next = answers.shift()!;
    await route.fulfill({ status: next.status, json: next.json });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Paint without the camera' }).click();
  await sketch(page);
  await page.keyboard.press('h');
  for (const message of [
    'Refine is resting for a minute. Try again soon.',
    'Refine isn’t set up on this server yet.',
    'Refine couldn’t make sense of this one. Try again, or add a little more.',
  ]) {
    await expect(page.getByRole('button', { name: /^Refine/ })).toBeEnabled();
    await page.keyboard.press('r');
    await expect(page.getByText(message)).toBeVisible();
  }
  await expect(strokeCount(page)).not.toHaveText('0');
});
