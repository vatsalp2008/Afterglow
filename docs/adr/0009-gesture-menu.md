# 0009: Hands-only control through a radial gesture menu

- Status: accepted
- Date: 2026-09-30

## Context

The studio should be usable with hand gestures alone. Hands could already draw, pause (fist), and undo or redo (two-finger swipe). Everything else needed the mouse or keyboard: brush, eraser, color, size, fade, darkroom, clear, replay, save, record, and starting the camera. The brief's Phase 4 calls for a radial menu around the hand.

The owner's choices:

- the mouse and keyboard stay as a hidden backup;
- menu items are chosen by pointing and pinching, rather than dwelling on them.

## Decision

1. **An open palm opens a ring of eight items around the hand.** The palm has its fingers spread and is held still for 400 ms ([ADR 0006](0006-tool-gestures.md)). The items, clockwise from the top:
   - Brush, Color, Size (submenus)
   - Eraser
   - Undo (at the bottom)
   - Redo
   - Clear (a confirmation submenu)
   - More: fade, darkroom, replay, save image, record video, and a gestures card

   During a replay the ring holds a single item, Stop. The ring's radius is 1.2 palm lengths, so it grows as the hand comes closer, and it's kept inside the visible area.

2. **The pointer is the palm center, not the pen point between the fingertips.** It's relative to where the palm was when the menu opened, so a ring moved in from the edge still starts with the pointer in its center.
   - In `04`, the palm moves 0.02–0.05 ring radii while the fingers close, against up to 0.41 for the pen point.
   - The menu's hand shows a pointer at its palm instead of its pen cursor.
3. **The highlight freezes as the fingers start to close,** so the item chosen is the one pointed at before the pinch. The pinch measure drops below the release threshold 100–160 ms before the pinch confirms, and without the freeze the palm could drift into the next item.
   - Wedges have 10° of hysteresis.
   - The center band is entered within 0.35 radii and left beyond 0.45. Pinching there goes back, or at the top level closes the menu.
4. **Choosing needs a new pinch each time.** Undo and Redo keep the menu open, and repeating them needs the pinch released first. A choosing pinch never draws: the studio drops stroke starts while the menu is open, and drops that hand's until its pinch releases.
5. **Clear is confirmed in a second ring.** "Keep it" takes the wedge where Clear was, and "Clear everything" is opposite. A second pinch without moving keeps the drawing.
6. **Closing rules:**
   - a fist held 150 ms (a brief misread frame can't close the menu);
   - the palm moving beyond 2 radii for 400 ms;
   - the hand lost for 500 ms;
   - 6 s resting in the center.

   When the menu closes, the tool gestures are latched (`ToolGestureTracker.latch`). The palm or fist still held can't fire a gesture of its own, so the menu doesn't reopen and the closing fist doesn't also pause.

7. **The same machinery as the other gestures:**
   - a table-driven state machine (`MENU_TRANSITIONS` in `packages/core/src/gesture/menu.ts`, drawn in [gesture-fsm.md](../gesture-fsm.md));
   - a `MenuController` that binds it to the hand. If the hand's id changes, it moves to the nearest hand within a ring radius.
   - Replays run the same menu stage, so recordings check it.
8. **One command registry** (`apps/web/src/app/commands.tsx`) drives the menu, the dock, and the keyboard shortcuts, so their labels and effects match.
9. **The mouse and keyboard stay, out of the way.**
   - With hands, the dock is transparent until the mouse moves (3 s), or while it has keyboard focus.
   - Once camera permission has been granted, the studio starts the camera on load, without a click.
   - The first visit still needs the Start button: browsers ask for camera permission in response to it.

## Evidence

- **`10-open-palm`** opens the menu once, at 1.6 s. Lowering the hand points at Undo, nothing is chosen, and it closes when the hand drops away. An e2e test replays this in the real studio.
- **No other recording opens the menu,** and every stroke count is unchanged (golden tests).
- **Unit tests:** geometry, freezing, choosing, submenus, disabled items, each closing rule at 33 ms and 52 ms per frame, the latch, and the hand binding.

## Alternatives considered

- **Dwelling to choose.** It's slower, and lingering over an item picks it by accident.
- **The pen point as the pointer.** It moves as the fingers close, so the pinch itself would move the highlight.
- **A menu that follows the hand.** The ring would move with the pointer, and there would be nothing fixed to point at.
- **Removing the mouse and keyboard.** They matter for accessibility, for automated tests, and for people without a camera.

## Consequences

- Choosing an item from a real hand isn't covered by a recording yet. The guided scenario `18-menu-select` covers it once recorded.
- Saving an image or a video by gesture starts a download with no click behind it. Browsers may ask to allow downloads from the site, and this hasn't been checked on Safari.
- The menu sits over the drawing while it's open; nothing draws until it closes.
