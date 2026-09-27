// MediaPipe Tasks HandLandmarker on the main thread, driven by
// requestVideoFrameCallback so each camera frame is processed exactly once.
// (Moving this into a worker is a Phase 1 decision; see PLAN.md.)

import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import type { HandFrame, Handedness, TrackedHand } from '../core/types';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const WASM_BASE = `${import.meta.env.BASE_URL}mediapipe`;

export interface TrackerTiming {
  /** Capture time of the frame (performance timebase), or the callback time if the browser doesn't expose it. */
  captureTime: number;
  hasCaptureTime: boolean;
  inferenceMs: number;
  doneAt: number;
}

export type FrameListener = (frame: HandFrame, timing: TrackerTiming) => void;

export class MediaPipeHandTracker {
  private running = false;
  private frameId = 0;
  private lastTimestamp = -1;
  private rvfcHandle = 0;
  private rafHandle = 0;
  private reportedError = false;

  private constructor(
    private landmarker: HandLandmarker,
    readonly delegate: 'GPU' | 'CPU',
  ) {}

  static async create(): Promise<MediaPipeHandTracker> {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    const options = {
      runningMode: 'VIDEO' as const,
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
    };
    try {
      const lm = await HandLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      });
      return new MediaPipeHandTracker(lm, 'GPU');
    } catch (err) {
      console.warn('[tracker] GPU delegate unavailable, using CPU', err);
      const lm = await HandLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
      });
      return new MediaPipeHandTracker(lm, 'CPU');
    }
  }

  start(video: HTMLVideoElement, onFrame: FrameListener): void {
    this.running = true;
    const useRvfc = typeof video.requestVideoFrameCallback === 'function';
    let lastVideoTime = -1;

    const process = (now: number, meta?: VideoFrameCallbackMetadata) => {
      if (!this.running) return;
      if (video.readyState >= 2) {
        const capture = meta?.captureTime;
        // Guard against browsers reporting capture time in another timebase.
        const hasCaptureTime = typeof capture === 'number' && capture <= now && now - capture < 1000;
        const captureTime = hasCaptureTime ? capture : now;
        const timestamp = Math.max(captureTime, this.lastTimestamp + 1);
        this.lastTimestamp = timestamp;
        const t0 = performance.now();
        try {
          const result = this.landmarker.detectForVideo(video, timestamp);
          const doneAt = performance.now();
          onFrame(this.toFrame(result, captureTime), { captureTime, hasCaptureTime, inferenceMs: doneAt - t0, doneAt });
        } catch (err) {
          // Keep the loop alive (e.g. across a transient GPU context loss), but don't flood the console.
          if (!this.reportedError) console.error('[tracker] inference failed', err);
          this.reportedError = true;
        }
      }
      schedule();
    };

    const schedule = () => {
      if (!this.running) return;
      if (useRvfc) {
        this.rvfcHandle = video.requestVideoFrameCallback(process);
        return;
      }
      this.rafHandle = requestAnimationFrame((now) => {
        if (video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          process(now);
        } else schedule();
      });
    };
    schedule();
  }

  stop(video: HTMLVideoElement): void {
    this.running = false;
    if (typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(this.rvfcHandle);
    cancelAnimationFrame(this.rafHandle);
  }

  close(): void {
    this.landmarker.close();
  }

  private toFrame(result: HandLandmarkerResult, captureTime: number): HandFrame {
    const used = new Set<string>();
    const hands: TrackedHand[] = result.landmarks.map((landmarks, i) => {
      const category = result.handedness[i]?.[0];
      // MediaPipe labels assume a mirrored selfie image; we pass the unmirrored frame.
      const handedness: Handedness = category?.categoryName === 'Left' ? 'Right' : 'Left';
      const key = used.has(handedness) ? `${handedness}#${i}` : handedness;
      used.add(key);
      return {
        key,
        handedness,
        score: category?.score ?? 0,
        landmarks: landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      };
    });
    return { frameId: this.frameId++, captureTime, hands };
  }
}
