import { describe, expect, it } from 'vitest';
import { classifyCameraError } from './camera';

describe('classifyCameraError', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'notFound'],
    ['OverconstrainedError', 'notFound'],
    ['NotReadableError', 'inUse'],
    ['AbortError', 'inUse'],
    ['SomethingElse', 'unknown'],
  ])('maps %s to %s', (name, kind) => {
    expect(classifyCameraError(new DOMException('x', name)).kind).toBe(kind);
  });

  it('treats non-DOM errors as unknown', () => {
    expect(classifyCameraError(new Error('boom')).kind).toBe('unknown');
  });
});
