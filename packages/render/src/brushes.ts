// The brushes, in one table: which layer each draws on (light is bloomed; ink is drawn
// after bloom), which material it uses, and how its geometry is built.

import type { BrushId, Stroke } from '@afterglow/core';
import type { BufferGeometry } from 'three';
import { buildNib } from './nib';
import { buildStrip } from './strip';

export type MaterialId = 'neon' | 'ink' | 'ribbon';

export interface BrushSpec {
  layer: 'light' | 'ink';
  material: MaterialId;
  build: (stroke: Stroke) => BufferGeometry;
}

export const BRUSH_SPECS: Record<BrushId, BrushSpec> = {
  neon: { layer: 'light', material: 'neon', build: (s) => buildStrip(s, 1) },
  // A thin, hotter core; the studio emits the spark particles along it while drawing.
  sparks: { layer: 'light', material: 'neon', build: (s) => buildStrip(s, 0.35, 1.4) },
  ink: { layer: 'ink', material: 'ink', build: (s) => buildStrip(s, 1) },
  ribbon: { layer: 'light', material: 'ribbon', build: (s) => buildNib(s) },
};
