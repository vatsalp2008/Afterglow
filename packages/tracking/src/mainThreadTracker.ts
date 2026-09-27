// MediaPipe HandLandmarker on the main thread. Simple and fast to start, but
// inference blocks the thread that also renders; see ADR 0003.

import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { toHandFrame } from './handFrame';
import { createLandmarker } from './landmarker';
import type { FrameListener, HandTracker } from './types';
import { watchVideoFrames } from './videoFrames';

export interface CameraTrackerOptions {
  video: HTMLVideoElement;
  /** URL of the directory serving the MediaPipe WASM runtime. */
  wasmBasePath: string;
  modelUrl?: string;
}

export class MainThreadHandTracker implements HandTracker {
  readonly mode = 'main' as const;
  private stopWatching: (() => void) | null = null;
  private frameId = 0;
  private lastTimestamp = -1;
  private reportedError = false;

  private constructor(
    private readonly video: HTMLVideoElement,
    private readonly landmarker: HandLandmarker,
    readonly delegate: 'GPU' | 'CPU',
  ) {}

  static async create(opts: CameraTrackerOptions): Promise<MainThreadHandTracker> {
    const { landmarker, delegate } = await createLandmarker({
      wasmBasePath: opts.wasmBasePath,
      useModule: false,
      ...(opts.modelUrl ? { modelUrl: opts.modelUrl } : {}),
    });
    return new MainThreadHandTracker(opts.video, landmarker, delegate);
  }

  start(onFrame: FrameListener): void {
    this.stop();
    this.stopWatching = watchVideoFrames(this.video, (info) => {
      // MediaPipe requires strictly increasing timestamps.
      const timestamp = Math.max(info.captureTime, this.lastTimestamp + 1);
      this.lastTimestamp = timestamp;
      const t0 = performance.now();
      try {
        const result = this.landmarker.detectForVideo(this.video, timestamp);
        const inferenceMs = performance.now() - t0;
        const frame = toHandFrame(result, this.frameId++, info.captureTime);
        const doneAt = performance.now();
        onFrame(frame, {
          captureTime: info.captureTime,
          hasCaptureTime: info.hasCaptureTime,
          inferenceMs,
          mainThreadMs: doneAt - t0,
          doneAt,
          droppedFrames: info.droppedFrames,
          skippedFrames: 0,
        });
      } catch (err) {
        // Keep the loop alive (e.g. across a transient GPU context loss), but don't flood the console.
        if (!this.reportedError) console.error('[tracker] inference failed', err);
        this.reportedError = true;
      }
    });
  }

  stop(): void {
    this.stopWatching?.();
    this.stopWatching = null;
  }

  close(): void {
    this.stop();
    this.landmarker.close();
  }
}
