# Gesture state machines

Generated from `PEN_TRANSITIONS` in [`packages/core/src/gesture/pinch.ts`](../packages/core/src/gesture/pinch.ts), `TOOL_TRANSITIONS` in [`packages/core/src/gesture/tools.ts`](../packages/core/src/gesture/tools.ts), and `MENU_TRANSITIONS` in [`packages/core/src/gesture/menu.ts`](../packages/core/src/gesture/menu.ts) by `pnpm --filter @afterglow/core docs:fsm`. Don't edit by hand; CI fails if this file is stale.

## Pen

One state machine runs per tracked hand. Each frame, the pinch measure is classified as **closed** (below `enter`), **open** (above `exit`), or **between** (in the hysteresis band). **lost** means the hand has been missing for longer than the loss grace. The `pressing` and `releasing` states wait for confirmation: `enterFrames` closed frames to start a stroke; `exitFrames` open frames, and at least `exitMs`, to end one.

```mermaid
stateDiagram-v2
  [*] --> hover: hand appears
  hover --> drawing: closed (confirmed) / start
  hover --> pressing: closed (not yet)
  hover --> [*]: lost
  pressing --> drawing: closed (confirmed) / start
  pressing --> hover: between
  pressing --> hover: open
  pressing --> [*]: lost
  drawing --> drawing: closed / move
  drawing --> drawing: between / move
  drawing --> lifted: open (confirmed) / drop
  drawing --> releasing: open (not yet) / hold
  drawing --> [*]: lost / lose
  releasing --> drawing: closed / flush, move
  releasing --> drawing: between / flush, move
  releasing --> lifted: open (confirmed) / drop
  releasing --> releasing: open (not yet) / hold
  releasing --> [*]: lost / lose
  lifted --> drawing: closed (not yet) / move
  lifted --> pressing: closed (confirmed) / release
  lifted --> hover: between (confirmed) / release
  lifted --> hover: open (confirmed) / release
  lifted --> [*]: lost / lose
```

Hover-only self-loops are omitted from the diagram. The full table:

| From | Input | Confirmation | To | Actions |
| --- | --- | --- | --- | --- |
| hover | closed | confirmed | drawing | start |
| hover | closed | not yet | pressing | hover |
| hover | between |  | hover | hover |
| hover | open |  | hover | hover |
| hover | lost |  | gone | none |
| pressing | closed | confirmed | drawing | start |
| pressing | closed | not yet | pressing | hover |
| pressing | between |  | hover | hover |
| pressing | open |  | hover | hover |
| pressing | lost |  | gone | none |
| drawing | closed |  | drawing | move |
| drawing | between |  | drawing | move |
| drawing | open | confirmed | lifted | drop |
| drawing | open | not yet | releasing | hold |
| drawing | lost |  | gone | lose |
| releasing | closed |  | drawing | flush, move |
| releasing | between |  | drawing | flush, move |
| releasing | open | confirmed | lifted | drop |
| releasing | open | not yet | releasing | hold |
| releasing | lost |  | gone | lose |
| lifted | closed | not yet | drawing | move |
| lifted | closed | confirmed | pressing | release, hover |
| lifted | between | not yet | lifted | hover |
| lifted | between | confirmed | hover | release, hover |
| lifted | open | not yet | lifted | hover |
| lifted | open | confirmed | hover | release, hover |
| lifted | lost |  | gone | lose |

Actions: **start** and **move** emit stroke events; **hold** keeps a sample back while the fingers may be opening; **flush** emits the held samples when it turns out not to be a release; **release** drops them and ends the stroke; **lose** ends the stroke because the hand is gone.

## Tool gestures

One state machine runs for all hands. Each frame, the hands are reduced to at most one candidate gesture: a held open palm (openMenu), a fist (pause), two fingers up (swipes for undo and redo), or both hands framing (refine). The input is **same** when it's the gesture already being held, on the same hands; **other** for a different one, or an open palm that moved or changed shape, which restarts the hold; **none** when there's no candidate for longer than `gapMs`; and **drawing** while any hand draws. `holding` is confirmed once the gesture's hold time has passed, and `cooling` once `cooldownMs` has.

```mermaid
stateDiagram-v2
  [*] --> ready
  ready --> holding: same / begin
  ready --> holding: other / begin
  holding --> active: same (confirmed) / activate
  holding --> holding: other / begin
  holding --> ready: none / clear
  holding --> ready: drawing / clear
  active --> active: same / track
  active --> cooling: other / cool
  active --> cooling: none / cool
  active --> ready: drawing / clear
  cooling --> holding: same (confirmed) / begin
  cooling --> holding: other (confirmed) / begin
  cooling --> ready: none (confirmed)
  cooling --> ready: drawing
```

