# Afterglow build plan

The full project is roughly 25 to 30 working days across eight phases. A prototype came first, to confirm the look, the interaction, and the scope before investing in the full architecture.

## Status

| Phase                  | Goal                                                                                                                        | Status      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------- |
| P Prototype            | Prove the look and the pinch interaction with the real stack                                                                | Done        |
| 0 Foundation           | pnpm + Turborepo monorepo, strict TS, lint, Vitest, Playwright, CI, ADRs; prototype code moves into its packages            | In progress |
| 1 Tracking + recorder  | Worker-hosted `HandLandmarker` behind a `HandTracker` interface, session recorder, 8 fixtures, ADR on worker vs main thread |             |
| 2 Signal + interaction | Filters (EMA, Kalman, One Euro), gesture state machine with tool gestures, golden replay tests, calibration, Filter Lab v1  |             |
| 3 Light rendering      | Ribbon and sparks brushes, merged geometry for 500 strokes at 60 FPS, latency measurement                                   |             |
| 4 Studio UX            | Radial menu, command history, exports, pointer fallback, dwell mode, e2e tests with a fixture tracker                       |             |
| 5 Intelligence         | Shape snapping, Quick, Draw! model and report, Refine API                                                                   |             |
| 6 Rooms                | Yjs and realtime server, remote cursors, per-user undo                                                                      |             |
| 7 Launch               | Landing hero, bench page, budgets, deploys, README                                                                          |             |

**Scope recommendation:** phases 0 to 4 plus Filter Lab are already a strong, complete portfolio piece. Treat phase 5 (ML and Refine) and phase 6 (rooms) as independent add-ons that can be reordered or dropped after phase 4.

## What the prototype established

- Darkroom video, additive neon ribbons, strokes-only bloom, and the long-exposure fade deliver the intended look.
- MediaPipe Tasks `HandLandmarker` with One Euro filtering and pinch hysteresis makes a usable pen.
- The quiet edge dock, palette, and type work as the design direction.
- Timelapse replay, PNG still, and WebM export are cheap once strokes carry timestamps.

## Where current libraries or facts differ from the original assumptions

1. **TypeScript is pinned to 6.0.3, not 7.** TypeScript 7's native compiler doesn't yet expose the API that typescript-eslint needs for type-aware linting. See ADR 0002.
2. **Other versions are newer than assumed.** `@mediapipe/tasks-vision` is at 1.0.1 (the `HandLandmarker` API is unchanged from 0.10.x), with Vite 8, Vitest 5, React 19.3 and three r186. All are pinned exactly.
3. **MediaPipe's `z` does not measure distance to the camera.** It's depth relative to the wrist, so it tells you whether a finger points toward the lens, not whether the hand moved closer. Apparent palm size (wrist to middle-finger knuckle, in image units) is used as the "closer is brighter and thicker" signal instead. Phase 3 calibrates it.
4. **Handedness labels assume a mirrored image.** The tracker feeds the unmirrored camera frame, so labels are swapped in the adapter. Two hands can also receive the same label, and keying tolerates that.
5. **`requestVideoFrameCallback` `captureTime` is not available everywhere.** Where it's missing, the tracker falls back to the callback time and the HUD says so, instead of reporting a misleading latency.
6. **The two-hand "frame" gesture for Refine is unverified.** It needs a fixture-based check in Phase 2 before we commit to it.
