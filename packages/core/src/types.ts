// Pure data types shared by every layer. Nothing in core/ touches the DOM or
// reads a clock: all time values are passed in, in milliseconds.

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Handedness = 'Left' | 'Right';

/** Stable per-frame key for a hand. Usually the handedness label; disambiguated if two hands share one. */
export type HandKey = string;

export interface TrackedHand {
  key: HandKey;
  handedness: Handedness;
  score: number;
  /** 21 landmarks in landmark space (normalized, unmirrored camera image). */
  landmarks: Vec3[];
  /** MediaPipe's world landmarks: metric 3D (meters), centered on the hand, when available. */
  world?: Vec3[];
}

export interface HandFrame {
  frameId: number;
  /** Capture time in ms (performance timebase). */
  captureTime: number;
  hands: TrackedHand[];
}

export type PenState = 'idle' | 'hover' | 'drawing';

export const BRUSH_IDS = ['neon', 'sparks', 'ink', 'ribbon'] as const;
export type BrushId = (typeof BRUSH_IDS)[number];

/** A point on the input path, in view space (mirrored, normalized [0,1]). */
export interface PenSample {
  x: number;
  y: number;
  /** Depth factor: 1 at the hand's usual distance, larger when it's closer to the camera. */
  depth: number;
  /** The nib angle for the ribbon brush (canvas radians, y down; θ and θ + π are the same nib). */
  angle?: number;
}

/** Commands made with a hand pose instead of drawing (gesture/tools.ts). */
export type ToolGesture = 'openMenu' | 'pause' | 'undo' | 'redo' | 'refine';

export type InputEvent =
  | { type: 'strokeStart'; t: number; handKey: HandKey; p: PenSample }
  | { type: 'strokeMove'; t: number; handKey: HandKey; p: PenSample }
  | { type: 'strokeEnd'; t: number; handKey: HandKey; reason: 'release' | 'handLost' }
  | { type: 'hover'; t: number; handKey: HandKey; p: PenSample }
  /**
   * For a two-hand gesture, handKey is the first of the hands. `at` is where it was made
   * (view space) and `palm` the hand's palm length (frame heights), for anchoring UI to it.
   */
  | { type: 'gesture'; t: number; handKey: HandKey; name: ToolGesture; at?: Vec2; palm?: number };

/** A stroke point in canvas space. */
export interface StrokePoint {
  x: number;
  y: number;
  depth: number;
  /** Session time in ms. */
  t: number;
  /** The nib angle (see PenSample.angle), when the input had one. */
  angle?: number;
}

export interface Stroke {
  id: string;
  brush: BrushId;
  /** Hex color, e.g. #FFB547. */
  color: string;
  /** Base width in canvas units. */
  size: number;
  points: StrokePoint[];
  createdAt: number;
}
