# @afterglow/web

The Afterglow studio: a light-painting app you control with your hands.

## Run it

From the repository root:

```sh
pnpm install
pnpm dev
```

Open the URL Vite prints in Chrome or Edge. The first camera start downloads the hand tracking model (about 8 MB).

## What to try

1. **Start painting** and allow the camera. Hold a hand up, then pinch your thumb and index finger together to draw. Open them to lift the pen. Both hands can draw at once.
2. Move your hand closer to the camera while drawing: the line gets thicker and brighter.
3. Press **F** to switch between strokes that fade like a long exposure and strokes that stay.
4. Try the **sparks** brush (press **B**) for steel-wool-style particles.
5. Press **T** to replay the session as a timelapse, **V** to record that timelapse as a video, **S** to save a long-exposure PNG.
6. Press **H** for live stats: tracking and render FPS, latency, the pinch ratio against its thresholds, and One Euro filter sliders. Turn on "Show raw signal" to see the unfiltered pen position next to the filtered one.

No camera? **Paint with a mouse instead** uses the same pipeline, with pen pressure mapped to thickness.

Add `?stress=1` to the URL to load 500 synthetic strokes for render performance testing.

## Shortcuts

| Key | Action |
|---|---|
| 1 to 5 | Color |
| B | Next brush (neon, sparks, ink) |
| [ and ] | Thinner, thicker |
| F | Fade or fix strokes |
| D | Darkroom on or off (camera only) |
| Z, Shift Z | Undo, redo |
| Delete (twice) | Clear |
| T | Replay as timelapse |
| V | Record timelapse video |
| S | Save long exposure PNG |
| H | Stats |
| Esc | Stop replay |

## How it works

```
camera ─ requestVideoFrameCallback ─▶ MediaPipe HandLandmarker (GPU, main thread)
      ─▶ One Euro filter per landmark ─▶ pinch state machine (hysteresis, hand-loss grace)
      ─▶ stroke builder (Catmull-Rom smoothing) ─▶ history (undo/redo)
      ─▶ Three.js: neon ribbons + sparks ─▶ bloom ─▶ composite over darkroom video
```

- [`packages/core`](../../packages/core) is pure TypeScript with no DOM access and no clock reads. It holds coordinate spaces, filters, the gesture state machine, stroke building, history, and the timelapse timeline.
- [`packages/tracking`](../../packages/tracking) wraps the camera and MediaPipe. The MediaPipe adapter is lazy-loaded, so mouse-only visitors never download it.
- [`packages/render`](../../packages/render) renders the light strokes. Bloom applies only to the light layer, so the video and the matte ink brush never glow.
- [`src/studio`](src/studio) runs the real-time loop outside React. React only renders the controls, built from [`packages/ui`](../../packages/ui).

## Known limits

- Hand tracking runs on the main thread. Moving it to a worker is a Phase 1 decision.
- Latency is measured from camera capture to render submit, not to the display. In browsers that don't expose the frame's capture time, it falls back to the frame callback time, and the stats panel labels it that way.
- Depth comes from apparent palm size and isn't calibrated per user yet.
- Sessions aren't saved; refreshing the page clears the canvas.
- Faded strokes are still kept and drawn, so very long sessions in fade mode keep adding GPU work.
