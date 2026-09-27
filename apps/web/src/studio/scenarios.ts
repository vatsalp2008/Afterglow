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
];
