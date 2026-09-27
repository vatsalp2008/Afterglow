// The only module that converts between coordinate spaces.
//
// 1. Landmark space: MediaPipe normalized coords of the unmirrored camera image.
// 2. View space: mirrored for display (x' = 1 - x), still normalized [0,1].
// 3. Canvas space: world units of the drawing. The frame is CANVAS_HEIGHT units
//    tall and keeps the source aspect ratio, so strokes are independent of the
//    window size.
// 4. Screen space: CSS pixels of the viewport. The frame is cover-fit to it.

import type { Vec2, Vec3 } from './types';

export const CANVAS_HEIGHT = 1000;

export interface FrameSize {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** screen = canvas * scale + offset */
export interface CoverFit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function frameForAspect(aspect: number): FrameSize {
  return { width: CANVAS_HEIGHT * aspect, height: CANVAS_HEIGHT };
}

export function landmarkToView(p: Vec3): Vec3 {
  return { x: 1 - p.x, y: p.y, z: p.z };
}

export function viewToCanvas(p: Vec2, frame: FrameSize): Vec2 {
  return { x: p.x * frame.width, y: p.y * frame.height };
}

export function canvasToView(p: Vec2, frame: FrameSize): Vec2 {
  return { x: p.x / frame.width, y: p.y / frame.height };
}

export function coverFit(frame: FrameSize, viewport: Viewport): CoverFit {
  const scale = Math.max(viewport.width / frame.width, viewport.height / frame.height);
  return {
    scale,
    offsetX: (viewport.width - frame.width * scale) / 2,
    offsetY: (viewport.height - frame.height * scale) / 2,
  };
}

export function canvasToScreen(p: Vec2, fit: CoverFit): Vec2 {
  return { x: p.x * fit.scale + fit.offsetX, y: p.y * fit.scale + fit.offsetY };
}

export function screenToCanvas(p: Vec2, fit: CoverFit): Vec2 {
  return { x: (p.x - fit.offsetX) / fit.scale, y: (p.y - fit.offsetY) / fit.scale };
}

/** The part of the frame that is visible in the viewport, in canvas units. */
export function visibleCanvasRect(frame: FrameSize, viewport: Viewport): Rect {
  const fit = coverFit(frame, viewport);
  const topLeft = screenToCanvas({ x: 0, y: 0 }, fit);
  const bottomRight = screenToCanvas({ x: viewport.width, y: viewport.height }, fit);
  return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y };
}

/** Fraction of the frame visible on each axis (1 on the axis that fits exactly). */
export function coverScale(frame: FrameSize, viewport: Viewport): Vec2 {
  const r = visibleCanvasRect(frame, viewport);
  return { x: (r.right - r.left) / frame.width, y: (r.bottom - r.top) / frame.height };
}
