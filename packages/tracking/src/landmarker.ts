// Creates a MediaPipe Tasks HandLandmarker. Shared by the main-thread tracker
// and the worker, so both run the same model with the same options.

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export interface LandmarkerOptions {
  /** URL of the directory serving the MediaPipe WASM runtime. */
  wasmBasePath: string;
  /** Load the ES-module build of the WASM loader; required inside module workers. */
  useModule: boolean;
  modelUrl?: string;
  numHands?: number;
}

export async function createLandmarker(
  opts: LandmarkerOptions,
): Promise<{ landmarker: HandLandmarker; delegate: 'GPU' | 'CPU' }> {
  const fileset = await FilesetResolver.forVisionTasks(opts.wasmBasePath, opts.useModule);
  const options = {
    runningMode: 'VIDEO' as const,
    numHands: opts.numHands ?? 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.5,
  };
  const modelAssetPath = opts.modelUrl ?? HAND_MODEL_URL;
  try {
    const landmarker = await HandLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { modelAssetPath, delegate: 'GPU' },
    });
    return { landmarker, delegate: 'GPU' };
  } catch (err) {
    console.warn('[tracker] GPU delegate unavailable, using CPU', err);
    const landmarker = await HandLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { modelAssetPath, delegate: 'CPU' },
    });
    return { landmarker, delegate: 'CPU' };
  }
}
