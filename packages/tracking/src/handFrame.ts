import type { HandFrame, Handedness, TrackedHand } from '@afterglow/core';
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';

/**
 * Converts a HandLandmarker result into a HandFrame.
 *
 * MediaPipe labels handedness assuming a mirrored selfie image, but the tracker
 * passes the unmirrored camera frame, so labels are swapped here. Two hands can
 * receive the same label; the second gets a distinct key so per-hand state
 * never collides.
 */
export function toHandFrame(
  result: Pick<HandLandmarkerResult, 'landmarks' | 'handedness'>,
  frameId: number,
  captureTime: number,
): HandFrame {
  const used = new Set<string>();
  const hands: TrackedHand[] = result.landmarks.map((landmarks, i) => {
    const category = result.handedness[i]?.[0];
    const handedness: Handedness = category?.categoryName === 'Left' ? 'Right' : 'Left';
    const key = used.has(handedness) ? `${handedness}#${String(i)}` : handedness;
    used.add(key);
    return {
      key,
      handedness,
      score: category?.score ?? 0,
      landmarks: landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    };
  });
  return { frameId, captureTime, hands };
}
