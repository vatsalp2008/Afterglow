# Afterglow build plan

The brief (`AFTERGLOW_PROJECT_BRIEF.md`) describes roughly 25 to 30 working days across eight phases. Before committing to that, we build a throwaway-but-honest prototype to decide whether the look, the interaction, and the scope are right.

## Phase P: Prototype (now)

Location: `prototype/` (single Vite app, deliberately not the monorepo yet).

**What it proves**

| Question | How the prototype answers it |
|---|---|
| Does "darkroom + glowing light trails" look as good as the pitch? | Real Three.js pipeline: darkroom video shader, additive neon ribbons, strokes-only bloom, long-exposure fade |
| Does pinch-to-draw feel reliable and responsive? | Real MediaPipe Tasks `HandLandmarker`, One Euro filtering, pinch hysteresis with hand-loss grace, live HUD with latency numbers |
| Is the design direction right? | Palette, type, quiet edge dock, intro and permission flow built to the brief's design section |
| Which signature features are worth the cost? | Three brushes (neon, sparks, ink), depth-driven width, timelapse replay, PNG still and WebM export, `?stress=1` |

**Deliberately left out of the prototype:** worker-based inference, Filter Lab page, gesture menu and tool gestures, shape snapping, doodle ML, Refine with Claude, rooms, CI, the monorepo. Each is a later phase and none changes the look and feel you are judging.

**Decision gate:** you try it and choose one of: continue as briefed, continue with changes (scope, look, or interaction), or change direction.

## Phases after the prototype

The brief's phases stand, with these adjustments informed by building the prototype:

| Phase | Goal | Carries over from prototype | Est. |
|---|---|---|---|
| 0 Foundation | pnpm + Turborepo monorepo, strict TS, lint, Vitest, Playwright, CI, `CLAUDE.md`, ADR 0001 | `core/` modules and their tests move into `packages/core` | 1–2 d |
| 1 Tracking + recorder | Worker-hosted `HandLandmarker` behind `HandTracker`, recorder, 8 fixtures, ADR on worker vs main thread | Camera + tracker adapter, coords module | 2–3 d |
| 2 Signal + interaction | Filters (EMA, Kalman, One Euro), gesture FSM with tool gestures, golden replay tests, calibration, Filter Lab v1 | One Euro, pinch FSM | 3–4 d |
| 3 Light rendering | Ribbon and sparks brushes, merged geometry for 500 strokes at 60 FPS, latency measurement | Renderer, darkroom shader, neon/ink/sparks | 3–4 d |
| 4 Studio UX | Radial menu, command history, exports, pointer fallback, dwell mode, e2e with `FixtureTracker` | Dock, exports, replay | 3 d |
| 5 Intelligence | Shape snapping, Quick, Draw! model + report, Refine API | | 4–5 d |
| 6 Rooms | Yjs + realtime server, remote cursors, per-user undo | | 3 d |
| 7 Launch | Landing hero, bench, budgets, deploys, README | | 3–4 d |

**Scope recommendation:** phases 0 to 4 plus Filter Lab are already a strong, complete portfolio piece. Treat phase 5 (ML and Refine) and phase 6 (rooms) as independent add-ons you can reorder or drop after seeing phase 4.

## Where current libraries or facts differ from the brief

1. **Versions are newer than the brief assumes.** `@mediapipe/tasks-vision` is at 1.0.1 (the `HandLandmarker` API is unchanged from 0.10.x). TypeScript 7 (native compiler), Vite 8, Vitest 5, React 19.3, three r186. All pinned exactly in the prototype.
2. **MediaPipe's `z` does not measure distance to the camera.** It is depth relative to the wrist, so it tells you whether a finger points toward the lens, not whether the hand moved closer. The prototype uses apparent palm size (wrist to middle-finger knuckle, in image units) as the "closer is brighter and thicker" signal. Phase 3 should adopt this and calibrate it.
3. **Handedness labels assume a mirrored image.** We feed the unmirrored camera frame, so labels are swapped in the tracker adapter. Two hands can also receive the same label; keying must tolerate that.
4. **`requestVideoFrameCallback` `captureTime` is not available everywhere.** Where it is missing, the prototype falls back to the callback time and the HUD says so instead of reporting a misleading latency.
5. **The two-hand "frame" gesture for Refine is unverified.** It needs a fixture-based check in Phase 2 before we commit to it.
