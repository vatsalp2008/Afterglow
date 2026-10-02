# 0013: Touch, and when the camera or tracking stops

- Status: accepted
- Date: 2026-10-01

## Context

The brief's Phase 4 asks for a touch fallback, reduced motion, a dwell mode, and clear empty, error, and permission-denied states. Before this:

- **One pointer:** there was one pointer pen, so a second finger restarted the stroke and mixed its moves into it.
- **A lost camera went unnoticed:** if the camera stopped mid-session (unplugged, or taken by another app), the video froze, open strokes stayed open, and nothing said why.
- **Tracker failures** only reached the console.
- **One message for two cases:** a closed permission prompt and a blocked camera were described alike.
- **A failed model load** left the camera on.

## Decision

1. **Every finger paints its own stroke**, like two hands do. The mouse and a stylus share one pen.
   - **No zoom:** the studio turns off the browser's touch gestures (`touch-action: none`, and Safari's `gesturestart`), so moving two fingers apart paints instead of zooming.
   - **Touch screens:** buttons are 44 px, and the dock wraps onto rows on narrow screens. A touch shows the hidden dock, as a mouse move does.
   - **Copy:** the intro's second button is now "Paint without the camera", which is true for touch as well.

2. **When the camera stops** (its track's `ended` event: unplugged, permission revoked, or taken by another app):
   - open strokes end, tracking stops, and the camera is released;
   - a card says so, and that the drawing is safe;
   - **Reconnect camera** tries the same camera, then any;
   - **Keep painting without the camera** switches to pointer mode, keeping the drawing.

3. **A watchdog notices tracking stopping** (`apps/web/src/studio/trackingWatchdog.ts`).
   - With the camera on and the page in view, frames arrive even with no hand in view, so a long silence means tracking has failed. That covers a crashed worker, inference that keeps failing, and a frozen video, without changing the `HandTracker` interface.
   - **Slow machines must not look stopped:**
     - the first frame gets 30 s, since the model warms up slowly without a GPU;
     - after that, the limit is 4 s, or ten typical gaps between frames if those are longer;
     - time the page itself didn't render (more than 1 s between frames) doesn't count.

     The first version allowed 4 s from the start. On CI's software WebGL, rendering at 3 to 4 fps, that called tracking stopped before the first frame arrived.

   - If the camera track has ended or is muted, the card is about the camera. Otherwise it's "Hand tracking stopped", with **Restart hand tracking**, which creates a new tracker.
   - It's off while the tracker benchmark swaps trackers.
   - **Hidden pages:** hiding the page ends open hand strokes, so coming back can't draw a line across the gap, and the watchdog starts over when the page is visible again.

4. **Permission states are told apart.**
   - A closed prompt and a block both fail with `NotAllowedError`. The permission's state separates them: it's still "prompt" after the prompt is closed.
   - **A closed prompt** gets "Try again and choose Allow". **A block** gets where to change it.
   - **No secure page:** an insecure (http) page gets its own message. Where no camera can ever work (an insecure page, or a browser without camera access), "Try again" isn't offered.
   - **No model:** when hand tracking fails to load, the camera is turned off.

5. **Hints.** After 4 s with no hand in view, "Raise a hand so the camera can see it" comes back. Before, it only showed before the first stroke.

6. **Keyboard.**
   - A Help card lists the keys and the gestures, keys first without a camera. It opens with ?, from the dock, or from the gesture menu (More, Help).
   - Keys come from the command registry where a command has one.
   - Shortcuts skip selects, text areas, and editable text, as they already skipped inputs.

7. **Reduced motion follows the system setting as it changes**: film grain, sparks, and the intro's demo pen.

8. **No dwell mode.** The brief asked for dwell-to-select for people who can't pinch; the owner decided against it. Choosing in the gesture menu stays point and pinch ([ADR 0009](0009-gesture-menu.md)). The mouse, touch, and keyboard cover every control.

## Evidence

End-to-end tests against the production build:

- **Touch:** two fingers draw two strokes at once and the page doesn't zoom; a tap draws a dot.
- **Camera:**
  - ending the camera's track shows the card;
  - Reconnect brings tracking back;
  - carrying on without the camera paints with the mouse;
  - pausing the video trips the watchdog, and Restart brings tracking back.
- **Unit tests** of the watchdog: the first-frame wait, a stop once frames flow, slow tracking (a frame every 1.5 s), a stalled page, and the page coming back into view.
- **Permissions:** a blocked camera and a closed prompt each get their own message.
- **Keyboard:** the studio runs from the keyboard, the Help card included, along with the save list (arrows and Esc) and Cmd/Ctrl S.

## Alternatives considered

- **Painting with one finger only.** Two fingers drawing two strokes matches two hands, and costs nothing.
- **Reconnecting by itself.** A camera another app took would be taken back from it; the person decides instead.
- **Error callbacks on `HandTracker`.** The watchdog catches every way tracking can stop, including ones no callback would report, such as a frozen video.

## Consequences

- **Watchdog false alarms:** a machine that stops delivering frames for longer than its own pace allows still gets the card, and restarting is harmless. Three camera tests side by side starved each other that way, so the camera tests now run one at a time.
- **Pressure:** touch doesn't set pressure, since most touch screens report a constant. Only a stylus does.
