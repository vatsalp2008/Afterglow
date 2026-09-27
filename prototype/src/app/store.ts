// UI state only. The real-time pipeline reads settings from here but never
// pushes per-frame data through React; stats are published at 4 Hz.

import { create } from 'zustand';
import { DEFAULT_ONE_EURO, type OneEuroParams } from '../core/filters/oneEuro';
import { DEFAULT_PINCH, type PinchConfig } from '../core/gesture/pinch';
import type { BrushId, PenState } from '../core/types';
import type { CameraErrorKind } from '../tracking/camera';
import { PALETTE, type SizeId } from './tokens';

export type Phase = 'intro' | 'starting' | 'studio';
export type InputMode = 'camera' | 'pointer';
export type StartError = CameraErrorKind | 'model';

export interface HandStat {
  key: string;
  state: PenState;
  ratio: number;
}

export interface Stats {
  trackingFps: number;
  renderFps: number;
  landmarkP50: number | null;
  landmarkP95: number | null;
  inkP50: number | null;
  inkP95: number | null;
  hasCaptureTime: boolean;
  delegate: 'GPU' | 'CPU' | null;
  hands: HandStat[];
}

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface StudioState {
  phase: Phase;
  inputMode: InputMode;
  loadingMessage: string | null;
  error: StartError | null;

  brush: BrushId;
  color: string;
  size: SizeId;
  fade: boolean;
  darkroom: boolean;

  hudOpen: boolean;
  showSkeleton: boolean;
  showRaw: boolean;
  oneEuro: OneEuroParams;
  pinch: PinchConfig;

  stats: Stats;
  strokeCount: number;
  canUndo: boolean;
  canRedo: boolean;
  drawing: boolean;
  hasDrawn: boolean;
  replaying: boolean;
  recording: boolean;
  toast: { id: number; text: string } | null;
  reducedMotion: boolean;
}

export const useStudioStore = create<StudioState>()(() => ({
  phase: 'intro',
  inputMode: 'pointer',
  loadingMessage: null,
  error: null,

  brush: 'neon',
  color: PALETTE.sodium,
  size: 'm',
  fade: !reducedMotion,
  darkroom: true,

  hudOpen: false,
  showSkeleton: false,
  showRaw: false,
  oneEuro: DEFAULT_ONE_EURO,
  pinch: DEFAULT_PINCH,

  stats: {
    trackingFps: 0,
    renderFps: 0,
    landmarkP50: null,
    landmarkP95: null,
    inkP50: null,
    inkP95: null,
    hasCaptureTime: false,
    delegate: null,
    hands: [],
  },
  strokeCount: 0,
  canUndo: false,
  canRedo: false,
  drawing: false,
  hasDrawn: false,
  replaying: false,
  recording: false,
  toast: null,
  reducedMotion,
}));

let toastId = 0;
export function showToast(text: string): void {
  toastId += 1;
  useStudioStore.setState({ toast: { id: toastId, text } });
}
