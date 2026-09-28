// Applies a scalar filter per landmark per axis, keyed by hand (not array
// index). Filters of a hand that disappears are dropped, so it restarts cleanly
// instead of sliding in from its last known position.

import type { HandFrame, HandKey, TrackedHand } from '../types.ts';
import type { Filter } from './filter.ts';
import { createFilter, type FilterSpec } from './spec.ts';

export class LandmarkFilter {
  private spec: FilterSpec;
  private filters = new Map<HandKey, Filter[]>();

  constructor(spec: FilterSpec) {
    this.spec = spec;
  }

  get currentSpec(): FilterSpec {
    return this.spec;
  }

  /** Switches filter or parameters. Filter state restarts from the next frame. */
  setSpec(spec: FilterSpec): void {
    this.spec = spec;
    this.filters.clear();
  }

  apply(frame: HandFrame): HandFrame {
    const seen = new Set<HandKey>();
    const hands = frame.hands.map((hand): TrackedHand => {
      seen.add(hand.key);
      let set = this.filters.get(hand.key);
      if (set?.length !== hand.landmarks.length * 3) {
        set = Array.from({ length: hand.landmarks.length * 3 }, () => createFilter(this.spec));
        this.filters.set(hand.key, set);
      }
      const filters = set;
      const landmarks = hand.landmarks.map((p, i) => ({
        x: filters[i * 3]!.next(p.x, frame.captureTime),
        y: filters[i * 3 + 1]!.next(p.y, frame.captureTime),
        z: filters[i * 3 + 2]!.next(p.z, frame.captureTime),
      }));
      return { ...hand, landmarks };
    });
    for (const key of [...this.filters.keys()]) if (!seen.has(key)) this.filters.delete(key);
    return { ...frame, hands };
  }

  reset(): void {
    this.filters.clear();
  }
}
