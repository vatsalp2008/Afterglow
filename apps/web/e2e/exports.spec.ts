import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// Every mouse move renders a frame, which is slow on CI's software WebGL: few, long moves.
async function drawLine(page: Page, y: number): Promise<void> {
  await page.mouse.move(300, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(300 + i * 60, y + (i % 2) * 30);
  await page.mouse.up();
}

const strokeCount = (page: Page) =>
  page
    .getByRole('complementary', { name: 'Stats' })
    .locator('dt', { hasText: 'Strokes' })
    .locator('xpath=following-sibling::dd');

/** Runs an item from the dock's save list and returns the file it downloads. */
async function saveFrom(page: Page, item: RegExp): Promise<Buffer> {
  await page.getByRole('button', { name: 'Save and open' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: item }).click(),
  ]);
  return readFile(await download.path());
}

async function openFile(page: Page, file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  await page.getByRole('button', { name: 'Save and open' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /^Open a drawing file/ }).click(),
  ]);
  await chooser.setFiles(file);
}

test('saves an image, a vector image, and a drawing file that opens again', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Paint with a mouse instead' }).click();
  await drawLine(page, 300);
  await drawLine(page, 450);
  await page.keyboard.press('h');
  await expect(strokeCount(page)).toHaveText('2');

  const png = await saveFrom(page, /^Save image/);
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const svg = (await saveFrom(page, /^Save vector image/)).toString('utf8');
  const parsed = await page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    return { broken: doc.querySelector('parsererror') !== null, strokes: doc.querySelectorAll('[data-stroke]').length };
  }, svg);
  expect(parsed).toEqual({ broken: false, strokes: 2 });

  const drawing = await saveFrom(page, /^Save drawing file/);
  expect(JSON.parse(drawing.toString('utf8'))).toMatchObject({ format: 'afterglow.drawing', version: 1 });

  // Clear, open the saved file, and undo the open.
  const clear = page.getByRole('button', { name: 'Clear, press twice (Delete)' });
  await clear.click();
  await clear.click();
  await expect(strokeCount(page)).toHaveText('0');
  await openFile(page, { name: 'drawing.json', mimeType: 'application/json', buffer: drawing });
  await expect(page.getByText('Opened a drawing with 2 strokes.')).toBeVisible();
  await expect(strokeCount(page)).toHaveText('2');
  await page.getByRole('button', { name: 'Undo (Z)' }).click();
  await expect(strokeCount(page)).toHaveText('0');
  expect(errors).toEqual([]);
});

test('explains a file that is not a drawing, and opens one dropped on the page', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Paint with a mouse instead' }).click();
  await page.keyboard.press('h');

  await openFile(page, { name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"notes":[]}') });
  await expect(page.getByText(/isn.t an Afterglow drawing/)).toBeVisible();
  await expect(strokeCount(page)).toHaveText('0');

  // Dropped on the page: the studio opens it instead of the browser navigating away.
  const drawing = {
    format: 'afterglow.drawing',
    version: 1,
    frame: { width: 1600, height: 900 },
    strokes: [
      {
        id: 'a',
        brush: 'neon',
        color: '#FFB547',
        size: 11,
        createdAt: 0,
        points: [
          { x: 500, y: 400, depth: 1, t: 0 },
          { x: 900, y: 420, depth: 1, t: 200 },
        ],
      },
    ],
  };
  await page.evaluate((text) => {
    const data = new DataTransfer();
    data.items.add(new File([text], 'drawing.json', { type: 'application/json' }));
    const canvas = document.querySelector('canvas')!;
    for (const type of ['dragover', 'drop']) {
      canvas.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }));
    }
  }, JSON.stringify(drawing));
  await expect(page.getByText('Opened a drawing with 1 stroke.')).toBeVisible();
  await expect(strokeCount(page)).toHaveText('1');
  await expect(page).toHaveURL(/127\.0\.0\.1/);
  expect(errors).toEqual([]);
});
