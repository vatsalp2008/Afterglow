import { describe, expect, it } from 'vitest';
import {
  canvasToScreen,
  coverFit,
  frameForAspect,
  landmarkToView,
  screenToCanvas,
  visibleCanvasRect,
} from './coords.ts';

describe('coords', () => {
  it('mirrors x when going from landmark to view space', () => {
    expect(landmarkToView({ x: 0.2, y: 0.3, z: -0.1 })).toEqual({ x: 0.8, y: 0.3, z: -0.1 });
  });

  it('round-trips canvas and screen through the cover fit', () => {
    const fit = coverFit(frameForAspect(4 / 3), { width: 1920, height: 1080 });
    const p = { x: 412.5, y: 777 };
    const back = screenToCanvas(canvasToScreen(p, fit), fit);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it('crops top and bottom when the viewport is wider than the frame', () => {
    const frame = frameForAspect(4 / 3);
    const r = visibleCanvasRect(frame, { width: 1920, height: 1080 });
    expect(r.left).toBeCloseTo(0, 9);
    expect(r.right).toBeCloseTo(frame.width, 9);
    expect(r.top).toBeGreaterThan(0);
    expect(r.bottom - r.top).toBeCloseTo(frame.width / (1920 / 1080), 6);
  });
});
