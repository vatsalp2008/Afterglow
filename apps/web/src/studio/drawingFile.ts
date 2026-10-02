// Choosing and reading drawing files (ADR 0012). The format and its checks live in
// core (drawing.ts); this is the browser side: the file picker, drops, and the copy.

import type { DrawingProblem } from '@afterglow/core';

/** Larger files are refused before reading. A long session is a small fraction of this. */
export const MAX_DRAWING_BYTES = 20 * 1024 * 1024;

export const OPEN_PROBLEM_COPY: Record<DrawingProblem | 'unreadable' | 'empty', string> = {
  notDrawing: 'That file isn’t an Afterglow drawing.',
  newerVersion: 'That drawing was saved by a newer version of Afterglow. Reload the page and try again.',
  tooLarge: 'That drawing is too large to open.',
  damaged: 'That drawing file is damaged and can’t be opened.',
  unreadable: 'That file couldn’t be read.',
  empty: 'That drawing has no strokes in it.',
};

/**
 * Opens the file picker; resolves to null if it's dismissed. Browsers only show it in
 * response to a click or a key press, so there's no gesture for it.
 */
export function pickDrawingFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

/** True while something dragged over the page carries files. */
export const carriesFiles = (e: DragEvent): boolean => e.dataTransfer?.types.includes('Files') ?? false;
