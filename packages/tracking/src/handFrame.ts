import type { HandFrame, Handedness, TrackedHand } from '@afterglow/core';

/** The parts of a HandLandmarkerResult the pipeline uses, as plain cloneable data. */
export interface LandmarkResult {
  landmarks: ReadonlyArray<ReadonlyArray<{ x: number; y: number; z: number }>>;
  handedness: ReadonlyArray<ReadonlyArray<{ categoryName: string; score: number }>>;
  /** Metric 3D landmarks (meters, hand-centered); MediaPipe always provides them. */
  worldLandmarks?: ReadonlyArray<ReadonlyArray<{ x: number; y: number; z: number }>>;
}

/** Strips a MediaPipe result down to plain data, e.g. to post it from a worker. */
export function packResult(result: LandmarkResult): LandmarkResult {
  const xyz = (hand: ReadonlyArray<{ x: number; y: number; z: number }>) =>
    hand.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  return {
    ...(result.worldLandmarks ? { worldLandmarks: result.worldLandmarks.map(xyz) } : {}),
    landmarks: result.landmarks.map((hand) => hand.map((p) => ({ x: p.x, y: p.y, z: p.z }))),
    handedness: result.handedness.map((cats) =>
      cats.slice(0, 1).map((c) => ({ categoryName: c.categoryName, score: c.score })),
    ),
  };
}

/**
 * Converts a HandLandmarker result into a HandFrame.
 *
 * MediaPipe labels handedness assuming a mirrored selfie image, but the tracker
 * passes the unmirrored camera frame, so labels are swapped here. Two hands can
 * receive the same label; the second gets a distinct key so per-hand state
 * never collides.
 */
export function toHandFrame(result: LandmarkResult, frameId: number, captureTime: number): HandFrame {
  const used = new Set<string>();
  const hands: TrackedHand[] = result.landmarks.map((landmarks, i) => {
    const category = result.handedness[i]?.[0];
    const handedness: Handedness = category?.categoryName === 'Left' ? 'Right' : 'Left';
    const key = used.has(handedness) ? `${handedness}#${String(i)}` : handedness;
    used.add(key);
    const world = result.worldLandmarks?.[i];
    return {
      key,
      handedness,
      score: category?.score ?? 0,
      landmarks: landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      ...(world ? { world: world.map((p) => ({ x: p.x, y: p.y, z: p.z })) } : {}),
    };
  });
  return { frameId, captureTime, hands };
}
