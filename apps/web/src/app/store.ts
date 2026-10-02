// UI state only. The real-time pipeline reads settings from here but never
// pushes per-frame data through React; stats are published at 4 Hz.

import { create } from 'zustand';
import {
  DEFAULT_FILTER_SPECS,
  DEFAULT_PINCH,
  type BrushId,
  type FilterSpec,
  type MenuTarget,
  type PenState,
  type PinchConfig,
  type ToolGesture,
  type TrackerDelegate,
  type TrackerMode,
} from '@afterglow/core';
import type { CameraDevice, CameraErrorKind, CameraResolution } from '@afterglow/tracking';
import { PALETTE } from '@afterglow/ui/tokens';
import type { RenderBenchResult } from '../studio/renderBench';
import type { BlockSummary } from '../studio/trackerBench';
import type { SizeId } from './brushes';

export type Phase = 'intro' | 'starting' | 'studio';
export type InputMode = 'camera' | 'pointer' | 'fixture';
/** Why the studio couldn't start. `dismissed`: the camera prompt was closed without an answer. */
export type StartError = CameraErrorKind | 'dismissed' | 'model' | 'fixture';

/** The camera or hand tracking stopped mid-session (ADR 0013). */
export interface Interruption {
  kind: 'camera' | 'tracking';
  /** Why the last try to reconnect failed. */
  error: StartError | null;
  reconnecting: boolean;
}

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
  /** Capture (or a recorded frame's due time) to the ink it caused being on screen, ms. */
  inkP50: number | null;
  inkP95: number | null;
  /** CPU time per rendered frame: syncing strokes, rendering, cursors, ms. */
  frameP50: number | null;
  frameP95: number | null;
  drawCalls: number;
  triangles: number;
  /** Geometries held on the GPU, to spot leaks. */
  geometries: number;
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

export interface StudioState {
  phase: Phase;
  inputMode: InputMode;
  loadingMessage: string | null;
  error: StartError | null;
  interruption: Interruption | null;

  /** Drawing with the brush, or erasing what the pen passes over. */
  tool: 'draw' | 'erase';
  /**
   * The gesture menu while it's open: the submenu path, the highlighted wedge (or the
   * center), and where it is on screen (px). Published only when these change.
   */
  menu: {
    path: readonly string[];
    highlight: MenuTarget | null;
    center: { x: number; y: number };
    radius: number;
  } | null;
  /** The card listing the gestures is showing. */
  helpOpen: boolean;
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
  renderBench: { status: 'running' | 'done' | 'error'; progress: string; result: RenderBenchResult | null } | null;
  toast: { id: number; text: string } | null;
  reducedMotion: boolean;
}

export const useStudioStore = create<StudioState>()(() => ({
  phase: 'intro',
  inputMode: 'pointer',
  loadingMessage: null,
  error: null,
  interruption: null,

  tool: 'draw',
  menu: null,
  helpOpen: false,
  brush: 'neon',
  color: PALETTE.sodium,
  size: 'm',
  // Strokes stay unless fading is switched on (F).
  fade: false,
  darkroom: true,

  hudOpen: false,
  showSkeleton: false,
  showRaw: false,
  debugView: false,
  filter: DEFAULT_FILTER_SPECS.oneEuro,
  pinch: DEFAULT_PINCH,

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
    frameP50: null,
    frameP95: null,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
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
  renderBench: null,
  toast: null,
  reducedMotion,
}));

let toastId = 0;
export function showToast(text: string): void {
  toastId += 1;
  useStudioStore.setState({ toast: { id: toastId, text } });
}
