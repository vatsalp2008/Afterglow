import { describe, expect, it } from 'vitest';
import { fileName, slug, stamp } from './download';

describe('stamp', () => {
  it('uses local time, padded', () => {
    expect(stamp(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02-03-04-05');
  });
});

describe('file names', () => {
  it('carry the drawing’s name when it has one', () => {
    expect(slug('Smiley face!')).toBe('smiley-face');
    expect(fileName('png')).toMatch(/^afterglow-\d{4}(-\d\d){5}\.png$/);
    expect(fileName('png', 'light bulb')).toMatch(/^afterglow-light-bulb-\d{4}/);
    expect(fileName('webm', 'cat', 'timelapse')).toMatch(/^afterglow-timelapse-cat-\d{4}.*\.webm$/);
  });
});
