// UI state only. The real-time pipeline reads settings from here but never
// pushes per-frame data through React; stats are published at 4 Hz.

import { create } from 'zustand';
import {
  DEFAULT_FILTER_SPECS,
  DEFAULT_PINCH,
  type BrushId,
  type CalibrationResult,
  type FilterSpec,
  type PenState,
  type PinchConfig,
  type ToolGesture,
  type TrackerDelegate,
  type TrackerMode,
} from '@afterglow/core';
import type { CameraDevice, CameraErrorKind, CameraResolution } from '@afterglow/tracking';
import { PALETTE } from '@afterglow/ui/tokens';
import type { BlockSummary } from '../studio/trackerBench';
import type { SizeId } from './brushes';

export type Phase = 'intro' | 'starting' | 'studio';
export type InputMode = 'camera' | 'pointer' | 'fixture';
export type StartError = CameraErrorKind | 'model' | 'fixture';

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
  mainThreadP50: number | null;
  mainThreadP95: number | null;
  hasCaptureTime: boolean;
  tracker: TrackerMode | null;
  delegate: TrackerDelegate | null;
  droppedFrames: number;
  skippedFrames: number;
  hands: HandStat[];
}

export interface BenchState {
  status: 'running' | 'done' | 'error';
  progress: string;
  blocks: BlockSummary[];
  error?: string;
}

const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const PINCH_KEY = 'afterglow:pinch-calibration';
const OFFERED_KEY = 'afterglow:calibration-offered';

/** Pinch thresholds from a saved calibration, if any. */
function savedPinch(): PinchConfig | null {
  try {
    const raw = JSON.parse(localStorage.getItem(PINCH_KEY) ?? 'null') as {
      enter?: unknown;
      exit?: unknown;
      fistBelow?: unknown;
    } | null;
    if (typeof raw?.enter === 'number' && typeof raw.exit === 'number' && raw.exit > raw.enter) {
      // Calibrations saved before the fist gate existed keep the default gate.
      const fistBelow = typeof raw.fistBelow === 'number' ? raw.fistBelow : DEFAULT_PINCH.fistBelow;
      return { ...DEFAULT_PINCH, enter: raw.enter, exit: raw.exit, fistBelow };
    }
  } catch {
    // Storage unavailable or corrupt: fall back to the tuned defaults.
  }
  return null;
}

const saved = typeof localStorage === 'undefined' ? null : savedPinch();

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
  /** Natural video with the skeleton and raw signal: for checking tracking. */
  debugView: boolean;
  filter: FilterSpec;
  pinch: PinchConfig;
  /** Whether the pinch thresholds come from this user's calibration. */
  calibrated: boolean;
  calibrationOpen: boolean;
  calibrationOffered: boolean;
  /**
   * A saved calibration fits the person who made it, but it's saved per browser, so each
   * visit asks whether someone new is painting. Dismissed for this visit only.
   */
  recalibrationDismissed: boolean;

  cameras: CameraDevice[];
  cameraId: string | null;
  resolution: CameraResolution;

  stats: Stats;
  strokeCount: number;
  canUndo: boolean;
  canRedo: boolean;
  drawing: boolean;
  hasDrawn: boolean;
  /** Hand drawing is paused (a fist, or P); the pointer still draws. */
  paused: boolean;
  /** How many times each tool gesture was recognized this session. */
  gestures: Partial<Record<ToolGesture, number>>;
  replaying: boolean;
  /** A timelapse video is being recorded. */
  recordingVideo: boolean;
  /** A hand session (fixture) is being recorded. */
  session: { scenario: string | null } | null;
  bench: BenchState | null;
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
  debugView: false,
  filter: DEFAULT_FILTER_SPECS.oneEuro,
  pinch: saved ?? DEFAULT_PINCH,
  calibrated: saved !== null,
  calibrationOpen: false,
  calibrationOffered: typeof localStorage !== 'undefined' && localStorage.getItem(OFFERED_KEY) !== null,
  recalibrationDismissed: false,

  cameras: [],
  cameraId: null,
  resolution: '640x480',

  stats: {
    trackingFps: 0,
    renderFps: 0,
    landmarkP50: null,
    landmarkP95: null,
    inkP50: null,
    inkP95: null,
    mainThreadP50: null,
    mainThreadP95: null,
    hasCaptureTime: false,
    tracker: null,
    delegate: null,
    droppedFrames: 0,
    skippedFrames: 0,
    hands: [],
  },
  strokeCount: 0,
  canUndo: false,
  canRedo: false,
  drawing: false,
  hasDrawn: false,
  paused: false,
  gestures: {},
  replaying: false,
  recordingVideo: false,
  session: null,
  bench: null,
  toast: null,
  reducedMotion,
}));

export function savePinchCalibration({ enter, exit, fistBelow }: CalibrationResult): void {
  useStudioStore.setState((s) => ({ pinch: { ...s.pinch, enter, exit, fistBelow }, calibrated: true }));
  try {
    localStorage.setItem(PINCH_KEY, JSON.stringify({ enter, exit, fistBelow }));
  } catch {
    // Not persisted; still applies for this session.
  }
}

export function resetPinchCalibration(): void {
  useStudioStore.setState({ pinch: DEFAULT_PINCH, calibrated: false });
  try {
    localStorage.removeItem(PINCH_KEY);
  } catch {
    // Nothing stored.
  }
}

export function markCalibrationOffered(): void {
  useStudioStore.setState({ calibrationOffered: true, recalibrationDismissed: true });
  try {
    localStorage.setItem(OFFERED_KEY, '1');
  } catch {
    // Offer again next time.
  }
}

let toastId = 0;
export function showToast(text: string): void {
  toastId += 1;
  useStudioStore.setState({ toast: { id: toastId, text } });
}
