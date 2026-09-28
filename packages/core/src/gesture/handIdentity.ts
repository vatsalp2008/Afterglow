// Stable hand identities from position, not from MediaPipe's handedness label.
//
// The recorded sessions show the label is not an identity: one hand can switch
// between Left and Right when it is re-detected, and two hands can briefly
// share a label. Keying per-hand state by label would cut strokes whenever that
// happens. Instead, each detection is matched to the nearest known hand by palm
// position; the label becomes smoothed metadata.

import type { HandFrame, Handedness, TrackedHand, Vec2, Vec3 } from '../types.ts';

export interface IdentityConfig {
  /** Largest palm movement between consecutive frames for the same hand, in frame heights. */
  maxJump: number;
  /** Detections closer than this (frame heights) are one hand detected twice. */
  duplicateRadius: number;
  /** Frames a hand may be missing and still keep its identity. Keep ≥ the pinch loss grace. */
  graceFrames: number;
}

// Measured on the fixtures: per-frame palm movement stays under 0.07 (0.17 with
// low-light detection jumps); two real hands were never closer than 0.30.
export const DEFAULT_IDENTITY: IdentityConfig = { maxJump: 0.25, duplicateRadius: 0.1, graceFrames: 15 };

interface Track {
  id: string;
  palm: Vec2;
  missing: number;
  votes: Record<Handedness, number>;
}

const PALM_POINTS = [0, 5, 9, 13, 17];

/** Palm center in frame-height units (x scaled by aspect so distances are isotropic). */
export function palmCenter(landmarks: readonly Vec3[], aspect: number): Vec2 {
  let x = 0;
  let y = 0;
  for (const i of PALM_POINTS) {
    x += landmarks[i]!.x;
    y += landmarks[i]!.y;
  }
  return { x: (x / PALM_POINTS.length) * aspect, y: y / PALM_POINTS.length };
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

export class HandIdentity {
  readonly config: IdentityConfig;
  private tracks: Track[] = [];
  private nextId = 1;

  constructor(config: IdentityConfig = DEFAULT_IDENTITY) {
    this.config = config;
  }

  /** Returns the frame with each hand keyed by a stable id and a smoothed handedness. */
  assign(frame: HandFrame, aspect: number): HandFrame {
    const detections = this.dedupe(frame.hands, aspect);
    const matched = new Map<number, Track>();
    const used = new Set<Track>();

    // Greedy nearest-first matching; with at most a few hands it equals the optimal assignment.
    const pairs: Array<{ d: number; det: number; track: Track }> = [];
    detections.forEach((det, i) => {
      for (const track of this.tracks) {
        const d = dist(det.palm, track.palm);
        if (d <= this.config.maxJump * (1 + track.missing)) pairs.push({ d, det: i, track });
      }
    });
    pairs.sort((a, b) => a.d - b.d);
    for (const { det, track } of pairs) {
      if (matched.has(det) || used.has(track)) continue;
      matched.set(det, track);
      used.add(track);
    }

    const hands = detections.map((det, i): TrackedHand => {
      let track = matched.get(i);
      if (!track) {
        track = { id: `hand-${String(this.nextId++)}`, palm: det.palm, missing: 0, votes: { Left: 0, Right: 0 } };
        this.tracks.push(track);
        used.add(track);
      }
      track.palm = det.palm;
      track.missing = 0;
      // Exponentially decaying, score-weighted vote: a brief label flip doesn't change the result.
      track.votes.Left *= 0.8;
      track.votes.Right *= 0.8;
      track.votes[det.hand.handedness] += det.hand.score;
      const handedness: Handedness = track.votes.Left > track.votes.Right ? 'Left' : 'Right';
      return { ...det.hand, key: track.id, handedness };
    });

    for (const track of this.tracks) if (!used.has(track)) track.missing += 1;
    this.tracks = this.tracks.filter((t) => t.missing <= this.config.graceFrames);
    return { ...frame, hands };
  }

  reset(): void {
    this.tracks = [];
  }

  /** Drops the lower-scoring of any two detections of the same hand. */
  private dedupe(hands: readonly TrackedHand[], aspect: number): Array<{ hand: TrackedHand; palm: Vec2 }> {
    const dets = hands
      .map((hand) => ({ hand, palm: palmCenter(hand.landmarks, aspect) }))
      .sort((a, b) => b.hand.score - a.hand.score);
    const kept: typeof dets = [];
    for (const d of dets) {
      if (kept.every((k) => dist(k.palm, d.palm) > this.config.duplicateRadius)) kept.push(d);
    }
    return kept;
  }
}
