// The recorded fixtures every later phase tests against. Instructions are
// specific (counts, speeds) so tests can assert exact outcomes.

export interface Scenario {
  id: string;
  title: string;
  instruction: string;
  durationMs: number;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: '01-still-hand',
    title: 'Still hand',
    instruction: 'Hold one open hand still, palm to the camera, about an arm’s length away. Don’t pinch.',
    durationMs: 10_000,
  },
  {
    id: '02-slow-circles',
    title: 'Slow circles',
    instruction: 'Pinch, draw 3 slow circles without letting go, then release.',
    durationMs: 12_000,
  },
  {
    id: '03-fast-zigzag',
    title: 'Fast zigzag',
    instruction: 'Pinch, zigzag quickly left and right 5 times, then release.',
    durationMs: 8_000,
  },
  {
    id: '04-pinch-on-off',
    title: 'Pinch on and off',
    instruction: 'Pinch and release 5 times, about a second apart, moving a little while pinched.',
    durationMs: 12_000,
  },
  {
    id: '05-hand-leaves-frame',
    title: 'Hand leaves the frame',
    instruction: 'Pinch and draw, move out of the frame while still pinched, come back, and draw again.',
    durationMs: 12_000,
  },
  {
    id: '06-two-hands',
    title: 'Two hands',
    instruction: 'Raise both hands. Draw with the left, then the right, then both at the same time.',
    durationMs: 12_000,
  },
  {
    id: '07-low-light',
    title: 'Low light',
    instruction: 'Dim the room or turn away from the light, then pinch and draw one slow line.',
    durationMs: 10_000,
  },
  {
    id: '08-rotated-hand',
    title: 'Rotated hand',
    instruction: 'Pinch and draw slowly while rotating your wrist, so your palm turns sideways and then down.',
    durationMs: 12_000,
  },
  // Phase 2: false-positive and tool-gesture checks, plus repeats of the two hard
  // cases (07, 08) now that recordings include world landmarks.
  {
    id: '09-relaxed-hand',
    title: 'Relaxed hand',
    instruction: 'Move one relaxed hand around slowly, fingers loose and naturally curled, as if resting. Don’t pinch.',
    durationMs: 12_000,
  },
  {
    id: '10-open-palm',
    title: 'Open palm',
    instruction:
      'Hold an open palm to the camera, fingers spread, for 2 seconds, then lower your hand. Do this 3 times.',
    durationMs: 12_000,
  },
  {
    id: '11-fist',
    title: 'Fist',
    instruction: 'Make a fist and hold it for 2 seconds, then relax your hand. Do this 3 times.',
    durationMs: 12_000,
  },
  {
    id: '12-swipes',
    title: 'Two-finger swipes',
    instruction: 'Hold up two fingers (index and middle) and swipe left 3 times, then right 3 times.',
    durationMs: 12_000,
  },
  {
    id: '13-frame',
    title: 'Two-hand frame',
    instruction:
      'With both hands, make a frame with your thumbs and index fingers, like framing a photo. Hold for 2 seconds, then release. Do this 3 times.',
    durationMs: 12_000,
  },
  {
    id: '14-low-light-2',
    title: 'Low light, again',
    instruction:
      'Dim the room or turn away from the light, then pinch firmly and draw one slow line, keeping the pinch.',
    durationMs: 10_000,
  },
  {
    id: '15-rotated-hand-2',
    title: 'Rotated hand, again',
    instruction:
      'Pinch and draw slowly while rotating your wrist, so your palm turns sideways and then down. Keep pinching the whole time.',
    durationMs: 12_000,
  },
];
