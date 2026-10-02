// Notices hand tracking stopping (ADR 0013): with the camera on, frames arrive even with
// no hand in view, so a long silence means the tracker or the video has stopped. Slow
// machines must not look stopped, so the limits are generous and adapt.

/** The first frame may wait for the model to warm up, which is slow without a GPU. */
export const FIRST_FRAME_MS = 30_000;
/** After that, silence for this long, or ten typical gaps if those are longer. */
export const STALL_MS = 4000;
/** A page that didn't render for this long was stalled itself: that time doesn't count. */
export const PAGE_STALL_MS = 1000;

export class TrackingWatchdog {
  private startedAt = 0;
  private lastFrameAt: number | null = null;
  private typicalGap = 0;
  private lastCheckAt: number | null = null;

  /** Tracking (re)started at `t`. */
  start(t: number): void {
    this.startedAt = t;
    this.lastFrameAt = null;
    this.typicalGap = 0;
    this.lastCheckAt = t;
  }

  /** A tracker frame arrived at `t`. */
  frame(t: number): void {
    if (this.lastFrameAt !== null) {
      const gap = t - this.lastFrameAt;
      this.typicalGap = this.typicalGap === 0 ? gap : 0.9 * this.typicalGap + 0.1 * gap;
    }
    this.lastFrameAt = t;
  }

  /** The page is back in view: frames stopped while it was hidden, which says nothing about tracking. */
  resume(t: number): void {
    this.startedAt = t;
    if (this.lastFrameAt !== null) this.lastFrameAt = t;
    this.lastCheckAt = t;
  }

  /**
   * Whether tracking looks stopped at `t`. Called once per rendered frame; time between
   * calls longer than PAGE_STALL_MS (a stalled page, or checks skipped) doesn't count.
   */
  stalled(t: number): boolean {
    const sinceCheck = this.lastCheckAt === null ? 0 : t - this.lastCheckAt;
    this.lastCheckAt = t;
    if (sinceCheck > PAGE_STALL_MS) {
      this.startedAt += sinceCheck;
      if (this.lastFrameAt !== null) this.lastFrameAt += sinceCheck;
    }
    if (this.lastFrameAt === null) return t - this.startedAt > FIRST_FRAME_MS;
    return t - this.lastFrameAt > Math.max(STALL_MS, 10 * this.typicalGap);
  }
}
