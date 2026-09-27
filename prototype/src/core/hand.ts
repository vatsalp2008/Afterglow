// MediaPipe hand landmark topology (21 points).

export const LM = {
  wrist: 0,
  thumbTip: 4,
  indexMcp: 5,
  indexTip: 8,
  middleMcp: 9,
  pinkyMcp: 17,
} as const;

export const LANDMARK_COUNT = 21;

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
