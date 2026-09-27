// Recorded hand sessions (fixtures): raw HandFrames plus enough metadata to
// replay them through the pipeline later. Only landmarks are stored, never
// images.

import type { HandFrame, Handedness, TrackedHand, Vec3 } from './types';

export type TrackerMode = 'worker' | 'main' | 'fixture';
export type TrackerDelegate = 'GPU' | 'CPU' | 'none';

export interface SessionMeta {
  userAgent: string;
  videoWidth: number;
  videoHeight: number;
  /** Measured tracking rate over the recording, in frames per second. */
  fps: number;
  tracker: TrackerMode;
  delegate: TrackerDelegate;
  /** ISO 8601 timestamp. */
  recordedAt: string;
  /** Fixture scenario id, e.g. "04-pinch-on-off". */
  scenario?: string;
  notes?: string;
}

export interface SessionRecording {
  version: 1;
  meta: SessionMeta;
  /** Frames with captureTime in ms relative to the first frame. */
  frames: HandFrame[];
}

const round = (v: number, digits: number) => {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
};

/** Accumulates raw frames; landmarks are rounded to 5 decimals (about 0.006 px at 640 px). */
export class SessionRecorder {
  private frames: HandFrame[] = [];
  private firstTime: number | null = null;
  private firstId = 0;

  get frameCount(): number {
    return this.frames.length;
  }

  get durationMs(): number {
    return this.frames[this.frames.length - 1]?.captureTime ?? 0;
  }

  push(frame: HandFrame): void {
    if (this.firstTime === null) {
      this.firstTime = frame.captureTime;
      this.firstId = frame.frameId;
    }
    this.frames.push({
      frameId: frame.frameId - this.firstId,
      captureTime: round(frame.captureTime - this.firstTime, 1),
      hands: frame.hands.map((h) => ({
        key: h.key,
        handedness: h.handedness,
        score: round(h.score, 3),
        landmarks: h.landmarks.map((p) => ({ x: round(p.x, 5), y: round(p.y, 5), z: round(p.z, 5) })),
      })),
    });
  }

  finish(meta: Omit<SessionMeta, 'fps'>): SessionRecording {
    const n = this.frames.length;
    const seconds = this.durationMs / 1000;
    const fps = n > 1 && seconds > 0 ? round((n - 1) / seconds, 1) : 0;
    return { version: 1, meta: { ...meta, fps }, frames: this.frames };
  }

  clear(): void {
    this.frames = [];
    this.firstTime = null;
    this.firstId = 0;
  }
}

export class SessionFormatError extends Error {
  override name = 'SessionFormatError';
}

type Obj = Record<string, unknown>;

function fail(path: string, expected: string): never {
  throw new SessionFormatError(`${path}: expected ${expected}`);
}

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'an object');
  return v as Obj;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, 'an array');
  return v;
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'a finite number');
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') fail(path, 'a string');
  return v;
}

function optStr(v: unknown, path: string): string | undefined {
  return v === undefined ? undefined : str(v, path);
}

function oneOf<T extends string>(v: unknown, options: readonly T[], path: string): T {
  if (typeof v !== 'string' || !(options as readonly string[]).includes(v)) fail(path, options.join(' | '));
  return v as T;
}

function landmark(v: unknown, path: string): Vec3 {
  const o = obj(v, path);
  return { x: num(o['x'], `${path}.x`), y: num(o['y'], `${path}.y`), z: num(o['z'], `${path}.z`) };
}

function hand(v: unknown, path: string): TrackedHand {
  const o = obj(v, path);
  const landmarks = arr(o['landmarks'], `${path}.landmarks`);
  if (landmarks.length !== 21) fail(`${path}.landmarks`, '21 landmarks');
  return {
    key: str(o['key'], `${path}.key`),
    handedness: oneOf<Handedness>(o['handedness'], ['Left', 'Right'], `${path}.handedness`),
    score: num(o['score'], `${path}.score`),
    landmarks: landmarks.map((p, i) => landmark(p, `${path}.landmarks[${i}]`)),
  };
}

/** Validates an untrusted value (e.g. parsed JSON) as a SessionRecording. */
export function parseSessionRecording(raw: unknown): SessionRecording {
  const root = obj(raw, 'recording');
  if (root['version'] !== 1) fail('version', '1');
  const m = obj(root['meta'], 'meta');
  const meta: SessionMeta = {
    userAgent: str(m['userAgent'], 'meta.userAgent'),
    videoWidth: num(m['videoWidth'], 'meta.videoWidth'),
    videoHeight: num(m['videoHeight'], 'meta.videoHeight'),
    fps: num(m['fps'], 'meta.fps'),
    tracker: oneOf<TrackerMode>(m['tracker'], ['worker', 'main', 'fixture'], 'meta.tracker'),
    delegate: oneOf<TrackerDelegate>(m['delegate'], ['GPU', 'CPU', 'none'], 'meta.delegate'),
    recordedAt: str(m['recordedAt'], 'meta.recordedAt'),
  };
  const scenario = optStr(m['scenario'], 'meta.scenario');
  const notes = optStr(m['notes'], 'meta.notes');
  if (scenario !== undefined) meta.scenario = scenario;
  if (notes !== undefined) meta.notes = notes;

  let lastTime = -Infinity;
  const frames = arr(root['frames'], 'frames').map((f, i): HandFrame => {
    const path = `frames[${i}]`;
    const o = obj(f, path);
    const captureTime = num(o['captureTime'], `${path}.captureTime`);
    if (captureTime < lastTime) fail(`${path}.captureTime`, 'non-decreasing times');
    lastTime = captureTime;
    return {
      frameId: num(o['frameId'], `${path}.frameId`),
      captureTime,
      hands: arr(o['hands'], `${path}.hands`).map((h, j) => hand(h, `${path}.hands[${j}]`)),
    };
  });
  return { version: 1, meta, frames };
}
