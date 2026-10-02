# 0012: Exports, and drawing files that open again

- Status: accepted
- Date: 2026-10-01

## Context

The brief's Phase 4 asks for four exports: a PNG long-exposure still, an SVG, the session as JSON, and a timelapse WebM. The PNG and the WebM already existed, but the PNG included the darkened camera image, so a picture meant to be shared could show the room and the person in it.

The owner's choices:

- **The PNG is light only.**
- **The SVG keeps the glowing look**, rather than plain lines for editing.
- **A saved drawing can be opened again**, to keep painting or to replay.

## Decision

1. **The PNG is light only.** The video is hidden for the snapshot, and fade is off, so every stroke is at full brightness (a long exposure). The timelapse video already worked this way.

2. **The SVG has exactly the shapes on screen.**
   - The edges of each stroke come from one module (`packages/render/src/outline.ts`), which both the GPU geometry and the SVG are built from. A test checks that the geometry's vertices are the outline's edges.
   - Each stroke is a closed path, with arcs for the round caps, and coordinates are rounded to 0.1 canvas units.
   - It's cropped to what's on screen, like the PNG.

3. **The SVG approximates the light.**
   - **Additive light:** `mix-blend-mode: screen` stands in for it. Screen, like adding light, doesn't depend on drawing order.
   - **Bloom:** the colored bodies of the light strokes are drawn three more times, blurred (σ 3, 12, and 64 canvas units). A blur spreads a thin line's light very thin, so each blur's alpha is strengthened (×1.5, ×2, ×6), as the bloom's strength does.
   - **Highlights:** neon's warm-white core (a quarter of its width) and the ribbon's bright rims are drawn once, on top. They aren't blurred: blurring them too washed every glow out to white. That showed when the SVG of fixtures 02 and 03 was compared with the studio.
   - **Brightness:** depth brightness is averaged per stroke, since an SVG fill can't vary along a path.
   - **Sparks:** the particles are left out (they're motion), and their core line is kept.
   - **Ink** is drawn over the light with normal blending and no glow, as in the renderer.
   - It's built as a string in `packages/render`, without Three.js. `xlink:href` is written beside `href` for older editors.

4. **The drawing file is the strokes, as JSON:** `{ format: 'afterglow.drawing', version: 1, frame, strokes }`.
   - Strokes are in canvas units, with their timing, depth, and nib angle, so the file replays as a timelapse.
   - Values are rounded far below what can be seen: 0.01 units for positions, 0.1 ms for times.
   - It holds no camera image and no landmarks.

5. **Files are untrusted.** `parseDrawing` (`packages/core/src/drawing.ts`) checks every field and copies only the known ones.
   - **Limits:** 20 MB per file (checked before reading), 10,000 strokes, 20,000 points per stroke, and a million points in all.
   - **Problems:** each problem it reports has its own message: not an Afterglow drawing, saved by a newer version, too large, or damaged.
   - **No schema library:** it's one small format, and core has no dependencies.

6. **Opening a drawing replaces the canvas, in one step that undo reverses** (`History.replace`).
   - **Fit:** the drawing is scaled to fit the current frame and centered, so a drawing made with a 4:3 camera keeps its shape on a 16:9 one.
   - **Timing:** it's moved in time so its newest point is now. Fading and replay then work as if it had just been drawn, keeping its pacing.
   - **Ids:** its strokes get new ids, so they can't be confused with strokes in the undo history.
   - **Before opening:** a running replay stops, and open strokes are kept.

7. **Where the exports are:**
   - **Gesture menu:** More, then Save: image, vector image, drawing file, timelapse video.
   - **Dock:** a "Save and open" list.
   - **Keys:** S, Shift S, Cmd/Ctrl S, and Cmd/Ctrl O, replacing the browser's own save and open.
   - **Opening a file** uses the file picker or a drop anywhere on the page. A drop on the intro starts painting without the camera. It isn't in the gesture menu, because browsers only show a file picker after a click or a key press.
   - **With nothing drawn**, a key says "Nothing to save yet" instead of doing nothing.

## Alternatives considered

- **Plain SVG lines with `stroke-width`.** A line's width can't vary along a path, and these strokes thicken with depth.
- **`mix-blend-mode: plus-lighter`,** true additive blending. Editors support it less well than `screen`.
- **Adding the opened drawing to the current one.** Replacing is what opening a file usually means, and undo brings the previous drawing back.

## Consequences

- **The glow is approximate.** Its radius is fixed in canvas units, while the renderer's bloom is in screen pixels, so it differs most on very large or small screens. Overlapping strokes run paler than on screen.
- **Checked only in Chrome so far:** it hasn't been opened in Safari or Inkscape yet.
- **Version 1 is a promise:** later versions of the format must still open version 1 files.
