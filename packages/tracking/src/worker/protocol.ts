// Messages between the main thread and the hand-tracking worker.

import type { LandmarkResult } from '../handFrame';

export type WorkerRequest =
  | { type: 'init'; wasmBasePath: string; modelUrl?: string }
  | { type: 'frame'; frameId: number; timestamp: number; bitmap: ImageBitmap }
  | { type: 'close' };

export type WorkerResponse =
  | { type: 'ready'; delegate: 'GPU' | 'CPU' }
  | { type: 'initError'; message: string }
  | { type: 'result'; frameId: number; inferenceMs: number; result: LandmarkResult }
  | { type: 'frameError'; frameId: number; message: string };
