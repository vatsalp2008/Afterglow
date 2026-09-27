// MediaPipe HandLandmarker in a Web Worker. The main thread only turns each
// camera frame into an ImageBitmap and transfers it; inference runs off-thread.
// One frame is in flight at a time, plus a one-slot mailbox holding the newest
// frame that arrived meanwhile: the worker starts on it as soon as it's free
// (no idle gap waiting for the next camera frame), and a newer frame replaces
// an older waiting one, so latency can't build up.

import { toHandFrame } from './handFrame';
import type { CameraTrackerOptions, FrameListener, HandTracker } from './types';
import { watchVideoFrames, type VideoFrameInfo } from './videoFrames';
import type { WorkerRequest, WorkerResponse } from './worker/protocol';

interface InFlight {
  frameId: number;
  info: VideoFrameInfo;
  mainThreadMs: number;
}

export class WorkerHandTracker implements HandTracker {
  readonly mode = 'worker' as const;
  private stopWatching: (() => void) | null = null;
  private onFrame: FrameListener | null = null;
  private inFlight: InFlight | null = null;
  private waiting: VideoFrameInfo | null = null;
  private nextFrameId = 0;
  private lastTimestamp = -1;
  private skipped = 0;
  private reportedError = false;

  private constructor(
    private readonly video: HTMLVideoElement,
    private readonly worker: Worker,
    readonly delegate: 'GPU' | 'CPU',
  ) {
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      this.handle(e.data);
    };
    worker.onerror = (e) => {
      this.inFlight = null;
      this.reportOnce('worker error', e.message);
    };
  }

  /** Starts the worker and loads the model; rejects if the worker can't initialize. */
  static create(opts: CameraTrackerOptions): Promise<WorkerHandTracker> {
    const worker = new Worker(new URL('./worker/handWorker.ts', import.meta.url), { type: 'module' });
    return new Promise((resolve, reject) => {
      worker.onerror = (e) => {
        worker.terminate();
        reject(new Error(`hand-tracking worker failed to load: ${e.message}`));
      };
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.type === 'ready') {
          worker.onerror = null;
          resolve(new WorkerHandTracker(opts.video, worker, msg.delegate));
        } else if (msg.type === 'initError') {
          worker.terminate();
          reject(new Error(msg.message));
        }
      };
      const init: WorkerRequest = {
        type: 'init',
        wasmBasePath: new URL(opts.wasmBasePath, location.href).href,
        ...(opts.modelUrl ? { modelUrl: opts.modelUrl } : {}),
      };
      worker.postMessage(init);
    });
  }

  start(onFrame: FrameListener): void {
    this.stop();
    this.onFrame = onFrame;
    this.stopWatching = watchVideoFrames(this.video, (info) => {
      this.submit(info);
    });
  }

  stop(): void {
    this.stopWatching?.();
    this.stopWatching = null;
    this.onFrame = null;
    this.waiting = null;
  }

  close(): void {
    this.stop();
    const msg: WorkerRequest = { type: 'close' };
    this.worker.postMessage(msg);
  }

  private submit(info: VideoFrameInfo): void {
    if (this.inFlight) {
      if (this.waiting) this.skipped += 1;
      this.waiting = info;
      return;
    }
    const frameId = this.nextFrameId++;
    const t0 = performance.now();
    const pending = createImageBitmap(this.video);
    const inFlight: InFlight = { frameId, info, mainThreadMs: performance.now() - t0 };
    this.inFlight = inFlight;
    pending.then(
      (bitmap) => {
        if (!this.onFrame) {
          bitmap.close();
          this.inFlight = null;
          return;
        }
        const t1 = performance.now();
        // MediaPipe requires strictly increasing timestamps.
        const timestamp = Math.max(info.captureTime, this.lastTimestamp + 1);
        this.lastTimestamp = timestamp;
        const msg: WorkerRequest = { type: 'frame', frameId, timestamp, bitmap };
        this.worker.postMessage(msg, [bitmap]);
        inFlight.mainThreadMs += performance.now() - t1;
      },
      (err: unknown) => {
        this.inFlight = null;
        this.reportOnce('could not capture a video frame', err);
      },
    );
  }

  private handle(msg: WorkerResponse): void {
    const inFlight = this.inFlight;
    if (msg.type !== 'result' && msg.type !== 'frameError') return;
    if (inFlight?.frameId !== msg.frameId) return;
    this.inFlight = null;
    // The video element still shows the waiting frame, so capture it right away.
    const waiting = this.waiting;
    this.waiting = null;
    if (waiting && this.onFrame) this.submit(waiting);
    if (msg.type === 'frameError') {
      this.reportOnce('inference failed', msg.message);
      return;
    }
    const onFrame = this.onFrame;
    if (!onFrame) return;
    const t0 = performance.now();
    const frame = toHandFrame(msg.result, msg.frameId, inFlight.info.captureTime);
    const doneAt = performance.now();
    onFrame(frame, {
      captureTime: inFlight.info.captureTime,
      hasCaptureTime: inFlight.info.hasCaptureTime,
      inferenceMs: msg.inferenceMs,
      mainThreadMs: inFlight.mainThreadMs + (doneAt - t0),
      doneAt,
      droppedFrames: inFlight.info.droppedFrames,
      skippedFrames: this.skipped,
    });
  }

  private reportOnce(what: string, detail: unknown): void {
    // Keep tracking alive across transient failures, but don't flood the console.
    if (!this.reportedError) console.error(`[tracker] ${what}`, detail);
    this.reportedError = true;
  }
}
