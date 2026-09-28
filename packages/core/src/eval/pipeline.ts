// Replays a recorded session through the same input pipeline the studio runs
// (identity -> filter -> pinch -> tool gestures), so fixtures can be scored offline.

import { LandmarkFilter } from '../filters/landmarkFilter.ts';
import { DEFAULT_FILTER_SPECS, type FilterSpec } from '../filters/spec.ts';
import { DEFAULT_IDENTITY, HandIdentity, type IdentityConfig } from '../gesture/handIdentity.ts';
import { DEFAULT_PINCH, penSample, PinchTracker, type PinchConfig } from '../gesture/pinch.ts';
import { DEFAULT_TOOL_GESTURES, ToolGestureTracker, type ToolGestureConfig } from '../gesture/tools.ts';
import type { SessionRecording } from '../session.ts';
import type { InputEvent, PenSample } from '../types.ts';

export interface PipelineConfig {
  /** null keeps the tracker's own hand keys (the Phase 1 behavior), for before/after comparisons. */
  identity: IdentityConfig | null;
  filter: FilterSpec;
  pinch: PinchConfig;
  tools: ToolGestureConfig;
}

export const DEFAULT_PIPELINE: PipelineConfig = {
  identity: DEFAULT_IDENTITY,
  filter: DEFAULT_FILTER_SPECS.oneEuro,
  pinch: DEFAULT_PINCH,
  tools: DEFAULT_TOOL_GESTURES,
};

export interface ReplayHand {
  key: string;
  ratio: number;
  /** Filtered pen position in view space. */
  pen: PenSample;
}

export interface ReplayFrame {
  t: number;
  /** True while any hand is drawing (including a hand briefly missing mid-stroke). */
  drawing: boolean;
  hands: ReplayHand[];
}

export interface Replay {
  events: InputEvent[];
  frames: ReplayFrame[];
  durationMs: number;
}

export function replaySession(rec: SessionRecording, config: PipelineConfig = DEFAULT_PIPELINE): Replay {
  const aspect = rec.meta.videoWidth / rec.meta.videoHeight;
  const identity = config.identity ? new HandIdentity(config.identity) : null;
  const filter = new LandmarkFilter(config.filter);
  const pinch = new PinchTracker(config.pinch);
  const tools = new ToolGestureTracker(config.tools);
  const events: InputEvent[] = [];
  const frames: ReplayFrame[] = [];
  for (const frame of rec.frames) {
    const filtered = filter.apply(identity ? identity.assign(frame, aspect) : frame);
    events.push(...pinch.update(filtered, aspect));
    const status = pinch.status();
    events.push(...tools.update(filtered, aspect, status));
    frames.push({
      t: frame.captureTime,
      drawing: [...status.values()].some((s) => s.state === 'drawing'),
      hands: filtered.hands.map((h) => ({
        key: h.key,
        ratio: status.get(h.key)?.ratio ?? Number.POSITIVE_INFINITY,
        pen: penSample(h.landmarks, aspect, config.pinch.neutralPalm),
      })),
    });
  }
  const durationMs = rec.frames[rec.frames.length - 1]?.captureTime ?? 0;
  // Playback ending closes open strokes, as the studio does.
  events.push(...pinch.reset(durationMs));
  return { events, frames, durationMs };
}

/** The first hand's pen position per frame, in pixels of the recorded video. */
export function penTrack(replay: Replay, width: number, height: number): Array<{ t: number; x: number; y: number }> {
  const out: Array<{ t: number; x: number; y: number }> = [];
  for (const f of replay.frames) {
    const h = f.hands[0];
    if (h) out.push({ t: f.t, x: h.pen.x * width, y: h.pen.y * height });
  }
  return out;
}