Waiting self-loops are omitted from the diagram. The full table:

| From | Input | Confirmation | To | Actions |
| --- | --- | --- | --- | --- |
| ready | same |  | holding | begin |
| ready | other |  | holding | begin |
| ready | none |  | ready | none |
| ready | drawing |  | ready | none |
| holding | same | confirmed | active | activate |
| holding | same | not yet | holding | none |
| holding | other |  | holding | begin |
| holding | none |  | ready | clear |
| holding | drawing |  | ready | clear |
| active | same |  | active | track |
| active | other |  | cooling | cool |
| active | none |  | cooling | cool |
| active | drawing |  | ready | clear |
| cooling | same | confirmed | holding | begin |
| cooling | same | not yet | cooling | none |
| cooling | other | confirmed | holding | begin |
| cooling | other | not yet | cooling | none |
| cooling | none | confirmed | ready | none |
| cooling | none | not yet | cooling | none |
| cooling | drawing |  | ready | none |

Actions: **begin** starts holding the frame's candidate; **activate** fires a held gesture (for two fingers up, it arms swipes instead); **track** fires undo or redo for each swipe while two fingers stay up; **cool** starts the cooldown once the pose ends; **clear** drops the candidate.

## Gesture menu

The ring of items opened by the open-palm gesture. The pointer is the palm center of the hand that opened it. Each frame, that hand is **free** (open, within reach), its fingers are **closing** (the pinch measure is below the release threshold), it's **pinched**, a **fist**, **far** from the ring, or **lost**. For fist, far, and lost, "confirmed" means the input has lasted long enough (`fistMs`, `farMs`, `lostMs`); for free, that the pointer has rested in the center for `idleMs`. `latched` holds the highlight still while the fingers close, so the item chosen is the one pointed at when the pinch began.

```mermaid
stateDiagram-v2
  [*] --> open: open palm held
  open --> open: free (not yet) / point
  open --> [*]: free (confirmed) / close
  open --> latched: closing
  open --> awaitRelease: pinched / point, choose
  open --> [*]: fist (confirmed) / close
  open --> [*]: far (confirmed) / close
  open --> [*]: lost (confirmed) / close
  latched --> open: free / point
  latched --> awaitRelease: pinched / choose
  latched --> [*]: fist (confirmed) / close
  latched --> [*]: far (confirmed) / close
  latched --> [*]: lost (confirmed) / close
  awaitRelease --> open: free / point
  awaitRelease --> [*]: fist (confirmed) / close
  awaitRelease --> [*]: far (confirmed) / close
  awaitRelease --> [*]: lost (confirmed) / close
```

Waiting self-loops are omitted from the diagram. The full table:

| From | Input | Confirmation | To | Actions |
| --- | --- | --- | --- | --- |
| open | free | not yet | open | point |
| open | free | confirmed | closed | close |
| open | closing |  | latched | none |
| open | pinched |  | awaitRelease | point, choose |
| open | fist | confirmed | closed | close |
| open | fist | not yet | open | none |
| open | far | confirmed | closed | close |
| open | far | not yet | open | none |
| open | lost | confirmed | closed | close |
| open | lost | not yet | open | none |
| latched | free |  | open | point |
| latched | closing |  | latched | none |
| latched | pinched |  | awaitRelease | choose |
| latched | fist | confirmed | closed | close |
| latched | fist | not yet | latched | none |
| latched | far | confirmed | closed | close |
| latched | far | not yet | latched | none |
| latched | lost | confirmed | closed | close |
| latched | lost | not yet | latched | none |
| awaitRelease | free |  | open | point |
| awaitRelease | closing |  | awaitRelease | none |
| awaitRelease | pinched |  | awaitRelease | none |
| awaitRelease | fist | confirmed | closed | close |
| awaitRelease | fist | not yet | awaitRelease | none |
| awaitRelease | far | confirmed | closed | close |
| awaitRelease | far | not yet | awaitRelease | none |
| awaitRelease | lost | confirmed | closed | close |
| awaitRelease | lost | not yet | awaitRelease | none |

Actions: **point** moves the highlight to the wedge (or the center) the palm points at; **choose** acts on the highlighted item: opens its submenu, runs it (closing the menu unless it keeps it open), goes back from the center, or closes from the top-level center; **close** closes the menu.
