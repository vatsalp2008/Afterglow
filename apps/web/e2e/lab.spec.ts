import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// The Filter Lab must report the same numbers as docs/benchmarks.md.
const cell = (page: Page, filter: string, column: number) =>
  page
    .getByRole('row', { name: new RegExp(filter) })
    .getByRole('cell')
    .nth(column);

test('the Filter Lab measures jitter and lag as the benchmarks do', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/lab/?fixture=01-still-hand');
  await expect(page.getByRole('heading', { name: 'Filter Lab' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Pen x over time for 01-still-hand/ })).toBeVisible();
  // Cells: show, jitter, lag (the filter name is the row header).
  await expect(cell(page, 'One Euro', 1)).toHaveText('0.24');
  await expect(cell(page, 'None', 1)).toHaveText('0.44');

  await page.getByRole('combobox', { name: /^Recording/ }).selectOption('03-fast-zigzag');
  await expect(page.getByRole('img', { name: /03-fast-zigzag/ }).first()).toBeVisible();
  await expect(cell(page, 'One Euro', 2)).toHaveText('20');
  await expect(cell(page, 'Kalman', 2)).toHaveText('115');
  // No still stretch is labeled, so jitter isn't reported.
  await expect(cell(page, 'One Euro', 1)).toHaveText('–');

  // Retuning a filter updates its readout.
  await page.getByRole('group', { name: 'EMA' }).getByLabel('Time constant').fill('100');
  await expect(cell(page, 'EMA', 2)).toHaveText('59');
  expect(errors).toEqual([]);
});
