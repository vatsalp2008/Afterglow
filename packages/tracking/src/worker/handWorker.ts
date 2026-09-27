// Runs MediaPipe HandLandmarker off the main thread. Receives transferred
// ImageBitmaps, returns plain landmark data, and closes each bitmap.

import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { packResult } from '../handFrame';
import { createLandmarker } from '../landmarker';
import type { WorkerRequest, WorkerResponse } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let landmarker: HandLandmarker | null = null;

const post = (msg: WorkerResponse) => {
  self.postMessage(msg);
};
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function init(msg: Extract<WorkerRequest, { type: 'init' }>): Promise<void> {
  try {
    const created = await createLandmarker({
      wasmBasePath: msg.wasmBasePath,
      useModule: true,
      ...(msg.modelUrl ? { modelUrl: msg.modelUrl } : {}),
    });
    landmarker = created.landmarker;
    post({ type: 'ready', delegate: created.delegate });
  } catch (err) {
    post({ type: 'initError', message: message(err) });
  }
}

function detect(msg: Extract<WorkerRequest, { type: 'frame' }>): void {
  try {
    if (!landmarker) throw new Error('landmarker not initialized');
    const t0 = performance.now();
    const result = packResult(landmarker.detectForVideo(msg.bitmap, msg.timestamp));
    post({ type: 'result', frameId: msg.frameId, inferenceMs: performance.now() - t0, result });
  } catch (err) {
    post({ type: 'frameError', frameId: msg.frameId, message: message(err) });
  } finally {
    msg.bitmap.close();
  }
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      void init(msg);
      break;
    case 'frame':
      detect(msg);
      break;
    case 'close':
      landmarker?.close();
      self.close();
      break;
  }
};
