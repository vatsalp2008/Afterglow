import { describe, expect, it } from 'vitest';
import { cameraConstraints, classifyCameraError } from './camera';

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

describe('cameraConstraints', () => {
  it('defaults to the user-facing camera at 640x480', () => {
    expect(cameraConstraints()).toEqual({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 } },
    });
  });

  it('pins a chosen device and resolution', () => {
    expect(cameraConstraints({ deviceId: 'abc', resolution: '1280x720' }).video).toEqual({
      deviceId: { exact: 'abc' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60 },
    });
  });
});
