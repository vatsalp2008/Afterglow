# @afterglow/web

The Afterglow studio: a light-painting app you control with your hands.

## Run it

From the repository root:

```sh
pnpm install
pnpm dev
```

Open the URL Vite prints in Chrome or Edge. The first camera start downloads the hand tracking model (about 8 MB). Once the camera is allowed, later visits start it without a click.

## What to try

1. **Start painting** and allow the camera. Hold a hand up, then pinch your thumb and index finger together to draw, and open them to lift the pen. Both hands can draw at once.
2. Move your hand closer to the camera while drawing: the line gets thicker and brighter.
3. Hold up an open hand, fingers spread, to open the **gesture menu** around it. Point your palm at an item and pinch to choose it: brushes, colors, sizes, the eraser, undo and redo, clear, and More (fade, darkroom, replay, save, help).
4. Make a **fist** to pause drawing. Swipe **two fingers** left or right to undo or redo.
5. Try the **ribbon** brush: a broad pen nib that twists as you turn your hand. **Sparks** throws off steel-wool particles.
6. Save from More, then Save, in the menu, or from the dock: a long-exposure **image**, a **vector image** (SVG), a **drawing file** you can open again later (drop it on the page), or a **timelapse video**.
7. Press **H** for live stats: tracking and render FPS, latency, the pinch ratio against its thresholds, and the filter's settings.

No camera? **Paint without the camera** uses the same pipeline with a mouse, a pen (pressure sets the thickness), or your fingers on a touch screen, one stroke per finger.

## Shortcuts

Press **?** in the studio for this list.

| Key                       | Action                                 |
| ------------------------- | -------------------------------------- |
| B                         | Next brush (neon, sparks, ribbon, ink) |
| E                         | Eraser, or back to drawing             |
| 1 to 5                    | Color                                  |
| [ and ]                   | Thinner, thicker                       |
| Z, Shift Z                | Undo, redo                             |
| Delete (twice)            | Clear                                  |
| F                         | Let strokes fade, or keep them         |
| D                         | Darkroom on or off (camera only)       |
| P                         | Pause hand drawing (camera only)       |
| T                         | Replay as a timelapse                  |
| V                         | Record a timelapse video               |
| Esc                       | Stop a replay or recording, close help |
| S                         | Save image                             |
| Shift S                   | Save vector image (SVG)                |
| Cmd S (Ctrl S on Windows) | Save drawing file                      |
| Cmd O (Ctrl O on Windows) | Open a drawing file                    |
| H                         | Stats                                  |
| ?                         | Help                                   |

## Developer URLs

- `?fixture=<name>[&loop]` replays a recorded session from `fixtures/sessions` instead of the camera.
- `?record=fixtures` guides recording the fixture scenarios; R records ad hoc.
- `?bench=tracker` and `?bench=render` run the benchmarks in [docs/benchmarks.md](../../docs/benchmarks.md).
- `?stress=N` loads N synthetic strokes (500 for `?stress=1`).
- `?tracker=main` runs hand tracking on the main thread instead of a worker.

## How it works

```
camera ─ requestVideoFrameCallback ─▶ MediaPipe HandLandmarker (GPU, in a worker)
      ─▶ hand identity ─▶ One Euro filter per landmark
      ─▶ pinch, tool gesture, and menu state machines
      ─▶ stroke builder (Catmull-Rom) ─▶ history (undo/redo)
      ─▶ Three.js: light strokes ─▶ bloom ─▶ composite over darkroom video
```

- [`packages/core`](../../packages/core) is pure TypeScript with no DOM access and no clock reads: coordinate spaces, filters, the gesture state machines, stroke building, history, the timeline, and drawing files.
- [`packages/tracking`](../../packages/tracking) wraps the camera and MediaPipe. The MediaPipe adapter is lazy-loaded, so visitors without a camera never download it.
- [`packages/render`](../../packages/render) renders the light strokes and builds the SVG. Bloom applies only to the light layer, so the video and the matte ink brush never glow.
- [`src/studio`](src/studio) runs the real-time loop outside React. React only renders the controls, built from [`packages/ui`](../../packages/ui).

See [docs/architecture.md](../../docs/architecture.md) for the full picture.

## Known limits

- The drawing lives in the page until you save it: refreshing clears the canvas unless you saved a drawing file.
- The SVG approximates the glow, and has been checked in Chrome only (ADR 0012).
- Saving by gesture starts a download without a click, which some browsers ask to allow first; Safari hasn't been checked.
- In browsers that don't expose a frame's capture time, latency falls back to the frame callback time, and the stats panel says so.
