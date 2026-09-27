// MediaPipe-backed trackers. Kept behind the "@afterglow/tracking/mediapipe"
// entry point so apps can lazy-load MediaPipe only when the camera is used.

import { MainThreadHandTracker, type CameraTrackerOptions } from './mainThreadTracker';
import type { HandTracker } from './types';
import { WorkerHandTracker } from './workerTracker';

export { MainThreadHandTracker, type CameraTrackerOptions } from './mainThreadTracker';
export { WorkerHandTracker } from './workerTracker';

export interface CreateHandTrackerOptions extends CameraTrackerOptions {
  /** Preferred placement for inference. Falls back to the main thread if the worker can't start. */
  mode: 'worker' | 'main';
}

export async function createHandTracker(opts: CreateHandTrackerOptions): Promise<HandTracker> {
  if (opts.mode === 'worker' && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    try {
      return await WorkerHandTracker.create(opts);
    } catch (err) {
      console.warn('[tracker] worker unavailable, running on the main thread', err);
    }
  }
  return MainThreadHandTracker.create(opts);
}
