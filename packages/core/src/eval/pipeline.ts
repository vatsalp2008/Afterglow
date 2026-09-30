// Replays a recorded session through the same input pipeline the studio runs
// (identity -> filter -> pinch -> tool gestures -> menu), so fixtures can be scored offline.

import { frameForAspect } from '../coords.ts';
import { LandmarkFilter } from '../filters/landmarkFilter.ts';
import { DEFAULT_FILTER_SPECS, type FilterSpec } from '../filters/spec.ts';
import { DEFAULT_IDENTITY, HandIdentity, type IdentityConfig } from '../gesture/handIdentity.ts';
import { DEFAULT_PINCH, penSample, PinchTracker, type PinchConfig } from '../gesture/pinch.ts';
import { DEFAULT_MENU, MenuController, type MenuConfig, type MenuEvent, type MenuItem } from '../gesture/menu.ts';
import { DEFAULT_TOOL_GESTURES, ToolGestureTracker, type ToolGestureConfig } from '../gesture/tools.ts';
import type { SessionRecording } from '../session.ts';
import type { InputEvent, PenSample } from '../types.ts';

export interface PipelineConfig {
  /** null keeps the tracker's own hand keys (the Phase 1 behavior), for before/after comparisons. */
  identity: IdentityConfig | null;
  filter: FilterSpec;
  pinch: PinchConfig;
  tools: ToolGestureConfig;
  menu: MenuConfig;
}

/**
 * The menu layout replays use: eight items in the studio's positions, with no submenus.
 * Replays check where the menu opens and what it points at, not what the items do.
 */
export const REPLAY_MENU: MenuItem[] = Array.from({ length: 8 }, (_, i) => ({ id: `wedge${String(i)}` }));

export const DEFAULT_PIPELINE: PipelineConfig = {
  identity: DEFAULT_IDENTITY,
  filter: DEFAULT_FILTER_SPECS.oneEuro,
  pinch: DEFAULT_PINCH,
  tools: DEFAULT_TOOL_GESTURES,
  menu: DEFAULT_MENU,
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
  /** What the gesture menu did, in order. */
  menu: Array<MenuEvent & { t: number }>;
  frames: ReplayFrame[];
  durationMs: number;
}

export function replaySession(rec: SessionRecording, config: PipelineConfig = DEFAULT_PIPELINE): Replay {
  const aspect = rec.meta.videoWidth / rec.meta.videoHeight;
  const identity = config.identity ? new HandIdentity(config.identity) : null;
  const filter = new LandmarkFilter(config.filter);
  const pinch = new PinchTracker(config.pinch);
  const tools = new ToolGestureTracker(config.tools);
  const menu = new MenuController(config.menu);
  const size = frameForAspect(aspect);
  const bounds = { left: 0, top: 0, right: size.width, bottom: size.height };
  const events: InputEvent[] = [];
  const menuLog: Replay['menu'] = [];
  const frames: ReplayFrame[] = [];
  for (const frame of rec.frames) {
    const t = frame.captureTime;
    const filtered = filter.apply(identity ? identity.assign(frame, aspect) : frame);
    const pen = pinch.update(filtered, aspect);
    const status = pinch.status();
    const gestures = tools.update(filtered, aspect, menu.visiblePens(status));
    const wasOpen = menu.isOpen;
    const menuEvents = menu.update(filtered, size, status, gestures, REPLAY_MENU, bounds);
    menuLog.push(...menuEvents.map((e) => ({ ...e, t })));
    // As in the studio: no drawing while the menu is open or its choosing pinch is held,
    // and gestures other than the one that opened it are ignored.
    events.push(...pen.filter((e) => !menu.blocks(e)));
    if (menuEvents.some((e) => e.type === 'open')) events.push(...pinch.reset(t));
    if (!wasOpen) events.push(...gestures);
    if (menuEvents.some((e) => e.type === 'close')) tools.latch(filtered, aspect);
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
  return { events, menu: menuLog, frames, durationMs };
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
